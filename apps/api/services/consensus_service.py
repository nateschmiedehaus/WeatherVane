from __future__ import annotations

import json
import os
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional


class ConsensusSnapshotUnavailable(RuntimeError):
    """Raised when the consensus workload snapshot cannot be read."""


def _to_float(value: Any) -> Optional[float]:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if isinstance(value, str):
        try:
            parsed = float(value)
        except ValueError:
            return None
        if parsed == parsed:  # filter NaN
            return parsed
    return None


def _to_int(value: Any) -> Optional[int]:
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    if isinstance(value, float):
        if value.is_integer():
            return int(value)
        return None
    if isinstance(value, str):
        try:
            parsed = int(float(value))
        except ValueError:
            return None
        return parsed
    return None


def _normalise_participants(participants: Iterable[Any]) -> List[str]:
    seen: Dict[str, None] = {}
    for raw in participants:
        if not isinstance(raw, str):
            continue
        candidate = raw.strip()
        if not candidate:
            continue
        normalized = candidate.lower().replace(" ", "_")
        seen.setdefault(normalized, None)
    return list(seen.keys())


def _display_name(name: str) -> str:
    return name.replace("_", " ").title()


def _hierarchy_rank(name: str) -> int:
    priority = {"critical": 0, "strategic": 1, "specialist": 2}
    return priority.get(name, 99)


def _round_optional(value: Optional[float], places: int = 5) -> Optional[float]:
    if value is None:
        return None
    quantise = Decimal("1").scaleb(-places)
    decimal_value = Decimal(str(value))
    return float(decimal_value.quantize(quantise, rounding=ROUND_HALF_UP))


class ConsensusService:
    """Loads consensus telemetry snapshots for WeatherOps surfaces."""

    def __init__(self, workload_path: Optional[Path | str] = None) -> None:
        env_override = os.getenv("WEATHERVANE_CONSENSUS_WORKLOAD_PATH")
        path = workload_path or env_override or "state/analytics/consensus_workload.json"
        self._workload_path = Path(path)

    def get_workload_snapshot(self) -> Dict[str, Any]:
        try:
            raw_content = self._workload_path.read_text(encoding="utf8")
        except FileNotFoundError as exc:  # pragma: no cover - exercised via API test
            raise ConsensusSnapshotUnavailable("Consensus workload snapshot unavailable") from exc
        except OSError as exc:  # pragma: no cover - exercised via API test
            raise ConsensusSnapshotUnavailable("Consensus workload snapshot unavailable") from exc

        try:
            raw_snapshot = json.loads(raw_content)
        except json.JSONDecodeError as exc:  # pragma: no cover - exercised via API test
            raise ConsensusSnapshotUnavailable("Consensus workload snapshot corrupt") from exc

        return self._normalise_snapshot(raw_snapshot)

    def _normalise_snapshot(self, snapshot: Dict[str, Any]) -> Dict[str, Any]:
        sample_window_raw = snapshot.get("sample_window")
        sample_window = None
        if isinstance(sample_window_raw, dict):
            sample_window = {
                "start": sample_window_raw.get("start"),
                "end": sample_window_raw.get("end"),
            }

        decision_mix_raw = snapshot.get("decision_mix")
        decision_mix: Dict[str, int] = {}
        if isinstance(decision_mix_raw, dict):
            for key, value in decision_mix_raw.items():
                if not isinstance(key, str):
                    continue
                numeric = _to_int(value)
                decision_mix[key] = numeric if numeric is not None else 0

        token_budget_raw = snapshot.get("token_budget_per_run")
        token_budget: Dict[str, float] = {}
        if isinstance(token_budget_raw, dict):
            for key, value in token_budget_raw.items():
                if not isinstance(key, str):
                    continue
                numeric = _to_float(value)
                if numeric is not None:
                    token_budget[key] = round(numeric, 4)

        quorum_profiles = self._normalise_quorum_profiles(snapshot.get("quorum_profiles") or {})
        escalation_signals = self._normalise_escalation_signals(snapshot.get("escalation_signals") or [])

        execution_health_raw = snapshot.get("execution_health")
        execution_health: Dict[str, float] = {}
        if isinstance(execution_health_raw, dict):
            for key, value in execution_health_raw.items():
                if not isinstance(key, str):
                    continue
                numeric = _to_float(value)
                if numeric is not None:
                    execution_health[key] = round(numeric, 4)

        result: Dict[str, Any] = {
            "generated_at": snapshot.get("generated_at"),
            "sample_window": sample_window,
            "decision_mix": decision_mix,
            "token_cost_per_run_usd": _round_optional(_to_float(snapshot.get("token_cost_per_run_usd"))),
            "token_budget_per_run": token_budget,
            "quorum_profiles": quorum_profiles,
            "escalation_signals": escalation_signals,
            "execution_health": execution_health,
        }

        return result

    def _normalise_quorum_profiles(self, raw_profiles: Any) -> List[Dict[str, Any]]:
        if not isinstance(raw_profiles, dict):
            return []

        profiles: List[Dict[str, Any]] = []
        for name, payload in raw_profiles.items():
            if not isinstance(name, str) or not isinstance(payload, dict):
                continue
            default_participants = _normalise_participants(payload.get("default_participants", []))
            durations = payload.get("expected_duration_seconds")
            median_duration = None
            p90_duration = None
            if isinstance(durations, dict):
                median_duration = _to_float(durations.get("median"))
                p90_duration = _to_float(durations.get("p90"))
            expected_iterations = _to_int(payload.get("expected_iterations"))
            token_cost = _round_optional(_to_float(payload.get("token_cost_usd")))

            profiles.append(
                {
                    "name": name,
                    "display_name": _display_name(name),
                    "hierarchy_rank": _hierarchy_rank(name),
                    "default_participants": default_participants,
                    "median_duration_seconds": median_duration,
                    "p90_duration_seconds": p90_duration,
                    "expected_iterations": expected_iterations,
                    "token_cost_usd": token_cost,
                    "notes": payload.get("notes") if isinstance(payload.get("notes"), str) else None,
                }
            )

        profiles.sort(key=lambda profile: (profile["hierarchy_rank"], profile["display_name"]))
        return profiles

    def _normalise_escalation_signals(self, raw_signals: Any) -> List[Dict[str, Any]]:
        if not isinstance(raw_signals, list):
            return []

        signals: List[Dict[str, Any]] = []
        for entry in raw_signals:
            if not isinstance(entry, dict):
                continue
            signal_name = entry.get("signal")
            if not isinstance(signal_name, str) or not signal_name.strip():
                continue
            signals.append(
                {
                    "signal": signal_name.strip(),
                    "threshold_seconds": _to_float(entry.get("threshold_seconds")),
                    "threshold": _to_float(entry.get("threshold")),
                    "recommended_action": entry.get("recommended_action")
                    if isinstance(entry.get("recommended_action"), str)
                    else None,
                }
            )

        signals.sort(key=lambda item: item["signal"])
        return signals


__all__ = ["ConsensusService", "ConsensusSnapshotUnavailable"]
