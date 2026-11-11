#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C COPYFILE_DISABLE=1

usage() {
  cat <<'HELP'
Usage: bash scripts/build-public-release.sh VERSION [--package-only] [--platform PLATFORMS]

Prepare .release-public/VERSION/install/ for a static HTTPS server.
This command never uploads files, pushes images, or creates Git commits.
Default platforms: linux/amd64,linux/arm64. Runtime images use Docker-save gzip.
--package-only creates deployment files without image IDs/bundles and without
releases/latest. It is an INCOMPLETE artifact and cannot install the application.
HELP
}

version=${1:-}
if [[ "$version" == --help || "$version" == -h ]]; then usage; exit 0; fi
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9][A-Za-z0-9.-]*)?$ ]]; then usage >&2; exit 2; fi
shift
package_only=false
platforms=linux/amd64,linux/arm64
while (($#)); do
  case "$1" in
    --package-only) package_only=true; shift ;;
    --platform)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      platforms=$2; shift 2 ;;
    *) usage >&2; exit 2 ;;
  esac
 done
[[ "$platforms" =~ ^linux/(amd64|arm64)(,linux/(amd64|arm64))?$ ]] || { printf 'Unsupported platform selection.\n' >&2; exit 2; }
IFS=, read -r -a platform_list <<< "$platforms"
if [[ ${#platform_list[@]} -eq 2 && ${platform_list[0]} == "${platform_list[1]}" ]]; then
  printf 'Duplicate platform selection.\n' >&2; exit 2
fi

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root"
source_dir="$root/deploy/public"
output="$root/.release-public/$version"
install_dir="$output/install"
release_dir="$install_dir/releases/$version"
staging="$output/deployment"
[[ ! -e "$output" && ! -L "$output" ]] || { printf 'Output already exists: %s. Review it or use a new version.\n' "$output" >&2; exit 1; }
files=(install.sh compose.yml compose.standalone.yml compose.traefik.yml compose.nginx.yml Caddyfile)
entrypoints=(service service-standalone service-traefik service-nginx)
for file in "${files[@]}"; do
  [[ -f "$source_dir/$file" && ! -L "$source_dir/$file" ]] || { printf 'Missing regular deployment file: %s\n' "$file" >&2; exit 1; }
done
for file in "${entrypoints[@]}"; do
  [[ -f "$source_dir/entrypoints/$file" && ! -L "$source_dir/entrypoints/$file" ]] || { printf 'Missing regular entrypoint: %s\n' "$file" >&2; exit 1; }
  bash -n "$source_dir/entrypoints/$file"
done
bash -n "$source_dir/install.sh"

refs=("ghcr.io/0legsan/email-host-api:$version" "ghcr.io/0legsan/email-host-web:$version" "email-host/postgres:$version" "email-host/convex-backend:$version" "email-host/caddy:$version")
if ! "$package_only"; then
  command -v docker >/dev/null || { printf 'Docker is required.\n' >&2; exit 1; }
  command -v bun >/dev/null || { printf 'Bun is required on the build machine.\n' >&2; exit 1; }
  docker info >/dev/null
  docker buildx version >/dev/null
  for reference in "${refs[@]}"; do
    if docker image inspect "$reference" >/dev/null 2>&1; then
      printf 'Refusing to replace an existing local image tag: %s\n' "$reference" >&2
      exit 1
    fi
  done
  bun run --cwd apps/api lint
  bun run --cwd apps/api typecheck
  bun run --cwd apps/web lint
  bun run --cwd apps/web typecheck
fi

mkdir -p "$staging" "$release_dir"
for file in "${files[@]}"; do cp "$source_dir/$file" "$staging/$file"; done
printf '%s\n' "$version" > "$staging/VERSION"
# Serve and archive the same snapshot even if the working source later changes.
cp "$staging/install.sh" "$install_dir/installer.sh"
for file in "${entrypoints[@]}"; do cp "$source_dir/entrypoints/$file" "$install_dir/$file"; done
bash -n "$staging/install.sh"

checksum() {
  if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi
}
archive_files=("${files[@]}" VERSION)
notice_files=()
for notice in "$root/LICENSE" "$root/THIRD_PARTY_NOTICES.md" "$root/docs/third-party/"*; do
  [[ -f "$notice" && ! -L "$notice" ]] || { printf 'Missing regular license notice: %s\n' "$notice" >&2; exit 1; }
  name=${notice##*/}
  [[ "$name" != technical-privacy.md ]] || continue
  [[ "$name" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ && ! -e "$staging/$name" ]] || { printf 'Invalid or duplicated notice filename.\n' >&2; exit 1; }
  cp "$notice" "$staging/$name"
  cp "$notice" "$release_dir/$name"
  archive_files+=("$name")
  notice_files+=("$name")
done
if ! "$package_only"; then
  source_commit=$(git rev-parse HEAD)
  source_dirty=false
  [[ -z $(git status --porcelain --untracked-files=normal) ]] || source_dirty=true
  caddy_digest=$(docker buildx imagetools inspect caddy:2.10.2-alpine --format '{{.Manifest.Digest}}')
  [[ "$caddy_digest" =~ ^sha256:[a-f0-9]{64}$ ]] || { printf 'Cannot resolve the pinned Caddy version.\n' >&2; exit 1; }
  upstream=(
    'postgres@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193'
    'ghcr.io/convex/convex-backend@sha256:467964cc6af57ba3e757e3e6cb1fa09a1c577803a19f03f0f42c9c4b134b070c'
    "caddy@$caddy_digest"
  )
  for platform in "${platform_list[@]}"; do
    architecture=${platform#linux/}
    platform_dir="$release_dir/linux-$architecture"
    mkdir "$platform_dir"
    for component in api web; do
      docker buildx build --platform "$platform" --file "$source_dir/Dockerfile.$component" \
        --tag "ghcr.io/0legsan/email-host-$component:$version" --load .
    done
    for index in 0 1 2; do
      # Classic stores cannot attach two selected platforms to the same index digest.
      # Resolve its pinned child instead; provenance still records the source index.
      child_digest=$(docker buildx imagetools inspect "${upstream[$index]}" --format "{{range .Manifest.Manifests}}{{if and (eq .Platform.OS \"linux\") (eq .Platform.Architecture \"$architecture\")}}{{.Digest}}{{end}}{{end}}")
      [[ "$child_digest" =~ ^sha256:[a-f0-9]{64}$ ]] || { printf 'Cannot resolve a unique pinned platform image.\n' >&2; exit 1; }
      platform_source="${upstream[$index]%@*}@$child_digest"
      docker pull --platform "$platform" "$platform_source"
      docker tag "$platform_source" "${refs[$((index + 2))]}"
    done
    raw_archive="$platform_dir/email-host-images.tar"
    docker image save --platform "$platform" --output "$raw_archive" "${refs[@]}"
    id_file="images-linux-$architecture.ids"
    bun scripts/package-public-images.mjs --version "$version" --platform "$platform" \
      --archive "$raw_archive" --ids "$staging/$id_file" --provenance "$platform_dir/provenance.json" \
      --caddy-source "caddy:2.10.2-alpine@$caddy_digest" --source-commit "$source_commit" --source-dirty "$source_dirty"
    archive_files+=("$id_file")
    gzip -n -c "$raw_archive" > "$platform_dir/email-host-images.tar.gz"
    # This is the temporary raw archive created by this invocation only.
    rm -f -- "$raw_archive"
    (cd "$platform_dir"; checksum email-host-images.tar.gz > email-host-images.tar.gz.sha256)
  done
fi

(
  cd "$staging"
  checksum "${archive_files[@]}" > SHA256SUMS
  tar -czf "$release_dir/email-host-deploy.tar.gz" "${archive_files[@]}" SHA256SUMS
)
(cd "$release_dir"; checksum email-host-deploy.tar.gz > email-host-deploy.tar.gz.sha256)
if "$package_only"; then
  printf 'INCOMPLETE: image bundles and image IDs were not built. No latest channel was created.\n' > "$output/INCOMPLETE.txt"
  printf 'Incomplete deployment artifact prepared at %s. Nothing was published.\n' "$output"
  exit 0
fi

(
  cd "$release_dir"
  assets=(email-host-deploy.tar.gz email-host-deploy.tar.gz.sha256)
  assets+=("${notice_files[@]}")
  for platform in "${platform_list[@]}"; do
    architecture=${platform#linux/}
    assets+=("linux-$architecture/email-host-images.tar.gz" "linux-$architecture/email-host-images.tar.gz.sha256" "linux-$architecture/provenance.json")
  done
  checksum "${assets[@]}" > RELEASE-SHA256SUMS
)
printf '%s\n' "$version" > "$install_dir/releases/latest"
printf 'Local static release prepared at %s. Nothing was published.\n' "$install_dir"
