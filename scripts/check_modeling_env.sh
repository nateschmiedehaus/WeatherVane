#!/usr/bin/env bash
#
# Guardrail for ML modeling workflows.
# Validates that required native dependencies (Shapely/GEOS) load correctly
# and that the weather-aware MMM training smoke test passes.
#
# This script is intended to be fast, deterministic, and ruthlessly honest:
# any failure (including segfaults) must propagate to callers so that
# orchestration layers cannot falsely report success.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Ensure our vendored wheels are on sys.path before importing heavy deps.
export PYTHONPATH="${ROOT_DIR}/.deps:${PYTHONPATH:-}"

# Check that Shapely can be imported without crashing.
python - <<'PY'
import importlib.util
spec = importlib.util.find_spec("shapely")
if spec is None:
    raise SystemExit("Shapely is not installed (importlib.util.find_spec returned None)")

# We import inside a dedicated function to surface segfaults or GEOS load failures.
from shapely.geometry import Point  # noqa: F401
from shapely.strtree import STRtree  # noqa: F401
PY

# Ensure FeatureBuilder can load – this pulls in GeographyMapper and validates GEOS bindings.
python - <<'PY'
from shared.feature_store.feature_builder import FeatureBuilder  # noqa: F401
PY

# Run the targeted pytest that persists MMM artifacts. This is the minimal contract
# the modeling tasks promise to uphold; any failure here means the autopilot must treat
# the work as incomplete.
#
# NOTE: We use PYTHONPATH to ensure .deps is available during test collection.
# This is necessary because conftest.py runs AFTER imports during collection phase.
cd "${ROOT_DIR}"
export PYTHONPATH="${ROOT_DIR}/.deps:${ROOT_DIR}:${PYTHONPATH:-}"
python -m pytest tests/model/test_train_weather_mmm.py::test_train_weather_mmm_persists_artifacts -q
