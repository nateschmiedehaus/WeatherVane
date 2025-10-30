#!/usr/bin/env bash
set -euo pipefail

EPIC_ID="${1:-}"
if [[ -z "${EPIC_ID}" ]]; then
  echo "Usage: $0 <EPIC-ID>" >&2
  exit 2
fi

ROOT="$(pwd)"
PACK_DIR="${ROOT}/tests/epics/${EPIC_ID}"
REPORT="${ROOT}/state/evidence/${EPIC_ID}/verify/epic_testpack_report.json"

mkdir -p "$(dirname "$REPORT")"

if [[ ! -d "$PACK_DIR" ]]; then
  echo "{\"ok\":true,\"note\":\"no epic testpack found\"}" > "$REPORT"
  echo "$REPORT"
  exit 0
fi

# Lightweight harness: run any *.sh executables; treat non-zero as failure.
OK=true
DETAILS=()
shopt -s nullglob
for test in "$PACK_DIR"/*.sh; do
  if [[ -x "$test" ]]; then
    if "$test"; then
      DETAILS+=("{\"name\":\"$(basename "$test")\",\"ok\":true}")
    else
      DETAILS+=("{\"name\":\"$(basename "$test")\",\"ok\":false}")
      OK=false
    fi
  fi
done

printf '{"ok":%s,"details":[%s]}' \
  "$OK" "$(IFS=, ; echo "${DETAILS[*]:-}")" > "$REPORT"
echo "$REPORT"
[[ "$OK" == "true" ]] || exit 1

