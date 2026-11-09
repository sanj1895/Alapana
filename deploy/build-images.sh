#!/usr/bin/env bash
# Build Alapana's three images and load them into the kind cluster.
#
#   deploy/build-images.sh           tag "local" (what deploy/k8s uses)
#   deploy/build-images.sh v2        another tag; set it in deploy/k8s/kustomization.yaml too
#
# The pods use imagePullPolicy: Never, so they only ever run images loaded here.
set -euo pipefail
cd "$(dirname "$0")/.."

TAG="${1:-local}"
CLUSTER="${KIND_CLUSTER:-alapana}"

# Public key; Vite inlines it into the bundle. Read from the environment or .env.
PK="${VITE_CLERK_PUBLISHABLE_KEY:-}"
if [[ -z "$PK" && -f .env ]]; then
  PK="$(grep -E '^VITE_CLERK_PUBLISHABLE_KEY=' .env | head -1 | cut -d= -f2- || true)"
fi
if [[ -z "$PK" ]]; then
  echo "Set VITE_CLERK_PUBLISHABLE_KEY in .env or the environment." >&2
  exit 1
fi

docker build -t "alapana/gateway:$TAG" gateway
docker build -t "alapana/api:$TAG" -f Dockerfile.api .
docker build -t "alapana/web:$TAG" -f Dockerfile.web --build-arg VITE_CLERK_PUBLISHABLE_KEY="$PK" .

if [[ "${SKIP_KIND_LOAD:-}" == 1 ]]; then
  echo "Built alapana/{gateway,api,web}:$TAG (not loaded into kind)."
  exit 0
fi
kind load docker-image --name "$CLUSTER" "alapana/gateway:$TAG" "alapana/api:$TAG" "alapana/web:$TAG"
echo "Loaded alapana/{gateway,api,web}:$TAG into kind cluster '$CLUSTER'."
