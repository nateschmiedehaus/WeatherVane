#!/usr/bin/env python3
"""
Roadmap Intake Utility

Allow Atlas, Director Dana, and critics to log potential roadmap additions in a
structured inbox (`state/roadmap_inbox.json`). Use the `add` subcommand to
append a proposal and `list` to inspect pending items.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List


DEFAULT_INBOX = Path("state/roadmap_inbox.json")
VALID_STATUSES = {"pending_review", "accepted", "rejected"}


def load_inbox(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    try:
        with path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
            if isinstance(data, list):
                return data
    except json.JSONDecodeError:
        pass
    return []


def save_inbox(path: Path, entries: List[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(entries, fh, indent=2)


def command_add(args: argparse.Namespace) -> None:
    inbox_path = Path(args.path)
    entries = load_inbox(inbox_path)
    weights: Dict[str, float] = {}
    if args.weights and args.weights.strip():
        try:
            parsed = json.loads(args.weights)
            if isinstance(parsed, dict):
                weights = {
                    str(key): float(value)
                    for key, value in parsed.items()
                    if isinstance(value, (int, float))
                }
        except json.JSONDecodeError:
            pass
    entry = {
        "id": uuid.uuid4().hex[:12],
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "title": args.title.strip(),
        "summary": args.summary.strip(),
        "domain": args.domain.strip().lower(),
        "source": args.source.strip(),
        "status": "pending_review",
        "notes": args.notes.strip(),
        "blockers": args.blockers.strip(),
        "signals": args.signals.strip(),
        "layers": [layer.strip() for layer in args.layers.split(",") if layer.strip()],
        "integration": args.integration.strip(),
        "weights": weights,
    }
    entries.append(entry)
    save_inbox(inbox_path, entries[-200:])
    print(f"Recorded roadmap proposal ({entry['id']}) to {inbox_path}")


def command_list(args: argparse.Namespace) -> None:
    inbox_path = Path(args.path)
    entries = load_inbox(inbox_path)
    if args.status:
        status_filter = args.status.lower()
        if status_filter not in VALID_STATUSES:
            raise SystemExit(
                f"Unknown status '{args.status}'. Valid values: "
                + ", ".join(sorted(VALID_STATUSES))
            )
        entries = [item for item in entries if item.get("status") == status_filter]
    print(json.dumps(entries, indent=2))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--path",
        default=str(DEFAULT_INBOX),
        help="Path to the roadmap inbox JSON file (default: state/roadmap_inbox.json)",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    add_parser = subparsers.add_parser("add", help="Append a roadmap proposal")
    add_parser.add_argument("--title", required=True, help="Short name for the proposal")
    add_parser.add_argument(
        "--summary",
        required=True,
        help="One-to-two sentence summary of the proposed capability or improvement",
    )
    add_parser.add_argument(
        "--domain",
        default="product",
        help="Domain tag (e.g., product, mcp, go-to-market, ops)",
    )
    add_parser.add_argument(
        "--source",
        default="atlas",
        help="Who suggested the proposal (critic, atlas, director_dana, etc.)",
    )
    add_parser.add_argument(
        "--notes",
        default="",
        help="Optional extended notes or context (Markdown allowed)",
    )
    add_parser.add_argument(
        "--blockers",
        default="",
        help="Known blockers or dependencies (optional)",
    )
    add_parser.add_argument(
        "--signals",
        default="",
        help="User/customer signals motivating this proposal (optional)",
    )
    add_parser.add_argument(
        "--layers",
        default="surface,adjacent,product",
        help="Comma-separated list describing impacted layers (e.g., surface,adjacent,product)",
    )
    add_parser.add_argument(
        "--integration",
        default="",
        help="Summary of how this idea interacts with other layers or roadmap elements (optional)",
    )
    add_parser.add_argument(
        "--weights",
        default="",
        help='JSON object describing domain weights (e.g., \'{"product": 8, "mcp": 0}\')',
    )
    add_parser.set_defaults(func=command_add)

    list_parser = subparsers.add_parser("list", help="Show proposals in the inbox")
    list_parser.add_argument(
        "--status",
        help="Filter by status (pending_review, accepted, rejected)",
    )
    list_parser.set_defaults(func=command_list)

    return parser


def main(argv: List[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    args.func(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
