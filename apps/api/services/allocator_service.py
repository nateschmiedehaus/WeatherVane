from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from json import JSONDecodeError
from pathlib import Path
from typing import Any

from apps.worker.flows.rl_shadow_pipeline import orchestrate_rl_shadow_flow
from shared.schemas.allocator import SaturationReport, ShadowRunReport

DEFAULT_SHADOW_PATH = Path("experiments/rl/shadow_mode.json")
DEFAULT_SATURATION_PATH = Path("experiments/allocator/saturation_report.json")
DEFAULT_SHADOW_MAX_AGE = timedelta(hours=6)

_shadow_cache: dict[Path, tuple[int, int, ShadowRunReport]] = {}
_saturation_cache: dict[Path, tuple[int, int, SaturationReport]] = {}


def _normalise_generated_at(raw_timestamp: str) -> datetime | None:
    """Parse the generated_at timestamp into an aware UTC datetime."""

    timestamp = raw_timestamp.strip()
    if timestamp.endswith("Z"):
        timestamp = f"{timestamp[:-1]}+00:00"
    try:
        value = datetime.fromisoformat(timestamp)
    except ValueError:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _should_refresh(payload: dict[str, Any], max_age: timedelta | None) -> bool:
    """Determine whether the cached payload should be regenerated."""

    if max_age is None:
        return False
    generated_raw = payload.get("generated_at")
    if not isinstance(generated_raw, str):
        return True
    generated_at = _normalise_generated_at(generated_raw)
    if generated_at is None:
        return True
    return datetime.now(timezone.utc) - generated_at > max_age


def _canonicalise_path(path: Path) -> Path:
    return path.resolve(strict=False)


def _resolve_cached_shadow(
    destination: Path,
    *,
    auto_refresh: bool,
    max_age: timedelta | None,
) -> ShadowRunReport | None:
    key = _canonicalise_path(destination)
    entry = _shadow_cache.get(key)
    if entry is None:
        return None

    cached_mtime, cached_size, report = entry
    try:
        stat = destination.stat()
    except FileNotFoundError:
        _shadow_cache.pop(key, None)
        return None

    if stat.st_mtime_ns != cached_mtime or stat.st_size != cached_size:
        _shadow_cache.pop(key, None)
        return None

    if auto_refresh and max_age is not None:
        generated = report.generated_at
        if generated.tzinfo is None:
            generated = generated.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) - generated > max_age:
            return None

    return report.model_copy(deep=True)


def _store_shadow_cache(destination: Path, report: ShadowRunReport) -> None:
    key = _canonicalise_path(destination)
    try:
        stat = destination.stat()
    except FileNotFoundError:
        _shadow_cache.pop(key, None)
        return
    _shadow_cache[key] = (stat.st_mtime_ns, stat.st_size, report)


def _resolve_cached_saturation(destination: Path) -> SaturationReport | None:
    key = _canonicalise_path(destination)
    entry = _saturation_cache.get(key)
    if entry is None:
        return None
    cached_mtime, cached_size, report = entry
    try:
        stat = destination.stat()
    except FileNotFoundError:
        _saturation_cache.pop(key, None)
        return None
    if stat.st_mtime_ns != cached_mtime or stat.st_size != cached_size:
        _saturation_cache.pop(key, None)
        return None
    return report.model_copy(deep=True)


def _store_saturation_cache(destination: Path, report: SaturationReport) -> None:
    key = _canonicalise_path(destination)
    try:
        stat = destination.stat()
    except FileNotFoundError:
        _saturation_cache.pop(key, None)
        return
    _saturation_cache[key] = (stat.st_mtime_ns, stat.st_size, report)


def clear_allocator_caches() -> None:
    """Reset in-memory allocator artefact caches."""

    _shadow_cache.clear()
    _saturation_cache.clear()


def _generate_shadow_report(destination: Path) -> dict[str, Any]:
    """Run the reinforcement-learning flow to produce a fresh report."""

    payload = orchestrate_rl_shadow_flow.fn(output_path=str(destination))
    if not isinstance(payload, dict):
        raise RuntimeError("RL shadow flow returned an invalid payload.")
    return payload


def load_shadow_report(
    path: str | Path | None = None,
    *,
    auto_refresh: bool = True,
    max_age: timedelta | None = DEFAULT_SHADOW_MAX_AGE,
) -> ShadowRunReport:
    """Load the reinforcement-learning shadow-mode report.

    Falls back to regenerating the report when the cached artifact is missing,
    corrupted, or older than the configured max_age.
    """

    destination = Path(path) if path else DEFAULT_SHADOW_PATH
    cached = _resolve_cached_shadow(destination, auto_refresh=auto_refresh, max_age=max_age)
    if cached is not None:
        return cached

    payload: dict[str, Any] | None = None
    if destination.exists():
        try:
            payload = json.loads(destination.read_text(encoding="utf-8"))
        except (JSONDecodeError, OSError):
            payload = None

    refresh_required = payload is None
    if payload is not None and auto_refresh:
        refresh_required = _should_refresh(payload, max_age)

    if refresh_required:
        if not auto_refresh:
            _shadow_cache.pop(_canonicalise_path(destination), None)
            raise FileNotFoundError(f"Shadow-mode report not found at {destination}")
        payload = _generate_shadow_report(destination)

    if payload is None:
        raise FileNotFoundError(f"Shadow-mode report not found at {destination}")

    report = ShadowRunReport(**payload)
    _store_shadow_cache(destination, report)
    return report.model_copy(deep=True)


def load_saturation_report(path: str | Path | None = None) -> SaturationReport:
    """Load the cross-market saturation optimisation report."""

    destination = Path(path) if path else DEFAULT_SATURATION_PATH
    cached = _resolve_cached_saturation(destination)
    if cached is not None:
        return cached
    if not destination.exists():
        raise FileNotFoundError(f"Saturation report not found at {destination}")
    payload = json.loads(destination.read_text(encoding="utf-8"))
    report = SaturationReport(**payload)
    _store_saturation_cache(destination, report)
    return report.model_copy(deep=True)


__all__ = [
    "DEFAULT_SATURATION_PATH",
    "DEFAULT_SHADOW_MAX_AGE",
    "DEFAULT_SHADOW_PATH",
    "clear_allocator_caches",
    "load_saturation_report",
    "load_shadow_report",
]
