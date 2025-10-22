from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Sequence

from apps.allocator.rollback_executor import generate_rollback_simulation
from shared.libs.automation.rollback import RollbackManifestStore


def _parse_simulated_at(value: str | None) -> datetime:
    if value is None:
        return datetime.now(timezone.utc)

    text = value.strip()
    if not text:
        return datetime.now(timezone.utc)

    normalised = text[:-1] + "+00:00" if text.endswith("Z") else text
    parsed = datetime.fromisoformat(normalised)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _cmd_refresh_simulation(args: argparse.Namespace) -> int:
    simulated_at = _parse_simulated_at(getattr(args, "simulated_at", None))
    manifest_root = getattr(args, "manifest_root", None)

    try:
        report = generate_rollback_simulation(
            tenant_id=args.tenant_id,
            run_id=args.run_id,
            output_path=Path(args.output),
            store=RollbackManifestStore(root=manifest_root),
            simulated_at=simulated_at,
        )
    except FileNotFoundError as error:
        print(
            f"Rollback manifest missing for tenant={args.tenant_id} run={args.run_id}: {error}",
            file=sys.stderr,
        )
        return 1
    except Exception as error:  # pragma: no cover - defensive guardrail
        print(f"Failed to refresh rollback simulation: {error}", file=sys.stderr)
        return 1

    print(
        f"Refreshed rollback simulation for tenant={report['tenant_id']} run={report['run_id']} at {report['simulated_at']}",
        file=sys.stdout,
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Allocator rollback maintenance utilities.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    refresh = subparsers.add_parser(
        "refresh-simulation", help="Regenerate rollback simulation artifact for a critical alert.",
    )
    refresh.add_argument("--tenant-id", required=True, help="Tenant identifier that owns the alert.")
    refresh.add_argument("--run-id", required=True, help="Automation run identifier for the alert.")
    refresh.add_argument(
        "--output",
        required=True,
        help="Path to write the refreshed rollback simulation JSON artifact.",
    )
    refresh.add_argument(
        "--manifest-root",
        help="Override the rollback manifest store root. Defaults to storage/metadata/ad_push_rollback.",
    )
    refresh.add_argument(
        "--simulated-at",
        help="Optional ISO8601 timestamp for the regenerated simulation (defaults to now, UTC).",
    )

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "refresh-simulation":
        return _cmd_refresh_simulation(args)

    parser.error("Unrecognised command")  # pragma: no cover
    return 2


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
