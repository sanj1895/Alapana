#!/usr/bin/env bash
# Create (or update) the alapana-secrets Secret from .env and your gcloud login.
# Secrets never go in git, so Argo CD does not manage this; run it once per cluster.
#
#   deploy/create-secret.sh
#
# GOOGLE_CREDENTIALS_B64 is your `gcloud auth application-default login`
# credentials, base64-encoded: the same format Vercel uses, read by both the
# gateway and the api/ functions.
set -euo pipefail
cd "$(dirname "$0")/.."

NAMESPACE=alapana
ADC="${GOOGLE_APPLICATION_CREDENTIALS:-$HOME/.config/gcloud/application_default_credentials.json}"

env_value() { grep -E "^$1=" .env | head -1 | cut -d= -f2- || true; }

CLERK_SECRET_KEY="$(env_value CLERK_SECRET_KEY)"
AGENT_ENGINE_RESOURCE="$(env_value AGENT_ENGINE_RESOURCE)"
if [[ -z "$CLERK_SECRET_KEY" ]]; then
  echo "CLERK_SECRET_KEY is missing from .env." >&2
  exit 1
fi
if [[ ! -f "$ADC" ]]; then
  echo "No Google credentials at $ADC. Run: gcloud auth application-default login" >&2
  exit 1
fi

kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
kubectl -n "$NAMESPACE" create secret generic alapana-secrets \
  --from-literal=CLERK_SECRET_KEY="$CLERK_SECRET_KEY" \
  --from-literal=AGENT_ENGINE_RESOURCE="$AGENT_ENGINE_RESOURCE" \
  --from-literal=GOOGLE_CREDENTIALS_B64="$(base64 < "$ADC" | tr -d '\n')" \
  --dry-run=client -o yaml | kubectl apply -f -
