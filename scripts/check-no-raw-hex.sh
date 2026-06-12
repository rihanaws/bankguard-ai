#!/usr/bin/env bash
# CI build-fail gate: raw hex colors are forbidden in component/app code.
# The ONLY place hex values may exist is the @theme token block in
# app/globals.css. Everything else must use semantic tokens
# (--color-ink-*, --color-brand-*, --color-risk-*, --color-conf-*, --color-tier-*).
set -euo pipefail

VIOLATIONS=$(grep -rEn '#[0-9a-fA-F]{3,6}\b' \
  --include='*.ts' --include='*.tsx' --include='*.css' \
  components/ app/ lib/ workflows/ 2>/dev/null \
  | grep -v 'app/globals.css' || true)

if [ -n "$VIOLATIONS" ]; then
  echo "BUILD FAIL — raw hex values found outside the token file:"
  echo "$VIOLATIONS"
  exit 1
fi
echo "Token check passed — no raw hex outside app/globals.css."
