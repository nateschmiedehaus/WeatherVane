from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import time

import pytest

from apps.api.services import allocator_service


def _build_payload(timestamp: datetime) -> dict[str, object]:
    iso = timestamp.astimezone(timezone.utc).isoformat()
    return {
        "generated_at": iso,
        "average_reward": 1.0,
        "guardrail_violations": 0,
        "q_values": {"baseline": 0.0},
        "selection_counts": {"baseline": 1},
        "episodes": [
            {
                "index": 0,
                "variant": "baseline",
                "reward": 0.0,
                "candidate_profit": 100.0,
                "baseline_profit": 100.0,
                "guardrail_violated": False,
                "realised_roas": {"baseline": 1.0},
                "disabled_after_episode": False,
                "safety_override": False,
            }
        ],
        "guardrail_breach_counts": {"baseline": 0},
        "disabled_variants": [],
        "diagnostics": {"baseline_fraction": 0.2, "safety_override_rate": 0.0},
        "config": {"episodes": 1},
        "scenario": {
            "total_budget": 100.0,
            "roas_floor": 1.0,
            "learning_cap": 0.2,
            "risk_aversion": 0.5,
            "channels": [],
        },
        "validation": {
            "checks": [],
            "summary": {"episodes": 1, "safety_override_rate": 0.0, "disabled_variants": []},
            "notes": [],
            "stress_test": {
                "config": {"episodes": 1, "epsilon": 0.0, "max_guardrail_breaches": 1, "seed": 1},
                "guardrail_violations": 0,
                "guardrail_breach_counts": {},
                "selection_counts": {},
                "disabled_variants": [],
                "episodes": [],
                "assertions": {},
            },
        },
    }


@pytest.fixture(autouse=True)
def reset_allocator_caches():
    allocator_service.clear_allocator_caches()
    yield
    allocator_service.clear_allocator_caches()


def test_load_shadow_report_generates_when_missing(monkeypatch, tmp_path):
    destination = tmp_path / "shadow.json"
    payload = _build_payload(datetime.now(timezone.utc))
    calls: list[Path] = []

    def fake_generate(path: Path) -> dict[str, object]:
        calls.append(path)
        path.write_text(json.dumps(payload), encoding="utf-8")
        return payload

    monkeypatch.setattr(allocator_service, "_generate_shadow_report", fake_generate)
    monkeypatch.setattr(allocator_service, "DEFAULT_SHADOW_PATH", destination)

    report = allocator_service.load_shadow_report()
    assert calls == [destination]
    assert report.average_reward == pytest.approx(1.0)


def test_load_shadow_report_uses_cached_when_fresh(monkeypatch, tmp_path):
    destination = tmp_path / "shadow.json"
    payload = _build_payload(datetime.now(timezone.utc))
    destination.write_text(json.dumps(payload), encoding="utf-8")

    monkeypatch.setattr(allocator_service, "DEFAULT_SHADOW_PATH", destination)

    invoked = False

    def fake_generate(path: Path) -> dict[str, object]:
        nonlocal invoked
        invoked = True
        return payload

    monkeypatch.setattr(allocator_service, "_generate_shadow_report", fake_generate)

    report = allocator_service.load_shadow_report()
    assert invoked is False
    assert report.generated_at.tzinfo is not None


def test_load_shadow_report_refreshes_when_stale(monkeypatch, tmp_path):
    destination = tmp_path / "shadow.json"
    stale = _build_payload(datetime.now(timezone.utc) - timedelta(days=2))
    destination.write_text(json.dumps(stale), encoding="utf-8")

    new_payload = _build_payload(datetime.now(timezone.utc))
    calls: list[Path] = []

    def fake_generate(path: Path) -> dict[str, object]:
        calls.append(path)
        path.write_text(json.dumps(new_payload), encoding="utf-8")
        return new_payload

    monkeypatch.setattr(allocator_service, "_generate_shadow_report", fake_generate)
    monkeypatch.setattr(allocator_service, "DEFAULT_SHADOW_PATH", destination)

    report = allocator_service.load_shadow_report(max_age=timedelta(hours=1))
    assert calls == [destination]
    cached = json.loads(destination.read_text(encoding="utf-8"))
    assert cached["generated_at"] == new_payload["generated_at"]
    regenerated = datetime.fromisoformat(new_payload["generated_at"])
    result_generated = report.generated_at
    if result_generated.tzinfo is None:
        result_generated = result_generated.replace(tzinfo=timezone.utc)
    assert abs(result_generated - regenerated) < timedelta(seconds=1)


def test_load_shadow_report_raises_without_autorefresh(monkeypatch, tmp_path):
    destination = tmp_path / "shadow.json"
    monkeypatch.setattr(allocator_service, "DEFAULT_SHADOW_PATH", destination)

    with pytest.raises(FileNotFoundError):
        allocator_service.load_shadow_report(auto_refresh=False)


def test_load_shadow_report_reuses_in_memory_cache(monkeypatch, tmp_path):
    destination = tmp_path / "shadow.json"
    payload = _build_payload(datetime.now(timezone.utc))
    destination.write_text(json.dumps(payload), encoding="utf-8")

    original_loads = allocator_service.json.loads
    calls = 0

    def tracking_loads(buffer, *args, **kwargs):
        nonlocal calls
        calls += 1
        return original_loads(buffer, *args, **kwargs)

    monkeypatch.setattr(allocator_service.json, "loads", tracking_loads)

    first = allocator_service.load_shadow_report(path=destination)
    second = allocator_service.load_shadow_report(path=destination)

    assert calls == 1
    assert first is not second
    assert first.average_reward == pytest.approx(second.average_reward)


def test_load_shadow_report_detects_file_update(tmp_path):
    destination = tmp_path / "shadow.json"
    fresh = _build_payload(datetime.now(timezone.utc))
    destination.write_text(json.dumps(fresh), encoding="utf-8")

    baseline = allocator_service.load_shadow_report(path=destination)
    updated = _build_payload(datetime.now(timezone.utc) + timedelta(minutes=5))
    updated["average_reward"] = 9.75
    time.sleep(0.005)
    destination.write_text(json.dumps(updated), encoding="utf-8")

    refreshed = allocator_service.load_shadow_report(path=destination)
    assert refreshed.average_reward == pytest.approx(9.75)
    assert refreshed.generated_at >= baseline.generated_at
