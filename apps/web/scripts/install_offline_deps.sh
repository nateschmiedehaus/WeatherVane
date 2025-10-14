#!/usr/bin/env bash
#
# Install apps/web Node dependencies from a pre-populated offline cache.
# The cache must contain npm-style _cacache artifacts for every dependency
# declared in package.json plus its transitive closure.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CACHE_DIR="${APP_DIR}/offline-cache"
AUDIT_SCRIPT="${APP_DIR}/scripts/audit_offline_cache.py"
MISSING_FILE="${CACHE_DIR}/missing-packages.txt"

if [[ ! -d "${CACHE_DIR}" ]]; then
  echo "offline cache missing at ${CACHE_DIR}" >&2
  echo "Populate the cache before invoking this script." >&2
  exit 1
fi

if [[ ! -f "${AUDIT_SCRIPT}" ]]; then
  echo "offline cache audit script missing at ${AUDIT_SCRIPT}" >&2
  exit 1
fi

echo "Auditing offline cache contents..."
if ! python3 "${AUDIT_SCRIPT}" --cache "${CACHE_DIR}" --write-missing "${MISSING_FILE}"; then
  echo
  echo "Offline cache is incomplete. Populate missing packages listed in ${MISSING_FILE} and retry." >&2
  exit 1
fi

export npm_config_cache="${CACHE_DIR}"
export npm_config_offline="true"
export npm_config_progress="false"

echo "Installing apps/web dependencies from ${CACHE_DIR}..."
npm install --prefix "${APP_DIR}"
