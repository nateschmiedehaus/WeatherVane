"""Export retention/geocoding telemetry and push to BigQuery tables."""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path
from typing import Iterable

from apps.worker.maintenance.export_observability import export


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Publish observability telemetry to BigQuery")
    parser.add_argument("dataset", help="BigQuery dataset ID (e.g. analytics.telemetry)")
    parser.add_argument("retention_table", help="BigQuery table for retention metrics")
    parser.add_argument("geocoding_table", help="BigQuery table for geocoding metrics")
    parser.add_argument(
        "--summary-root",
        default="storage/metadata/state",
        help="Directory containing retention/geocoding state JSON",
    )
    parser.add_argument(
        "--output",
        default="observability/latest",
        help="Directory for intermediate NDJSON files",
    )
    parser.add_argument("--dry-run", action="store_true", help="Export files but skip BigQuery loads")
    parser.add_argument(
        "--bq-binary",
        default="bq",
        help="Path to the bq CLI binary (default: bq on PATH)",
    )
    return parser.parse_args(list(argv) if argv is not None else None)


def publish(
    dataset: str,
    retention_table: str,
    geocoding_table: str,
    summary_root: str,
    output_dir: str,
    bq_binary: str,
    dry_run: bool,
) -> tuple[Path, Path]:
    retention_path, geocoding_path = _export(summary_root, output_dir)

    if dry_run:
        return retention_path, geocoding_path

    retention_target = f"{dataset}.{retention_table}"
    geocoding_target = f"{dataset}.{geocoding_table}"

    _run_bq(bq_binary, retention_target, retention_path)
    _run_bq(bq_binary, geocoding_target, geocoding_path)
    return retention_path, geocoding_path


def _export(summary_root: str, output_dir: str) -> tuple[Path, Path]:
    export(Path(summary_root), Path(output_dir))
    out = Path(output_dir)
    return out / "retention.ndjson", out / "geocoding.ndjson"


def _run_bq(bq_binary: str, table: str, path: Path) -> None:
    cmd = [
        bq_binary,
        "load",
        "--source_format=NEWLINE_DELIMITED_JSON",
        table,
        str(path),
    ]
    subprocess.run(cmd, check=True)


def main(argv: Iterable[str] | None = None) -> None:
    args = parse_args(argv)
    retention_path, geocoding_path = publish(
        dataset=args.dataset,
        retention_table=args.retention_table,
        geocoding_table=args.geocoding_table,
        summary_root=args.summary_root,
        output_dir=args.output,
        bq_binary=args.bq_binary,
        dry_run=args.dry_run,
    )
    print(f"[observability] retention export -> {retention_path}")
    print(f"[observability] geocoding export -> {geocoding_path}")
    if args.dry_run:
        print("[observability] dry-run enabled; skipped BigQuery loads")


if __name__ == "__main__":
    main()
