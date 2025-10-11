from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pytest

from shared.libs.hardware.probe import (
    DeviceProfile,
    DeviceProfileStore,
    HardwareProbe,
    collect_device_profile,
)


@pytest.fixture
def fixed_timestamp() -> datetime:
    return datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc)


@pytest.fixture
def patched_snapshot(monkeypatch: pytest.MonkeyPatch) -> None:
    snapshot = {
        "hostname": "test-host",
        "os": "Linux",
        "os_version": "6.0.0",
        "architecture": "x86_64",
        "cpu_model": "Test CPU",
        "cpu_logical": 16,
        "cpu_physical": 8,
        "memory_total_bytes": 64 * 1024**3,
        "accelerators": [
            {"kind": "nvidia", "name": "RTX 4090", "memory_bytes": 24 * 1024**3},
        ],
    }
    monkeypatch.setattr(
        "shared.libs.hardware.probe._collect_system_snapshot",
        lambda: dict(snapshot),
    )


def test_collect_device_profile_infers_capabilities(
    patched_snapshot: None,
    fixed_timestamp: datetime,
) -> None:
    profile = HardwareProbe(clock=lambda: fixed_timestamp).collect()
    assert profile.hostname == "test-host"
    assert profile.capabilities["supports_cuda"] is True
    assert profile.capabilities["has_accelerator"] is True
    assert profile.capabilities["recommended_concurrency"] == 8
    assert profile.capabilities["suggested_batch_size"] == 512
    assert profile.collected_at == fixed_timestamp.isoformat()
    assert profile.profile_id


def test_collect_device_profile_override_updates_fields(
    patched_snapshot: None,
    fixed_timestamp: datetime,
) -> None:
    overrides = {
        "cpu_logical": 4,
        "accelerators": [],
        "memory_total_bytes": 8 * 1024**3,
    }
    profile = HardwareProbe(clock=lambda: fixed_timestamp).collect(overrides=overrides)
    assert profile.capabilities["has_accelerator"] is False
    assert profile.capabilities["recommended_concurrency"] == 2
    assert profile.capabilities["suggested_batch_size"] == 64


def test_collect_device_profile_helper_uses_probe(monkeypatch: pytest.MonkeyPatch) -> None:
    outputs = {"called": False}

    def _fake_collect(self: HardwareProbe, **_: object) -> DeviceProfile:  # noqa: ARG001
        outputs["called"] = True
        return DeviceProfile(
            profile_id="abc123",
            hostname="fake",
            os="Linux",
            os_version="1",
            architecture="x86_64",
            cpu_model="Fake CPU",
            cpu_logical=2,
            cpu_physical=2,
            memory_total_bytes=4 * 1024**3,
            accelerators=[],
            capabilities={"has_accelerator": False},
            collected_at="2024-01-01T00:00:00Z",
        )

    monkeypatch.setattr(HardwareProbe, "collect", _fake_collect)
    profile = collect_device_profile()
    assert outputs["called"] is True
    assert profile.hostname == "fake"


def test_device_profile_store_round_trip(
    patched_snapshot: None,
    fixed_timestamp: datetime,
    tmp_path: Path,
) -> None:
    store_path = tmp_path / "profiles.json"
    store = DeviceProfileStore(store_path)
    profile = HardwareProbe(clock=lambda: fixed_timestamp).collect()

    saved_path = store.save(profile)
    assert saved_path == store_path

    loaded = store.get(profile.profile_id)
    assert loaded == profile

    all_profiles = store.list_profiles()
    assert profile in all_profiles
