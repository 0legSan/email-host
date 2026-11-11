#!/usr/bin/env bash

set -Eeuo pipefail

mode="${1:-audit}"
cleanup_grace_seconds="${CONVEX_STORAGE_CLEANUP_GRACE_SECONDS:-172800}"

if [[ "$mode" != "audit" && "$mode" != "clean" ]]; then
  printf 'Usage: %s audit|clean\n' "$0" >&2
  exit 2
fi

if [[ ! "$cleanup_grace_seconds" =~ ^[0-9]+$ ]]; then
  printf 'CONVEX_STORAGE_CLEANUP_GRACE_SECONDS must be a non-negative integer\n' >&2
  exit 2
fi

postgres_container="$(docker compose ps -q convex-postgres)"
backend_container="$(docker compose ps -q convex-backend)"

if [[ -z "$postgres_container" || -z "$backend_container" ]]; then
  printf 'Convex PostgreSQL and backend containers must be running\n' >&2
  exit 1
fi

data_dir="$(
  docker inspect \
    --format '{{range .Mounts}}{{if eq .Destination "/convex/data"}}{{.Source}}{{end}}{{end}}' \
    "$backend_container"
)"

case "$data_dir" in
  /var/lib/docker/volumes/*/_data) ;;
  *)
    printf 'Refusing to operate on unexpected Convex data path: %s\n' "$data_dir" >&2
    exit 1
    ;;
esac

search_dir="$data_dir/storage/search"
tmp_dir="$data_dir/tmp"

if [[ ! -d "$search_dir" || ! -d "$tmp_dir" ]]; then
  printf 'Expected Convex storage directories are missing under %s\n' "$data_dir" >&2
  exit 1
fi

referenced_keys_file="$(mktemp /tmp/convex-search-references.XXXXXX)"
search_candidates_file="$(mktemp /tmp/convex-search-candidates.XXXXXX)"
tmp_candidates_file="$(mktemp /tmp/convex-tmp-candidates.XXXXXX)"
trap 'rm -f "$referenced_keys_file" "$search_candidates_file" "$tmp_candidates_file"' EXIT

docker exec -i "$postgres_container" sh -lc \
  'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At' \
  >"$referenced_keys_file" <<'SQL'
WITH table_registry_key AS (
  SELECT trim(both '"' from convert_from(json_value, 'UTF8')) AS value
  FROM persistence_globals
  WHERE key = 'tables_table_id'
),
table_registry AS (
  SELECT decode(
    translate(
      value || repeat('=', (4 - length(value) % 4) % 4),
      '-_',
      '+/'
    ),
    'base64'
  ) AS id
  FROM table_registry_key
),
index_table AS (
  SELECT documents.id
  FROM documents
  CROSS JOIN table_registry
  WHERE documents.table_id = table_registry.id
    AND NOT documents.deleted
    AND convert_from(documents.json_value, 'UTF8')::jsonb ->> 'name' = '_index'
  ORDER BY documents.ts DESC
  LIMIT 1
),
search_documents AS (
  SELECT convert_from(documents.json_value, 'UTF8')::jsonb AS value
  FROM documents
  CROSS JOIN index_table
  WHERE documents.table_id = index_table.id
    AND convert_from(documents.json_value, 'UTF8')::jsonb #>> '{config,type}' = 'search'
),
segments AS (
  SELECT jsonb_array_elements(
    value #> '{config,onDiskState,data,segments}'
  ) AS value
  FROM search_documents
)
SELECT DISTINCT storage_key.value
FROM segments
CROSS JOIN LATERAL (
  VALUES
    (segments.value ->> 'segment_key'),
    (segments.value ->> 'alive_bitset_key'),
    (segments.value ->> 'deleted_terms_table_key'),
    (segments.value ->> 'id_tracker_key')
) AS storage_key(value)
WHERE storage_key.value IS NOT NULL;
SQL

current_epoch="$(date +%s)"

find "$search_dir" -type f -name '*.blob' -printf '%f|%s|%T@\n' |
  awk \
    -F '|' \
    -v current_epoch="$current_epoch" \
    -v grace_seconds="$cleanup_grace_seconds" \
    -v search_dir="$search_dir" \
    '
      FNR == NR {
        referenced[$1] = 1
        next
      }
      {
        storage_key = $1
        sub(/\.blob$/, "", storage_key)
        age_seconds = current_epoch - $3
        if (!(storage_key in referenced) && age_seconds >= grace_seconds) {
          printf "%s/%s|%s\n", search_dir, $1, $2
        }
      }
    ' \
    "$referenced_keys_file" - >"$search_candidates_file"

backend_started_at="$(docker inspect --format '{{.State.StartedAt}}' "$backend_container")"

find "$tmp_dir" \
  -mindepth 1 \
  -maxdepth 1 \
  -type d \
  -name '.tmp*' \
  ! -newermt "$backend_started_at" \
  -print >"$tmp_candidates_file"

search_total_bytes="$(find "$search_dir" -type f -name '*.blob' -printf '%s\n' | awk '{ total += $1 } END { print total + 0 }')"
search_total_count="$(find "$search_dir" -type f -name '*.blob' | wc -l | tr -d ' ')"
referenced_count="$(wc -l <"$referenced_keys_file" | tr -d ' ')"
search_candidate_count="$(wc -l <"$search_candidates_file" | tr -d ' ')"
search_candidate_bytes="$(awk -F '|' '{ total += $2 } END { print total + 0 }' "$search_candidates_file")"
tmp_candidate_count="$(wc -l <"$tmp_candidates_file" | tr -d ' ')"
tmp_candidate_bytes=0

while IFS= read -r directory; do
  [[ -n "$directory" ]] || continue
  directory_bytes="$(du -sb "$directory" | awk '{ print $1 }')"
  tmp_candidate_bytes=$((tmp_candidate_bytes + directory_bytes))
done <"$tmp_candidates_file"

print_mib() {
  awk -v bytes="$1" 'BEGIN { printf "%.1f", bytes / 1048576 }'
}

printf 'Convex storage audit\n'
printf '  Search storage: %s files, %s MiB\n' \
  "$search_total_count" \
  "$(print_mib "$search_total_bytes")"
printf '  Search keys referenced by retained database history: %s\n' "$referenced_count"
printf '  Unreferenced search blobs older than %s seconds: %s files, %s MiB\n' \
  "$cleanup_grace_seconds" \
  "$search_candidate_count" \
  "$(print_mib "$search_candidate_bytes")"
printf '  Temporary directories from previous backend processes: %s directories, %s MiB\n' \
  "$tmp_candidate_count" \
  "$(print_mib "$tmp_candidate_bytes")"

if [[ "$mode" == "audit" ]]; then
  exit 0
fi

while IFS='|' read -r file_path _; do
  [[ -n "$file_path" ]] || continue
  case "$file_path" in
    "$search_dir"/*.blob) rm -- "$file_path" ;;
    *)
      printf 'Refusing to delete unexpected search path: %s\n' "$file_path" >&2
      exit 1
      ;;
  esac
done <"$search_candidates_file"

while IFS= read -r directory; do
  [[ -n "$directory" ]] || continue
  case "$directory" in
    "$tmp_dir"/.tmp*) rm -rf -- "$directory" ;;
    *)
      printf 'Refusing to delete unexpected temporary path: %s\n' "$directory" >&2
      exit 1
      ;;
  esac
done <"$tmp_candidates_file"

printf 'Cleanup completed: %s MiB reclaimed from unreferenced search blobs and %s MiB from stale temporary directories.\n' \
  "$(print_mib "$search_candidate_bytes")" \
  "$(print_mib "$tmp_candidate_bytes")"
