from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from apps.worker.scheduling import AdaptiveWorkerScheduler, WorkloadClass
from shared.libs.hardware.probe import DeviceProfileStore


def _write_profile(path: Path, *, profile_id: str = "abc123", recommended: int = 8) -> None:
    payload = {
        profile_id: {
            "profile_id": profile_id,
            "hostname": "test-host",
            "os": "Darwin",
            "os_version": "24.0.0",
            "architecture": "arm64",
            "cpu_model": "Apple M3",
            "cpu_logical": 8,
            "cpu_physical": 4,
            "memory_total_bytes": 16 * 1024**3,
            "accelerators": [
                {"kind": "apple_mps", "name": "Apple Silicon GPU", "memory_bytes": 16 * 1024**3},
            ],
            "capabilities": {
                "has_accelerator": True,
                "supports_cuda": False,
                "supports_mps": True,
                "recommended_concurrency": recommended,
                "suggested_batch_size": 192,
            },
            "collected_at": "2024-01-01T00:00:00Z",
        }
    }
    path.write_text(json.dumps(payload, indent=2, sort_keys=True))


def test_scheduler_plan_persistence(tmp_path: Path) -> None:
    store_path = tmp_path / "profiles.json"
    _write_profile(store_path, recommended=8)
    store = DeviceProfileStore(store_path)

    scheduler = AdaptiveWorkerScheduler.from_environment(
        store=store,
        probe_if_missing=False,
        now=datetime(2024, 1, 2, 22, 0, 0, tzinfo=timezone.utc),
    )

    registry = json.loads(store_path.read_text())
    plan = registry[scheduler.plan.profile_id]["scheduler_plan"]
    assert plan["heavy_slots"] == scheduler.plan.heavy_slots
    assert plan["standard_slots"] == scheduler.plan.standard_slots
    assert plan["profile_id"] == scheduler.plan.profile_id


@pytest.mark.asyncio
async def test_async_reserve_enforces_heavy_slots(tmp_path: Path) -> None:
    store_path = tmp_path / "profiles.json"
    _write_profile(store_path, recommended=8)
    scheduler = AdaptiveWorkerScheduler.from_environment(
        store=DeviceProfileStore(store_path),
        probe_if_missing=False,
        now=datetime(2024, 1, 2, 4, 0, 0, tzinfo=timezone.utc),
    )

    active = 0
    max_active = 0
    lock = asyncio.Lock()

    async def runner() -> None:
        nonlocal active, max_active
        async with scheduler.reserve_async(WorkloadClass.HEAVY):
            async with lock:
                active += 1
                max_active = max(max_active, active)
            await asyncio.sleep(0.05)
            async with lock:
                active -= 1

    tasks = [asyncio.create_task(runner()) for _ in range(scheduler.plan.heavy_slots + 2)]
    await asyncio.gather(*tasks)
    assert max_active <= scheduler.plan.heavy_slots


def test_scheduler_defer_logic(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    store_path = tmp_path / "profiles.json"
    _write_profile(store_path, recommended=4)
    monkeypatch.setenv("WVO_HEAVY_REQUIRE_OFFPEAK", "1")
    monkeypatch.setenv("WVO_HEAVY_OFFPEAK_WINDOW", "00:00-00:30")

    now = datetime(2024, 1, 2, 12, 0, 0, tzinfo=timezone.utc)
    scheduler = AdaptiveWorkerScheduler.from_environment(
        store=DeviceProfileStore(store_path),
        probe_if_missing=False,
        now=now,
    )

    assert scheduler.plan.require_offpeak is True
    assert scheduler.plan.degraded is True
    assert scheduler.should_defer(WorkloadClass.HEAVY, now=now) is True
