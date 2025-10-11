"""Convert retention/geocoding telemetry to NDJSON for dashboards."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Iterable

from apps.worker.maintenance.reporting import (
    export_geocoding_reports,
    export_retention_report,
    load_geocoding_reports,
    load_retention_report,
)


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export retention/geocoding telemetry to NDJSON")
    parser.add_argument("summary_root", help="Directory containing retention/geocoding state JSON")
    parser.add_argument("output", help="Destination directory for NDJSON files")
    return parser.parse_args(list(argv) if argv is not None else None)


def export(summary_root: Path, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    retention = load_retention_report(str(summary_root))
    retention_path = output_dir / "retention.ndjson"
    export_retention_report(retention, retention_path)

    geocoding_reports = load_geocoding_reports(str(summary_root))
    geocoding_path = output_dir / "geocoding.ndjson"
    export_geocoding_reports(geocoding_reports, geocoding_path)

    print(f"[observability] wrote {retention_path} and {geocoding_path}")


def main(argv: Iterable[str] | None = None) -> None:
    args = parse_args(argv)
    export(Path(args.summary_root), Path(args.output))


if __name__ == "__main__":
    main()
