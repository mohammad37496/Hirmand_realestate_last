#!/bin/sh
# Runs the admin visual/accessibility audit against the dev preview server.
set -eu
cd "$(dirname "$0")/.."
QA_BASE_URL="${QA_BASE_URL:-http://127.0.0.1:8080}" node scripts/admin-visual-audit.mjs
