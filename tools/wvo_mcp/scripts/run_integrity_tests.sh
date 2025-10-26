#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

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

  if [[ "$offline" == "1" ]] || [[ -d "$WHEELS_DIR" && "$prefer_wheels" == "1" ]]; then
    if [[ ! -d "$WHEELS_DIR" ]]; then
      echo "[integrity] Offline mode requested but wheel cache missing at $WHEELS_DIR"
      return 1
    fi
    echo "[integrity] Installing Python deps from wheel cache at $WHEELS_DIR"
    pip_args+=(--no-index "--find-links" "$WHEELS_DIR")
  else
    echo "[integrity] Installing Python deps from PyPI (wheel cache unavailable or disabled)"
  fi

  pip_args+=(-r "$PYTHON_REQUIREMENTS_FILE")
  "$PYTHON_BIN" -m pip install "${pip_args[@]}"
}

run_stage "Python dependency bootstrap" bootstrap_python

run_stage "Python test suite" env PYTHONPATH=".deps:." "$PYTHON_BIN" -m pytest apps tests

run_stage "Autopilot vitest suite" node tools/oss_autopilot/scripts/run_vitest.mjs --run --scope=autopilot

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
