#!/bin/sh
set -eu

# Restrict the value before embedding it in executable JavaScript.
case "${CONVEX_PUBLIC_URL:-}" in
  https://*) domain=${CONVEX_PUBLIC_URL#https://} ;;
  *) echo 'CONVEX_PUBLIC_URL must be an HTTPS origin' >&2; exit 1 ;;
esac
if ! printf '%s\n' "$domain" | LC_ALL=C grep -Eq '^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z][a-zA-Z0-9-]*$'; then
  echo 'CONVEX_PUBLIC_URL must contain only a DNS name without a path or port' >&2
  exit 1
fi
if [ "${#domain}" -gt 253 ]; then
  echo 'CONVEX_PUBLIC_URL DNS name is too long' >&2
  exit 1
fi
printf 'window.__EMAIL_HOST_CONFIG__ = {"convexUrl":"https://%s"};\n' "$domain" > /usr/share/nginx/html/runtime-config.js
