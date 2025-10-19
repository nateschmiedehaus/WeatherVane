#!/usr/bin/env python3
"""Utility helpers for writing deterministic offline fallback summaries."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


MAX_DETAIL_CHARS = 2000


def build_summary(reason: str, details: str | None = None) -> dict:
  """Create a structured offline summary blob."""
  normalized_reason = (reason or "offline").strip() or "offline"
  cleaned_details = (details or "").strip()
  truncated_details = cleaned_details[:MAX_DETAIL_CHARS]

  notes_lines = [f"Offline fallback invoked ({normalized_reason})."]
  if truncated_details:
    notes_lines.append("")
    notes_lines.append(truncated_details)

  summary = {
    "completed_tasks": [],
    "in_progress": [],
    "blockers": [f"Autopilot unavailable: {normalized_reason}"],
    "next_focus": [],
    "notes": "\n".join(notes_lines),
    "_meta": {
      "source": "offline_fallback",
      "reason": normalized_reason,
      "diagnostic": truncated_details,
    },
  }
  return summary


def write_summary(path: Path, reason: str, details: str | None = None) -> dict:
  """Write the offline summary to disk and return it."""
  summary = build_summary(reason, details)
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
  return summary


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("--output", required=True, help="Path to write the offline summary JSON.")
  parser.add_argument("--reason", default="offline", help="Short reason describing the fallback trigger.")
  parser.add_argument("--details", help="Optional diagnostic details to embed.")
  return parser.parse_args()


def main() -> int:
  args = parse_args()
  output_path = Path(args.output).expanduser()
  write_summary(output_path, args.reason, args.details)
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
