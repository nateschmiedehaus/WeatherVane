#!/usr/bin/env python3
"""Check evidence artifacts for staleness.

Usage:
    python scripts/check_evidence_staleness.py

Environment variables:
    ALLOW_STALE_EVIDENCE=1   -> ignore staleness failures (exit 0)
    STALE_THRESHOLD_HOURS    -> override threshold (default 24)
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EVIDENCE_ROOT = ROOT / "state" / "evidence"

# Core artifact relative paths to check
ARTIFACT_GLOBS = [
    "*/verify/test_results.json",
    "*/implement/git_diff.patch",
    "*/review/review_rubric.json",
    "*/monitor/monitoring_notes.md",
]


def load_threshold_hours() -> float:
    try:
        return float(os.environ.get("STALE_THRESHOLD_HOURS", "24"))
    except ValueError:
        print("Invalid STALE_THRESHOLD_HOURS value; falling back to 24", file=sys.stderr)
        return 24.0


def find_artifacts() -> list[Path]:
    artifacts: list[Path] = []
    if not EVIDENCE_ROOT.exists():
        return artifacts
    for pattern in ARTIFACT_GLOBS:
        artifacts.extend(EVIDENCE_ROOT.glob(pattern))
    return artifacts


def main() -> int:
    allow_stale = os.environ.get("ALLOW_STALE_EVIDENCE") == "1"
    threshold_hours = load_threshold_hours()
    cutoff = time.time() - threshold_hours * 3600

    artifacts = find_artifacts()
    if not artifacts:
        print("No evidence artifacts found; nothing to check", file=sys.stderr)
        return 0

    stale: list[tuple[Path, float]] = []
    for artifact in artifacts:
        try:
            mtime = artifact.stat().st_mtime
        except FileNotFoundError:
            stale.append((artifact, float("nan")))
            continue
        if mtime < cutoff:
            stale.append((artifact, mtime))

    if not stale or allow_stale:
        if stale and allow_stale:
            print("[check-evidence] Stale artifacts ignored due to ALLOW_STALE_EVIDENCE=1")
        else:
            print("[check-evidence] All evidence artifacts fresh")
        return 0

    print("[check-evidence] Stale evidence detected (older than", threshold_hours, "hours):", file=sys.stderr)
    for path, mtime in stale:
        if mtime == mtime:  # not NaN
            age_hours = (time.time() - mtime) / 3600
            timestamp = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime(mtime))
            print(f"  - {path.relative_to(ROOT)} (last updated {timestamp}, {age_hours:.1f}h ago)", file=sys.stderr)
        else:
            print(f"  - {path.relative_to(ROOT)} (missing)", file=sys.stderr)

    return 1


if __name__ == "__main__":
    sys.exit(main())
