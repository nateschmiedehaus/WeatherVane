from __future__ import annotations

import json
from pathlib import Path

from shared.schemas.creative import CreativeResponseReport

DEFAULT_CREATIVE_PATH = Path("experiments/creative/response_scores.json")


def load_creative_response(
    path: str | Path | None = None,
) -> CreativeResponseReport:
    """Load the creative response report from disk."""

    destination = Path(path) if path else DEFAULT_CREATIVE_PATH
    if not destination.exists():
        raise FileNotFoundError(f"Creative response report not found at {destination}")
    payload = json.loads(destination.read_text())
    return CreativeResponseReport(**payload)


__all__ = ["load_creative_response", "DEFAULT_CREATIVE_PATH"]
