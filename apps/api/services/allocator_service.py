from __future__ import annotations

import json
from pathlib import Path

from shared.schemas.allocator import SaturationReport, ShadowRunReport

DEFAULT_SHADOW_PATH = Path("experiments/rl/shadow_mode.json")
DEFAULT_SATURATION_PATH = Path("experiments/allocator/saturation_report.json")


def load_shadow_report(path: str | Path | None = None) -> ShadowRunReport:
    """Load the reinforcement-learning shadow-mode report."""

    destination = Path(path) if path else DEFAULT_SHADOW_PATH
    if not destination.exists():
        raise FileNotFoundError(f"Shadow-mode report not found at {destination}")
    payload = json.loads(destination.read_text())
    return ShadowRunReport(**payload)


def load_saturation_report(path: str | Path | None = None) -> SaturationReport:
    """Load the cross-market saturation optimisation report."""

    destination = Path(path) if path else DEFAULT_SATURATION_PATH
    if not destination.exists():
        raise FileNotFoundError(f"Saturation report not found at {destination}")
    payload = json.loads(destination.read_text())
    return SaturationReport(**payload)


__all__ = [
    "DEFAULT_SATURATION_PATH",
    "DEFAULT_SHADOW_PATH",
    "load_saturation_report",
    "load_shadow_report",
]
