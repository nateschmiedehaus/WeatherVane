#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IS_SOURCED=0
if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
  IS_SOURCED=1
fi
CONFIG_FILE="${ROOT_DIR}/python-toolchain.toml"
if [[ -n "${PYTHON_BIN:-}" ]]; then
  printf '%s\n' "${PYTHON_BIN}"
  if [[ "${IS_SOURCED}" == "1" ]]; then
    return 0
  fi
  exit 0
fi
candidate_list=()
abi_expected=""
if [[ -f "${CONFIG_FILE}" ]]; then
  tool_output="$(
    python3 - <<'PY' "${CONFIG_FILE}" 2>/dev/null || true
from __future__ import annotations
import sys
from pathlib import Path
try:
    import tomllib as _toml
except ModuleNotFoundError:  # pragma: no cover - Python <=3.10
    import tomli as _toml  # type: ignore[import-not-found]
cfg = _toml.loads(Path(sys.argv[1]).read_text())
python_cfg = cfg.get('python', {})
candidates = python_cfg.get('candidates', [])
for cand in candidates:
    if cand:
        print(cand)
abi = python_cfg.get('abi', '')
if abi:
    print(f"__ABI__:{abi}")
PY
  )"
  while IFS= read -r line; do
    candidate_list+=("$line")
  done <<< "${tool_output}"
fi
parsed=()
for entry in "${candidate_list[@]:-}"; do
  if [[ "${entry}" == __ABI__:* ]]; then
    abi_expected="${entry#__ABI__:}"
  elif [[ -n "${entry}" ]]; then
    parsed+=("${entry}")
  fi
done
if [[ ${#parsed[@]} -eq 0 ]]; then
  parsed+=(python3 python)
fi
check_abi() {
  local bin="$1"
  local expected="$2"
  if [[ -z "${expected}" ]]; then
    return 0
  fi
  local soabi
  if ! soabi="$("${bin}" - <<'PY' 2>/dev/null || true
import sysconfig
abi = sysconfig.get_config_var('SOABI') or ''
print(abi)
PY
)"; then
    return 1
  fi
  if [[ "${soabi}" == *"${expected}"* ]]; then
    return 0
  fi
  return 1
}
emit() {
  local value="$1"
  if [[ "${IS_SOURCED}" == "1" ]]; then
    printf '%s\n' "${value}"
    return 0
  else
    printf '%s\n' "${value}"
    exit 0
  fi
}
selected=""
for candidate in "${parsed[@]}"; do
  if command -v "${candidate}" >/dev/null 2>&1; then
    resolved="$(command -v "${candidate}")"
    if check_abi "${resolved}" "${abi_expected}"; then
      selected="${resolved}"
      break
    fi
  fi
done
if [[ -n "${selected}" ]]; then
  emit "${selected}"
else
  emit "python3"
fi
