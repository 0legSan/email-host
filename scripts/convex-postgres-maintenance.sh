#!/usr/bin/env bash

set -Eeuo pipefail

mode="${1:-audit}"
backup_directory="${2:-}"

case "$mode" in
  audit|tune|compact) ;;
  *)
    printf 'Usage: %s audit|tune|compact [verified-backup-directory]\n' "$0" >&2
    exit 2
    ;;
esac

cd "$(dirname "$0")/.."
postgres_container="$(docker compose ps -q convex-postgres)"
if [[ -z "$postgres_container" ]]; then
  printf 'Convex PostgreSQL must be running\n' >&2
  exit 1
fi

psql() {
  docker exec -i "$postgres_container" sh -lc \
    'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
}

if [[ "$mode" == "audit" ]]; then
  psql <<'SQL'
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
SELECT pg_size_pretty(pg_database_size(current_database())) AS database_size;
SELECT relname,
       pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
       n_live_tup, n_dead_tup, last_autovacuum
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
SELECT indexrelname,
       pg_size_pretty(pg_relation_size(pg_stat_user_indexes.indexrelid)) AS size,
       indisvalid, indisready
FROM pg_stat_user_indexes
JOIN pg_index ON pg_index.indexrelid = pg_stat_user_indexes.indexrelid
ORDER BY pg_relation_size(pg_stat_user_indexes.indexrelid) DESC;
SELECT relname, reloptions
FROM pg_class
WHERE oid IN ('public.documents'::regclass, 'public.indexes'::regclass);
COMMIT;
SQL
  exit 0
fi

# A concurrent maintenance run could invalidate size comparisons and duplicate I/O.
exec 9>/run/email-host-convex-postgres-maintenance.lock
if ! flock -n 9; then
  printf 'Another Convex PostgreSQL maintenance operation is running\n' >&2
  exit 1
fi

if [[ "$mode" == "tune" ]]; then
  psql <<'SQL'
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.documents SET (autovacuum_vacuum_scale_factor = 0.05);
ALTER TABLE public.indexes SET (autovacuum_vacuum_scale_factor = 0.05);
COMMIT;
SQL
  exit 0
fi

if [[ -z "$backup_directory" ]]; then
  printf 'compact requires a verified backup directory\n' >&2
  exit 2
fi

for archive in postgres.dump convex-export.zip config.before.tar.gz archives.sha256; do
  if [[ ! -s "$backup_directory/$archive" ]]; then
    printf 'Required backup file is missing or empty: %s\n' "$archive" >&2
    exit 1
  fi
done

backup_age_seconds=$(( $(date +%s) - $(stat -c %Y "$backup_directory/postgres.dump") ))
if (( backup_age_seconds < 0 || backup_age_seconds > 86400 )); then
  printf 'The PostgreSQL backup must be less than 24 hours old\n' >&2
  exit 1
fi
sha256sum --check "$backup_directory/archives.sha256"

# TRUNCATE FALSE avoids VACUUM's optional exclusive lock at the end of a table.
# Concurrent reindexing preserves each SQL index definition and permits normal reads/writes.
psql <<'SQL'
SET lock_timeout = '5s';
SET statement_timeout = '30min';
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_index
    WHERE indrelid IN ('public.documents'::regclass, 'public.indexes'::regclass)
      AND (NOT indisvalid OR NOT indisready)
  ) THEN
    RAISE EXCEPTION 'An invalid or unfinished SQL index exists; inspect it before maintenance';
  END IF;
END;
$$;
VACUUM (ANALYZE, TRUNCATE FALSE) public.documents, public.indexes;
REINDEX INDEX CONCURRENTLY public.indexes_pkey;
REINDEX INDEX CONCURRENTLY public.indexes_by_index_id_key_prefix_key_sha256;
REINDEX INDEX CONCURRENTLY public.documents_pkey;
REINDEX INDEX CONCURRENTLY public.documents_by_table_and_id;
REINDEX INDEX CONCURRENTLY public.documents_by_table_ts_and_id;
SQL

printf 'PostgreSQL maintenance completed. Run audit to compare relation sizes.\n'
