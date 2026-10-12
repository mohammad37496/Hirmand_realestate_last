#!/bin/sh
# Verifies the Phone Bridge HTTP contract against a running server.
#
#   sh ./scripts/verify-phone-bridge.sh [baseUrl]
#
# The dev server deliberately does not mount /api/* (see the comment in
# vite.config.ts), so pass the URL of a server that does — either a local
# production build or a real deployment:
#
#   PORT=8099 node .output/server/index.mjs &
#   sh ./scripts/verify-phone-bridge.sh http://127.0.0.1:8099
#
# The authenticated half of the flow needs a real PostgreSQL DATABASE_URL. When
# the server has no usable database the authenticated checks are reported as
# SKIPPED rather than as failures, because "the server has no database here" is
# not the same as "the contract is wrong".
set -eu

BASE="${1:-http://127.0.0.1:8080}"
ROOT="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"

cd "$ROOT"

if [ -z "${PHONE_BRIDGE_PAIRING_TOKEN:-}" ]; then
  echo "PHONE_BRIDGE_PAIRING_TOKEN is not set."
  echo "Only the unauthenticated surface will be checked. To run the full flow,"
  echo "create a bootstrap token through the admin panel (action: create_pairing_token)"
  echo "and export its plaintext here."
  echo
fi

node scripts/phone-bridge-e2e.mjs "$BASE"