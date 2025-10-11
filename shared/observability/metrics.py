"""Lightweight metrics emission helpers for harnesses and workers."""

from __future__ import annotations

import argparse
import json
import logging
import os
import shutil
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, MutableMapping, Optional

LOGGER = logging.getLogger("weathervane.metrics")

_RUN_DIR_LOCK = threading.Lock()
_RUN_DIR: Optional[Path] = None
_METRICS_FILE_NAME = "metrics.jsonl"


def configure_run(
    run_id: Optional[str] = None,
    *,
    base_dir: Optional[str] = None,
    ensure_clean: bool = False,
) -> Path:
    """Configure the metrics run directory.

    Parameters
    ----------
    run_id:
        Identifier appended to the base directory for this run. When omitted a UTC timestamp
        identifier is generated.
    base_dir:
        Directory where run folders should be created. Defaults to ``METRICS_OUTPUT_DIR`` env or
        ``tmp/metrics``.
    ensure_clean:
        When true, truncate the metrics file within the run directory if it already exists.

    Returns
    -------
    Path
        The absolute path to the run directory.
    """

    resolved_base = _resolve_base_dir(base_dir)
    resolved_base.mkdir(parents=True, exist_ok=True)

    candidate = _resolve_run_dir(resolved_base, run_id)
    candidate.mkdir(parents=True, exist_ok=True)

    metrics_file = candidate / _METRICS_FILE_NAME
    if ensure_clean and metrics_file.exists():
        metrics_file.unlink()

    with _RUN_DIR_LOCK:
        global _RUN_DIR
        _RUN_DIR = candidate

    LOGGER.debug("Configured metrics run directory at %s", candidate)
    return candidate


def get_run_directory() -> Path:
    """Return the currently configured run directory, creating one if needed."""
    with _RUN_DIR_LOCK:
        if _RUN_DIR is not None:
            return _RUN_DIR

    return configure_run()


def reset_run_directory() -> None:
    """Clear the cached run directory."""
    with _RUN_DIR_LOCK:
        global _RUN_DIR
        _RUN_DIR = None


def purge_run_artifacts(
    base_dir: Optional[str] = None,
    *,
    dry_run: bool = False,
    remove_base_dir: bool = False,
) -> list[Path]:
    """Remove metrics run artifacts that accumulate during local testing.

    This keeps `tmp/metrics` from ballooning between runs while preserving the base
    directory by default so subsequent tests can reuse the same path safely.
    """

    resolved_base = _resolve_base_dir(base_dir)
    if not resolved_base.exists():
        return []

    removed: list[Path] = []

    def _delete_candidates(candidates: Iterable[Path]) -> None:
        for item in candidates:
            removed.append(item)
            if dry_run:
                continue
            if item.is_dir():
                shutil.rmtree(item, ignore_errors=True)
            else:
                try:
                    item.unlink()
                except FileNotFoundError:
                    pass

    directories = []
    files = []
    for child in sorted(resolved_base.iterdir()):
        (directories if child.is_dir() else files).append(child)

    _delete_candidates(directories + files)

    if remove_base_dir and not dry_run:
        try:
            resolved_base.rmdir()
        except OSError:
            # Directory not empty or removal failed; leave it in place.
            pass

    return removed


def emit(
    event: str,
    payload: Mapping[str, Any],
    *,
    tags: Optional[Mapping[str, str]] = None,
) -> None:
    """Persist a metrics event to the current run directory and log it.

    Parameters
    ----------
    event:
        Event name, e.g. ``"retention.telemetry"``.
    payload:
        Arbitrary JSON-serialisable data describing the event.
    tags:
        Optional dimensional tags (connector name, tenant, mode, etc.).
    """

    record: MutableMapping[str, Any] = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event": event,
        "payload": dict(payload),
        "tags": dict(tags or {}),
    }

    run_dir = get_run_directory()
    metrics_file = run_dir / _METRICS_FILE_NAME

    encoded = json.dumps(record, default=_json_default, ensure_ascii=True)
    with metrics_file.open("a", encoding="utf-8") as target:
        target.write(encoded + "\n")

    LOGGER.info(
        "metrics_event=%s tags=%s payload=%s",
        event,
        record["tags"],
        record["payload"],
    )


def _resolve_base_dir(base_dir: Optional[str]) -> Path:
    configured = base_dir or os.environ.get("METRICS_OUTPUT_DIR", "tmp/metrics")
    return Path(configured).expanduser().resolve()


def _resolve_run_dir(base_dir: Path, run_id: Optional[str]) -> Path:
    if run_id:
        return base_dir / run_id

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    candidate = base_dir / timestamp
    suffix = 1
    while candidate.exists():
        candidate = base_dir / f"{timestamp}_{suffix}"
        suffix += 1
    return candidate


def _json_default(value: Any) -> Any:
    """Fallback JSON serialiser that stringifies unknown objects."""

    if isinstance(value, (datetime,)):
        return value.isoformat()
    return str(value)


def _cli() -> int:
    parser = argparse.ArgumentParser(description="Purge metrics run artifacts.")
    parser.add_argument(
        "--base-dir",
        type=str,
        default=None,
        help="Base metrics directory (default: resolve via METRICS_OUTPUT_DIR or tmp/metrics).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview which paths would be removed without deleting them.",
    )
    parser.add_argument(
        "--remove-base-dir",
        action="store_true",
        help="Remove the base directory itself after cleaning child artifacts.",
    )
    args = parser.parse_args()

    removed = purge_run_artifacts(
        args.base_dir,
        dry_run=args.dry_run,
        remove_base_dir=args.remove_base_dir,
    )

    for path in removed:
        prefix = "Would remove" if args.dry_run else "Removed"
        print(f"{prefix}: {path}")

    if not removed:
        print("Nothing to clean.")

    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
