#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

export PYTHONUNBUFFERED=1
export PYTHONPATH="${ROOT_DIR}/.deps:${ROOT_DIR}"

python - <<PYCODE
import json
import os
import platform
import sys
from datetime import datetime, timezone

import pytest

tests = [
    "tests/test_weather_cache.py",
    "tests/test_weather_coordinates.py",
    "tests/test_weather_coverage.py",
    "tests/test_ingestion_flow.py",
    "tests/test_incremental_ingestion.py",
    "tests/test_shopify_ingestion.py",
    "tests/test_ads_ingestion.py",
    "tests/test_promo_ingestion.py",
]


class ResultRecorder:
    def __init__(self) -> None:
        self.reports: list[dict[str, object]] = []

    def pytest_runtest_logreport(self, report: pytest.TestReport) -> None:
        if report.when == "call":
            self.reports.append(
                {
                    "nodeid": report.nodeid,
                    "outcome": report.outcome,
                    "duration_seconds": getattr(report, "duration", None),
                }
            )


recorder = ResultRecorder()
exit_code = pytest.main(["-ra"] + tests, plugins=[recorder])

now = datetime.now(tz=timezone.utc)
total = len(recorder.reports)
passed = sum(1 for entry in recorder.reports if entry["outcome"] == "passed")
failed = sum(1 for entry in recorder.reports if entry["outcome"] == "failed")
skipped = sum(1 for entry in recorder.reports if entry["outcome"] == "skipped")

payload = {
    "generated_at": now.isoformat(),
    "status": "passed" if exit_code == 0 else "failed",
    "summary": {
        "total": total,
        "passed": passed,
        "failed": failed,
        "skipped": skipped,
    },
    "tests": tests,
    "environment": {
        "python": platform.python_version(),
        "platform": platform.platform(),
    },
    "results": recorder.reports,
}

output_path = os.path.join("${ROOT_DIR}", "state", "telemetry", "weather_ingestion.json")
os.makedirs(os.path.dirname(output_path), exist_ok=True)
with open(output_path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2)
    handle.write("\n")

sys.exit(exit_code)
PYCODE
