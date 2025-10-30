#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [[ -z "${ROOT_DIR}" ]]; then
  echo "[checkpoint] Unable to determine repo root (git rev-parse failed)" >&2
  exit 1
fi

cd "${ROOT_DIR}"

usage() {
  cat <<'EOF'
Usage: scripts/validate_checkpoint.sh [options]

Options:
  --task-id <id>          Task identifier to validate evidence under state/evidence/<id>/
  --require-phase <name>  Restrict evidence check to specific phases (repeatable)
  --skip-integrity        Skip running tools/wvo_mcp/scripts/run_integrity_tests.sh
  --skip-todo-scan        Skip TODO/FIXME/HACK/XXX scan
  --skip-evidence         Skip evidence file validation
  -h, --help              Show this help

Phases: STRATEGIZE, SPEC, PLAN, THINK, IMPLEMENT, VERIFY, REVIEW, PR, MONITOR
Exit status is non-zero if any enabled check fails.
EOF
}

TASK_ID=""
SKIP_INTEGRITY=0
SKIP_TODO=0
SKIP_EVIDENCE=0
declare -a REQUIRED_PHASES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --task-id)
      [[ $# -ge 2 ]] || { echo "[checkpoint] --task-id expects an argument" >&2; usage; exit 1; }
      TASK_ID="$2"
      shift 2
      ;;
    --require-phase)
      [[ $# -ge 2 ]] || { echo "[checkpoint] --require-phase expects an argument" >&2; usage; exit 1; }
      REQUIRED_PHASES+=("$(echo "$2" | tr '[:lower:]' '[:upper:]')")
      shift 2
      ;;
    --skip-integrity)
      SKIP_INTEGRITY=1
      shift
      ;;
    --skip-todo-scan)
      SKIP_TODO=1
      shift
      ;;
    --skip-evidence)
      SKIP_EVIDENCE=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "[checkpoint] Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

ALL_PHASES=(STRATEGIZE SPEC PLAN THINK IMPLEMENT VERIFY REVIEW PR MONITOR)

ALLOW_PATHS=()
ALLOW_PATTERNS=()

if [[ ${#REQUIRED_PHASES[@]} -eq 0 ]]; then
  REQUIRED_PHASES=("${ALL_PHASES[@]}")
fi

EXIT_CODE=0

log_section() {
  echo
  echo "== $1 =="
}

run_integrity() {
  if [[ ${SKIP_INTEGRITY} -eq 1 ]]; then
    echo "[checkpoint] Skipping integrity suite (--skip-integrity supplied)"
    return
  fi

  log_section "Running integrity suite"
  if ! bash tools/wvo_mcp/scripts/run_integrity_tests.sh; then
    echo "[checkpoint] Integrity suite failed" >&2
    EXIT_CODE=1
  fi
}

load_allowlist() {
  local file="config/checkpoint_todo_allowlist.txt"
  ALLOW_PATHS=()
  ALLOW_PATTERNS=()

  if [[ -f "${file}" ]]; then
    while IFS='|' read -r path pattern; do
      [[ -z "${path}" || "${path}" =~ ^# ]] && continue
      ALLOW_PATHS+=("${path}")
      ALLOW_PATTERNS+=("${pattern}")
    done < "${file}"
  else
    echo "[checkpoint] Allowlist ${file} not found; TODO scan will flag all markers" >&2
  fi
}

todo_scan() {
  if [[ ${SKIP_TODO} -eq 1 ]]; then
    echo "[checkpoint] Skipping TODO scan (--skip-todo-scan supplied)"
    return
  fi

  if ! command -v rg >/dev/null 2>&1; then
    echo "[checkpoint] ripgrep (rg) is required for TODO scan" >&2
    EXIT_CODE=1
    return
  fi

  log_section "Scanning for TODO/FIXME/HACK/XXX markers"

  MATCHES=()
  while IFS= read -r line; do
    [[ -z "${line}" ]] && continue
    MATCHES+=("${line}")
  done < <(rg --no-heading --line-number '(TODO|FIXME|HACK|XXX)' \
    apps shared tools/wvo_mcp/src \
    --max-filesize 200K \
    --glob '!**/node_modules/**' \
    --glob '!**/dist/**' \
    --glob '!**/build/**' \
    --glob '!**/coverage/**' \
    --glob '!**/__tests__/**' \
    --glob '!**/test/**' \
    --glob '!**/*.test.ts' \
    --glob '!**/*.test.tsx' \
    --glob '!**/*.spec.ts' \
    --glob '!**/*.spec.tsx' \
    --glob '!**/*.test.js' \
    --glob '!**/*.spec.js' \
    --glob '!**/*.md' \
    --glob '!**/playwright-report/**' \
    --glob '!apps/web/offline-cache/**' \
    --glob '!**/package-lock.json' \
    --glob '!**/npm-shrinkwrap.json' \
    --glob '!**/pnpm-lock.yaml' \
    --glob '!**/yarn.lock' \
    --glob '!**/Cargo.lock' \
    --glob '!**/poetry.lock' || true)

  if [[ ${#MATCHES[@]} -eq 0 ]]; then
    echo "[checkpoint] No TODO markers detected"
    return
  fi

  load_allowlist
  local -a VIOLATIONS=()

  for entry in "${MATCHES[@]}"; do
    local path line rest content allowed
    path=${entry%%:*}
    rest=${entry#":"}
    line=${rest%%:*}
    content=${entry#*:*:}
    allowed=0

    for i in "${!ALLOW_PATHS[@]}"; do
      if [[ "${path}" == "${ALLOW_PATHS[$i]}" ]] && [[ "${content}" == *"${ALLOW_PATTERNS[$i]}"* ]]; then
        allowed=1
        break
      fi
    done

    if [[ ${allowed} -eq 0 ]]; then
      VIOLATIONS+=("${path}:${line}:${content}")
    fi
  done

  if [[ ${#VIOLATIONS[@]} -gt 0 ]]; then
    echo "[checkpoint] New TODO markers detected (not in allowlist):" >&2
    for v in "${VIOLATIONS[@]}"; do
      echo "  - ${v}" >&2
    done
    EXIT_CODE=1
  else
    echo "[checkpoint] TODO scan passed (no new markers)"
  fi
}

phase_artifact_path() {
  local phase="$1"
  case "${phase}" in
    STRATEGIZE) echo "strategize/strategy.md" ;;
    SPEC) echo "spec/spec.md" ;;
    PLAN) echo "plan/plan.md" ;;
    THINK) echo "think/edge_cases.md" ;;
    IMPLEMENT) echo "implement/git_diff.patch" ;;
    VERIFY) echo "verify/test_results.json" ;;
    REVIEW) echo "review/review_rubric.json" ;;
    PR) echo "pr/pr_summary.md" ;;
    MONITOR) echo "monitor/monitoring_notes.md" ;;
    *) return 1 ;;
  esac
}

evidence_check() {
  if [[ ${SKIP_EVIDENCE} -eq 1 ]]; then
    echo "[checkpoint] Skipping evidence verification (--skip-evidence supplied)"
    return
  fi

  if [[ -z "${TASK_ID}" ]]; then
    echo "[checkpoint] No --task-id supplied; skipping evidence verification"
    return
  fi

  log_section "Verifying evidence for task ${TASK_ID}"
  local base="state/evidence/${TASK_ID}"

  if [[ ! -d "${base}" ]]; then
    echo "[checkpoint] Evidence directory ${base} not found" >&2
    EXIT_CODE=1
    return
  fi

  for phase in "${REQUIRED_PHASES[@]}"; do
    local rel
    rel=$(phase_artifact_path "${phase}") || {
      echo "[checkpoint] Unknown phase ${phase}" >&2
      EXIT_CODE=1
      continue
    }
    local file="${base}/${rel}"
    if [[ ! -s "${file}" ]]; then
      echo "[checkpoint] Missing evidence for ${phase}: ${file}" >&2
      EXIT_CODE=1
    else
      echo "[checkpoint] ${phase} evidence OK (${file})"
    fi
  done
}

run_integrity
todo_scan
evidence_check

if [[ ${EXIT_CODE} -ne 0 ]]; then
  echo "[checkpoint] Validation FAILED" >&2
else
  echo
  echo "[checkpoint] Validation PASSED"
fi

exit ${EXIT_CODE}
