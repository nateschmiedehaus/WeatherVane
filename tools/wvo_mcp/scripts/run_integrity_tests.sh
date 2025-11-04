#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

mkdir -p "$ROOT_DIR/state/automation"

if [[ -z "${PYTHON_BIN:-}" ]]; then
  PYTHON_BIN="$(. "$ROOT_DIR/scripts/python_toolchain.sh")"
fi

DEFAULT_REQUIREMENTS_FILE="requirements-test.txt"
if [[ ! -f "$DEFAULT_REQUIREMENTS_FILE" ]]; then
  DEFAULT_REQUIREMENTS_FILE="requirements.txt"
fi
if [[ "$(uname -s 2>/dev/null)" == "Darwin" && "$(uname -m 2>/dev/null)" == "arm64" ]]; then
  DEFAULT_REQUIREMENTS_FILE="requirements/apple-silicon.lock"
fi
PYTHON_REQUIREMENTS_FILE="${INTEGRITY_REQUIREMENTS_FILE:-$DEFAULT_REQUIREMENTS_FILE}"
WHEELS_DIR="${INTEGRITY_WHEELS_DIR:-$ROOT_DIR/.wheels}"

function section() {
  printf '\n== %s ==\n' "$1"
}

FAILED=0
declare -a SECTION_RESULTS=()

function record_result() {
  local name="$1"
  local status="$2"
  SECTION_RESULTS+=("$name:$status")
}

function run_stage() {
  local name="$1"
  shift
  section "$name"
  if "$@"; then
    echo "[integrity] ${name} ✅"
    record_result "$name" "ok"
  else
    local code=$?
    echo "[integrity] ${name} ❌ (exit ${code})"
    record_result "$name" "fail (${code})"
    FAILED=1
  fi
}

function bootstrap_python() {
  if [[ "${INTEGRITY_SKIP_PYTHON_BOOTSTRAP:-0}" == "1" ]]; then
    echo "[integrity] Skipping Python dependency bootstrap (INTEGRITY_SKIP_PYTHON_BOOTSTRAP=1)"
    return 0
  fi

  local offline="${INTEGRITY_OFFLINE:-0}"
  local prefer_wheels="${INTEGRITY_PREFER_WHEELS:-1}"
  local pip_args=()

  if [[ "$prefer_wheels" == "1" ]]; then
    local has_cache=0
    if [[ -d "$WHEELS_DIR" ]]; then
      if find "$WHEELS_DIR" -maxdepth 1 -name "*.whl" -print -quit | grep -q .; then
        has_cache=1
      fi
    fi

    if [[ "$has_cache" == "0" ]]; then
      if [[ "$offline" == "1" ]]; then
        echo "[integrity] Offline mode requested but wheel cache missing at $WHEELS_DIR"
        echo "[integrity] Populate the cache (pip download -r $PYTHON_REQUIREMENTS_FILE -d $WHEELS_DIR) before running offline."
        return 1
      fi

      echo "[integrity] Wheel cache missing – downloading dependencies into $WHEELS_DIR"
      mkdir -p "$WHEELS_DIR"
      if "$PYTHON_BIN" -m pip download -r "$PYTHON_REQUIREMENTS_FILE" -d "$WHEELS_DIR"; then
        echo "[integrity] Wheel cache populated successfully"
        has_cache=1
      else
        echo "[integrity] Failed to populate wheel cache; falling back to PyPI installs"
        prefer_wheels=0
      fi
    fi

    if [[ "$has_cache" == "1" && "$prefer_wheels" == "1" ]]; then
      echo "[integrity] Installing Python deps from wheel cache at $WHEELS_DIR"
      pip_args+=(--no-index "--find-links" "$WHEELS_DIR")
    fi
  fi

  if [[ "$prefer_wheels" != "1" ]]; then
    if [[ "$offline" == "1" ]]; then
      echo "[integrity] Offline mode forbids PyPI installs and wheel cache creation failed"
      return 1
    fi
    echo "[integrity] Installing Python deps directly from PyPI"
  fi

  pip_args+=(-r "$PYTHON_REQUIREMENTS_FILE")
  "$PYTHON_BIN" -m pip install "${pip_args[@]}"
}

run_stage "Python dependency bootstrap" bootstrap_python

run_stage "Python test suite" env PYTHONPATH=".deps:." "$PYTHON_BIN" -m pytest apps tests

run_stage "Autopilot vitest suite" node tools/oss_autopilot/scripts/run_vitest.mjs --run --scope=autopilot

run_stage "Tracing smoke (telemetry)" node tools/wvo_mcp/scripts/tracing_smoke.mjs

run_stage "Telemetry parity check" node --import tsx ./tools/wvo_mcp/scripts/check_telemetry_parity.ts --quiet --workspace-root "$ROOT_DIR"

run_stage "Telemetry alert evaluation" node scripts/evaluate_alerts.mjs --workspace-root "$ROOT_DIR"

run_stage "Telemetry metrics dashboard" node scripts/render_metrics_dashboard.mjs --workspace-root "$ROOT_DIR" --json-only --output state/telemetry/dashboard.json

run_stage "Quality graph health check" node --import tsx ./tools/wvo_mcp/scripts/check_quality_graph.ts --workspace-root "$ROOT_DIR"

run_stage "Quality graph precision" node --import tsx ./tools/wvo_mcp/scripts/check_quality_graph_precision.ts --workspace-root "$ROOT_DIR" --min-corpus 50 --report "$ROOT_DIR/state/automation/quality_graph_precision_report.json" --quiet

run_stage "Improvement review audit" node --import tsx ./tools/wvo_mcp/scripts/run_review_audit.ts --workspace-root "$ROOT_DIR" --quiet

run_stage "CI ts loader guard" node --import tsx ./tools/wvo_mcp/scripts/check_ci_ts_loader.ts --workflow "$ROOT_DIR/.github/workflows/ci.yml"

run_stage "Structural policy enforcement" node --import tsx ./tools/wvo_mcp/scripts/check_structural_policy.ts --output "$ROOT_DIR/state/automation/structural_policy_report.json"

run_stage "Risk-oracle coverage enforcement" node --import tsx ./tools/wvo_mcp/scripts/check_risk_oracle_coverage.ts --output "$ROOT_DIR/state/automation/oracle_coverage.json" --map "$ROOT_DIR/state/risk_oracle_map.json"

run_stage "PR metadata enforcement" node --import tsx ./tools/wvo_mcp/scripts/check_pr_metadata.ts --output "$ROOT_DIR/state/automation/pr_metadata_report.json"

run_stage "Web vitest suite" node tools/oss_autopilot/scripts/run_vitest.mjs --run --scope=web

run_stage "MCP metrics sanity check" "$PYTHON_BIN" -m shared.observability.metrics --base-dir tmp/metrics

run_stage "App smoke script" bash scripts/app_smoke_e2e.sh

section "Integrity batch summary"
for entry in "${SECTION_RESULTS[@]}"; do
  IFS=":" read -r name status <<<"$entry"
  printf ' - %s: %s\n' "$name" "$status"
done

if [[ $FAILED -ne 0 ]]; then
  echo "[integrity] One or more sections failed."
  exit 1
fi

echo "[integrity] All test batches completed successfully."
