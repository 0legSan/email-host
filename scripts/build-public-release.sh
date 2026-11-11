#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C COPYFILE_DISABLE=1

usage() {
  cat <<'EOF'
Usage: bash scripts/build-public-release.sh VERSION [--package-only] [--platform PLATFORMS]

Prepare a local public release. This command never pushes images or Git commits.
Default platforms: linux/amd64,linux/arm64. Application images are OCI archives.
--package-only validates and packages deployment files without building images.
It does not produce a complete release.
EOF
}

version=${1:-}
if [[ "$version" == --help || "$version" == -h ]]; then usage; exit 0; fi
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$ ]]; then
  usage >&2
  exit 2
fi
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
[[ "$platforms" =~ ^linux/(amd64|arm64)(,linux/(amd64|arm64))?$ ]] || {
  printf 'Unsupported platform selection.\n' >&2; exit 2;
}

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root"
source_dir="$root/deploy/public"
output="$root/.release-public/$version"
[[ ! -e "$output" ]] || {
  printf 'Output already exists: %s. Use a new version or review the existing output.\n' "$output" >&2
  exit 1
}
files=(install.sh compose.yml compose.standalone.yml compose.traefik.yml compose.nginx.yml Caddyfile)
for file in "${files[@]}"; do
  [[ -f "$source_dir/$file" && ! -L "$source_dir/$file" ]] || {
    printf 'Missing regular deployment file: %s\n' "$file" >&2; exit 1;
  }
done
bash -n "$source_dir/install.sh"

if ! "$package_only"; then
  command -v docker >/dev/null || { printf 'Docker is required.\n' >&2; exit 1; }
  docker buildx version >/dev/null
  # These checks precede image builds so broken source cannot become a release.
  bun run --cwd apps/web lint
  bun run --cwd apps/web typecheck
fi

mkdir -p "$output/deployment"
for file in "${files[@]}"; do cp "$source_dir/$file" "$output/deployment/$file"; done
printf '%s\n' "$version" > "$output/deployment/VERSION"

checksum() {
  if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi
}
(
  cd "$output/deployment"
  checksum "${files[@]}" VERSION > SHA256SUMS
  tar -czf ../email-host-deploy.tar.gz "${files[@]}" VERSION SHA256SUMS
)
(
  cd "$output"
  checksum email-host-deploy.tar.gz > email-host-deploy.tar.gz.sha256
)

if "$package_only"; then
  printf 'Deployment archive prepared at %s. Images were NOT built.\n' "$output"
  exit 0
fi

for component in api web; do
  docker buildx build --platform "$platforms" \
    --file "$source_dir/Dockerfile.$component" \
    --tag "ghcr.io/0legsan/email-host-$component:$version" \
    --output "type=oci,dest=$output/email-host-$component.oci.tar" .
done
(
  cd "$output"
  checksum email-host-deploy.tar.gz email-host-api.oci.tar email-host-web.oci.tar > RELEASE-SHA256SUMS
)
printf 'Local release prepared at %s. Nothing was published.\n' "$output"
