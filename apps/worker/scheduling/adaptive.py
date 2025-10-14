from __future__ import annotations

import asyncio
import logging
import os
import threading
from contextlib import asynccontextmanager, contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Mapping, Optional, Tuple
from enum import Enum

from shared.libs.hardware.probe import DeviceProfile, DeviceProfileStore, HardwareProbe

logger = logging.getLogger(__name__)


class WorkloadClass(Enum):
    LIGHT = "light"
    STANDARD = "standard"
    HEAVY = "heavy"


def _clamp(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, value))


def _parse_bool(value: Optional[str]) -> bool:
    if value is None:
        return False
    normalized = value.strip().lower()
    return normalized in {"1", "true", "yes", "on"}


def _parse_offpeak_window(raw: Optional[str]) -> Optional[Tuple[int, int]]:
    if raw is None:
        return None
    candidate = raw.strip().lower()
    if not candidate or candidate in {"none", "off", "disable", "disabled"}:
        return None
    parts = candidate.replace(" ", "").split("-")
    if len(parts) != 2:
        return None

    def _parse_segment(segment: str) -> Optional[int]:
        if not segment:
            return None
        hour_part, minute_part = segment, "0"
        if ":" in segment:
            hour_part, minute_part = segment.split(":", 1)
        try:
            hour = int(hour_part)
            minute = int(minute_part) if minute_part else 0
        except ValueError:
            return None
        if not (0 <= hour <= 23) or not (0 <= minute <= 59):
            return None
        return hour * 60 + minute

    start = _parse_segment(parts[0])
    end = _parse_segment(parts[1])
    if start is None or end is None:
        return None
    return start, end


def _profile_timestamp(profile: DeviceProfile) -> datetime:
    raw = profile.collected_at
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            return datetime.min.replace(tzinfo=timezone.utc)


def _recommended_from_profile(profile: Optional[DeviceProfile]) -> int:
    if profile and isinstance(profile.capabilities, Mapping):
        value = profile.capabilities.get("recommended_concurrency")
        if isinstance(value, (int, float)) and value > 0:
            return int(value)
    return 4


def _derive_worker_limits(recommended: int) -> Tuple[int, int]:
    recommended = max(1, recommended)
    if recommended <= 2:
        codex_workers = 2
        heavy_slots = 1
    elif recommended >= 12:
        codex_workers = _clamp(round(recommended / 1.5), 4, 6)
        heavy_slots = _clamp(recommended // 3, 2, 3)
    else:
        codex_workers = _clamp(round(recommended / 2), 2, 6)
        heavy_slots = _clamp(recommended // 4, 1, 3)
    heavy_slots = min(heavy_slots, codex_workers)
    return codex_workers, max(1, heavy_slots)


@dataclass
class WorkloadPlan:
    profile_id: Optional[str]
    recommended_concurrency: int
    codex_workers: int
    heavy_slots: int
    standard_slots: int
    light_slots: int
    burst_mode: bool
    offpeak_window: Optional[Tuple[int, int]]
    require_offpeak: bool
    degraded: bool
    generated_at: str
    profile_summary: Optional[Dict[str, Any]] = None
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "version": 1,
            "generated_at": self.generated_at,
            "profile_id": self.profile_id,
            "recommended_concurrency": self.recommended_concurrency,
            "codex_workers": self.codex_workers,
            "heavy_slots": self.heavy_slots,
            "standard_slots": self.standard_slots,
            "light_slots": self.light_slots,
            "burst_mode": self.burst_mode,
            "require_offpeak": self.require_offpeak,
            "degraded": self.degraded,
            "notes": list(self.notes),
        }
        if self.profile_summary:
            payload["profile_summary"] = dict(self.profile_summary)
        if self.offpeak_window:
            start, end = self.offpeak_window
            payload["offpeak_window"] = {
                "start_minute": start,
                "end_minute": end,
                "local_timezone": "local",
            }
        return payload

    def is_offpeak(self, now: Optional[datetime] = None) -> bool:
        if not self.offpeak_window:
            return True
        if now is None:
            now = datetime.now()
        minute_of_day = now.hour * 60 + now.minute
        start, end = self.offpeak_window
        if start == end:
            return True
        if start < end:
            return start <= minute_of_day < end
        return minute_of_day >= start or minute_of_day < end

    def should_defer_heavy(self, now: Optional[datetime] = None) -> bool:
        return self.require_offpeak and not self.is_offpeak(now)

    @classmethod
    def from_profile(
        cls,
        profile: Optional[DeviceProfile],
        *,
        now: Optional[datetime],
        offpeak_window: Optional[Tuple[int, int]],
        require_offpeak: bool,
        burst_mode: bool,
    ) -> "WorkloadPlan":
        timestamp = now or datetime.now(timezone.utc)
        timestamp_utc = timestamp.astimezone(timezone.utc).isoformat()
        recommended = _recommended_from_profile(profile)
        codex_workers, heavy_slots = _derive_worker_limits(recommended)

        notes: list[str] = [
            f"recommended:{recommended}",
            f"codex_workers:{codex_workers}",
        ]

        if burst_mode and recommended >= 6:
            heavy_slots = min(codex_workers, heavy_slots + 1)
            notes.append("burst_mode:enabled")
        else:
            notes.append("burst_mode:disabled")

        standard_slots = max(1, codex_workers)
        light_slots = max(2, min(standard_slots * 2, max(recommended, standard_slots * 2)))

        if offpeak_window:
            start, end = offpeak_window
            notes.append(f"offpeak_window:{start}-{end}")
        else:
            notes.append("offpeak_window:none")

        profile_summary: Optional[Dict[str, Any]] = None
        if profile:
            profile_summary = {
                "hostname": profile.hostname,
                "os": profile.os,
                "architecture": profile.architecture,
                "has_accelerator": bool(profile.capabilities.get("has_accelerator"))
                if isinstance(profile.capabilities, Mapping)
                else False,
                "recommended_concurrency": recommended,
                "suggested_batch_size": profile.capabilities.get("suggested_batch_size")
                if isinstance(profile.capabilities, Mapping)
                else None,
            }
        else:
            notes.append("profile:missing")

        plan = cls(
            profile_id=profile.profile_id if profile else None,
            recommended_concurrency=recommended,
            codex_workers=codex_workers,
            heavy_slots=max(1, heavy_slots),
            standard_slots=standard_slots,
            light_slots=light_slots,
            burst_mode=burst_mode,
            offpeak_window=offpeak_window,
            require_offpeak=require_offpeak,
            degraded=False,
            generated_at=timestamp_utc,
            profile_summary=profile_summary,
            notes=notes,
        )
        plan.degraded = plan.should_defer_heavy(now=timestamp)
        if plan.degraded:
            plan.notes.append("mode:degraded")
        elif require_offpeak:
            plan.notes.append("mode:offpeak-ok")
        else:
            plan.notes.append("mode:unrestricted")
        return plan


class AdaptiveWorkerScheduler:
    def __init__(
        self,
        *,
        plan: WorkloadPlan,
        store: Optional[DeviceProfileStore],
        profile: Optional[DeviceProfile],
    ) -> None:
        self.plan = plan
        self._store = store
        self._profile = profile
        self._sync_slots: Dict[WorkloadClass, threading.Semaphore] = {
            WorkloadClass.HEAVY: threading.Semaphore(max(1, plan.heavy_slots)),
            WorkloadClass.STANDARD: threading.Semaphore(max(1, plan.standard_slots)),
            WorkloadClass.LIGHT: threading.Semaphore(max(1, plan.light_slots)),
        }
        self._async_slots: Dict[WorkloadClass, asyncio.Semaphore] = {
            WorkloadClass.HEAVY: asyncio.Semaphore(max(1, plan.heavy_slots)),
            WorkloadClass.STANDARD: asyncio.Semaphore(max(1, plan.standard_slots)),
            WorkloadClass.LIGHT: asyncio.Semaphore(max(1, plan.light_slots)),
        }
        self._warned: set[WorkloadClass] = set()
        self._persist_plan()

    @classmethod
    def from_environment(
        cls,
        *,
        workspace_root: Optional[Path | str] = None,
        store: Optional[DeviceProfileStore] = None,
        probe_if_missing: bool = True,
        now: Optional[datetime] = None,
    ) -> "AdaptiveWorkerScheduler":
        root = Path(workspace_root) if workspace_root is not None else Path.cwd()
        if store is None:
            store = DeviceProfileStore(root / "state" / "device_profiles.json")

        profile = cls._select_profile(store)
        if profile is None and probe_if_missing:
            try:
                probe = HardwareProbe(store=store)
                profile = probe.collect_and_persist()
            except Exception as exc:  # pragma: no cover - defensive
                logger.debug("Failed to collect hardware profile", exc_info=exc)
                profile = None

        offpeak_raw = os.getenv("WVO_HEAVY_OFFPEAK_WINDOW", "21:00-06:00")
        offpeak_window = _parse_offpeak_window(offpeak_raw)
        require_offpeak = _parse_bool(os.getenv("WVO_HEAVY_REQUIRE_OFFPEAK"))
        burst_mode = _parse_bool(os.getenv("WVO_SCHEDULER_ALLOW_BURST"))

        plan = WorkloadPlan.from_profile(
            profile,
            now=now,
            offpeak_window=offpeak_window,
            require_offpeak=require_offpeak,
            burst_mode=burst_mode,
        )
        return cls(plan=plan, store=store, profile=profile)

    @staticmethod
    def _select_profile(store: DeviceProfileStore) -> Optional[DeviceProfile]:
        try:
            profiles = store.list_profiles()
        except Exception:  # pragma: no cover - defensive
            return None
        if not profiles:
            return None
        return max(profiles, key=_profile_timestamp)

    def _persist_plan(self) -> None:
        if not self._store or not self._profile:
            return
        try:
            self._store.save_scheduler_plan(self._profile.profile_id, self.plan.to_dict())
        except Exception as exc:  # pragma: no cover - defensive
            logger.debug("Failed to persist scheduler plan", exc_info=exc)

    def should_defer(self, workload: WorkloadClass, *, now: Optional[datetime] = None) -> bool:
        if workload is not WorkloadClass.HEAVY:
            return False
        return self.plan.should_defer_heavy(now)

    def _maybe_warn(self, workload: WorkloadClass) -> None:
        if workload is not WorkloadClass.HEAVY:
            return
        if WorkloadClass.HEAVY in self._warned:
            return
        if self.plan.should_defer_heavy():
            logger.warning(
                "Running heavy workload outside configured off-peak window; scheduler operating in degraded mode",
                extra={"plan": self.plan.to_dict()},
            )
            self._warned.add(WorkloadClass.HEAVY)

    @contextmanager
    def reserve(self, workload: WorkloadClass):
        semaphore = self._sync_slots.get(workload)
        if semaphore is None:
            raise ValueError(f"Unsupported workload class: {workload}")
        self._maybe_warn(workload)
        semaphore.acquire()
        try:
            yield
        finally:
            semaphore.release()

    @asynccontextmanager
    async def reserve_async(self, workload: WorkloadClass):
        semaphore = self._async_slots.get(workload)
        if semaphore is None:
            raise ValueError(f"Unsupported workload class: {workload}")
        self._maybe_warn(workload)
        await semaphore.acquire()
        try:
            yield
        finally:
            semaphore.release()

    def describe(self) -> Dict[str, Any]:
        return self.plan.to_dict()
