from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
import re
from typing import Any, Dict, Iterable, List, Optional, Tuple


class OrchestrationMetricsUnavailable(RuntimeError):
    """Raised when the orchestration metrics snapshot cannot be produced."""


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


def _round_optional(value: Optional[float], places: int = 5) -> Optional[float]:
    if value is None:
        return None
    quantise = Decimal("1").scaleb(-places)
    decimal_value = Decimal(str(value))
    return float(decimal_value.quantize(quantise, rounding=ROUND_HALF_UP))


def _clean_string(value: Any) -> Optional[str]:
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return str(value)
    return None


def _normalise_participants(participants: Iterable[Any]) -> List[str]:
    seen: Dict[str, None] = {}
    for raw in participants:
        if not isinstance(raw, str):
            continue
        candidate = raw.strip()
        if not candidate:
            continue
        normalised = candidate.lower().replace(" ", "_")
        if normalised not in seen:
            seen[normalised] = None
    return list(seen.keys())


class OrchestrationMetricsService:
    """Loads dynamic staffing telemetry snapshots for downstream consumers."""

    def __init__(
        self,
        metrics_path: Optional[Path | str] = None,
        critic_snapshots_path: Optional[Path | str] = None,
    ) -> None:
        env_override = os.getenv("WEATHERVANE_ORCHESTRATION_METRICS_PATH")
        path = metrics_path or env_override or "state/analytics/orchestration_metrics.json"
        self._metrics_path = Path(path)
        critic_override = os.getenv("WEATHERVANE_CRITIC_SNAPSHOTS_PATH")
        critic_path = critic_snapshots_path or critic_override or "state/critics"
        self._critic_snapshots_path = Path(critic_path)

    def get_metrics_snapshot(self) -> Dict[str, Any]:
        try:
            raw_content = self._metrics_path.read_text(encoding="utf8")
        except FileNotFoundError as exc:  # pragma: no cover - exercised via API test
            raise OrchestrationMetricsUnavailable("Orchestration metrics snapshot unavailable") from exc
        except OSError as exc:  # pragma: no cover - exercised via API test
            raise OrchestrationMetricsUnavailable("Orchestration metrics snapshot unavailable") from exc

        try:
            snapshot = json.loads(raw_content)
        except json.JSONDecodeError as exc:  # pragma: no cover - exercised via API test
            raise OrchestrationMetricsUnavailable("Orchestration metrics snapshot corrupt") from exc

        return self._normalise_snapshot(snapshot)

    def _normalise_snapshot(self, snapshot: Dict[str, Any]) -> Dict[str, Any]:
        updated_at_raw = snapshot.get("updated_at") or snapshot.get("updatedAt")
        updated_at = _clean_string(updated_at_raw)
        if not updated_at:
            updated_at = datetime.now(timezone.utc).isoformat()
        total_decisions = snapshot.get("total_decisions") or snapshot.get("totalDecisions")
        by_type_raw = snapshot.get("by_type") or snapshot.get("byType") or {}
        history_raw = snapshot.get("history")
        guidance_raw = snapshot.get("staffing_guidance") or snapshot.get("staffingGuidance")

        by_type: Dict[str, int] = {}
        if isinstance(by_type_raw, dict):
            for key, value in by_type_raw.items():
                if not isinstance(key, str):
                    continue
                count = _to_int(value)
                if count is not None and count >= 0:
                    by_type[key] = count

        history = self._normalise_history(history_raw)
        staffing_guidance = self._normalise_staffing_guidance(guidance_raw)
        critic_performance = self._collect_critic_performance()

        return {
            "updated_at": updated_at,
            "total_decisions": _to_int(total_decisions) or 0,
            "by_type": by_type,
            "history": history,
            "staffing_guidance": staffing_guidance,
            "critic_performance": critic_performance,
        }

    def _normalise_history(self, history_raw: Any) -> List[Dict[str, Any]]:
        if not isinstance(history_raw, list):
            return []

        history: List[Dict[str, Any]] = []
        for entry in history_raw:
            if not isinstance(entry, dict):
                continue

            entry_id = _clean_string(entry.get("id"))
            task_id = _clean_string(entry.get("task_id") or entry.get("taskId"))
            decision_type = _clean_string(entry.get("type"))
            timestamp = _clean_string(entry.get("timestamp"))
            if not all([entry_id, task_id, decision_type, timestamp]):
                continue

            quorum_raw = entry.get("quorum_satisfied") or entry.get("quorumSatisfied")
            quorum_satisfied = bool(quorum_raw) if isinstance(quorum_raw, bool) else False

            participants_raw = entry.get("participants") or []
            participants = (
                _normalise_participants(participants_raw)
                if isinstance(participants_raw, list)
                else []
            )

            duration = entry.get("duration_seconds") or entry.get("durationSeconds")
            duration_seconds = _to_float(duration)
            token_cost = entry.get("token_cost_usd") or entry.get("tokenCostUsd")
            token_cost_usd = _round_optional(_to_float(token_cost))

            history.append(
                {
                    "id": entry_id,
                    "task_id": task_id,
                    "type": decision_type,
                    "timestamp": timestamp,
                    "quorum_satisfied": quorum_satisfied,
                    "participants": participants,
                    "duration_seconds": duration_seconds,
                    "token_cost_usd": token_cost_usd,
                }
            )

        return history

    def _normalise_staffing_guidance(self, payload: Any) -> Optional[Dict[str, Any]]:
        if not isinstance(payload, dict):
            return None

        sample_window_raw = payload.get("sample_window") or payload.get("sampleWindow")
        sample_window = None
        if isinstance(sample_window_raw, dict):
            sample_window = {
                "start": sample_window_raw.get("start"),
                "end": sample_window_raw.get("end"),
            }

        profiles_raw = payload.get("profiles")
        profiles: Dict[str, Dict[str, Any]] = {}
        if isinstance(profiles_raw, dict):
            for name, data in profiles_raw.items():
                if not isinstance(name, str) or not isinstance(data, dict):
                    continue
                participants = data.get("default_participants") or data.get("defaultParticipants") or []
                profiles[name] = {
                    "default_participants": (
                        _normalise_participants(participants)
                        if isinstance(participants, list)
                        else []
                    ),
                    "median_duration_seconds": _to_float(
                        data.get("median_duration_seconds")
                        or data.get("medianDurationSeconds"),
                    ),
                    "p90_duration_seconds": _to_float(
                        data.get("p90_duration_seconds") or data.get("p90DurationSeconds"),
                    ),
                    "expected_iterations": _to_int(
                        data.get("expected_iterations") or data.get("expectedIterations"),
                    ),
                    "token_cost_usd": _round_optional(
                        _to_float(data.get("token_cost_usd") or data.get("tokenCostUsd")),
                    ),
                    "notes": _clean_string(data.get("notes")),
                }

        triggers_raw = payload.get("escalation_triggers") or payload.get("escalationTriggers")
        signals: List[Dict[str, Any]] = []
        duration_trigger: Optional[float] = None
        retry_trigger: Optional[float] = None
        if isinstance(triggers_raw, dict):
            duration_trigger = _to_float(
                triggers_raw.get("duration_p90_seconds") or triggers_raw.get("durationP90Seconds"),
            )
            retry_trigger = _to_float(
                triggers_raw.get("retry_threshold") or triggers_raw.get("retryThreshold"),
            )
            signals_raw = triggers_raw.get("signals")
            if isinstance(signals_raw, list):
                for signal in signals_raw:
                    if not isinstance(signal, dict):
                        continue
                    name = _clean_string(signal.get("signal"))
                    if not name:
                        continue
                    signals.append(
                        {
                            "signal": name,
                            "recommended_action": _clean_string(
                                signal.get("recommended_action") or signal.get("recommendedAction"),
                            ),
                            "threshold_seconds": _to_float(
                                signal.get("threshold_seconds") or signal.get("thresholdSeconds"),
                            ),
                            "observed_value": _to_float(
                                signal.get("observed_value")
                                or signal.get("observedValue")
                                or signal.get("observed_p90_success")
                                or signal.get("observedRetryRate")
                                or signal.get("observed_retry_rate"),
                            ),
                        }
                    )

        token_budget_raw = payload.get("token_budget_usd") or payload.get("tokenBudgetUsd")
        token_budget: Dict[str, Optional[float]] = {}
        if isinstance(token_budget_raw, dict):
            for key, value in token_budget_raw.items():
                if not isinstance(key, str):
                    continue
                token_budget[key] = _round_optional(_to_float(value))

        return {
            "source": _clean_string(payload.get("source")),
            "sample_window": sample_window,
            "profiles": profiles,
            "escalation_triggers": {
                "duration_p90_seconds": duration_trigger,
                "retry_threshold": retry_trigger,
                "signals": signals,
            },
            "token_budget_usd": token_budget,
        }

    def _collect_critic_performance(self) -> Dict[str, Any]:
        directory = self._critic_snapshots_path
        try:
            entries = list(directory.glob("*.json"))
        except OSError:
            entries = []

        critic_entries: List[Dict[str, Any]] = []
        latest: Optional[Tuple[datetime, str]] = None

        for path in entries:
            try:
                raw_content = path.read_text(encoding="utf8")
                payload = json.loads(raw_content)
            except (OSError, json.JSONDecodeError):
                continue

            critic_entry = self._normalise_critic_snapshot(path.stem, payload)
            if not critic_entry:
                continue

            critic_entries.append(critic_entry)

            timestamp = critic_entry.get("timestamp")
            parsed = _parse_timestamp(timestamp)
            if parsed:
                candidate = (parsed, parsed.isoformat())
                if latest is None or candidate[0] > latest[0]:
                    latest = candidate

        critic_entries.sort(key=lambda entry: (entry.get("passed", False), entry.get("critic", "")))

        total = len(critic_entries)
        passing = sum(1 for entry in critic_entries if entry.get("passed"))
        failing = total - passing

        summary = {
            "total": total,
            "passing": passing,
            "failing": failing,
            "last_updated": latest[1] if latest else None,
        }

        return {
            "summary": summary,
            "critics": critic_entries,
        }

    def _normalise_critic_snapshot(self, fallback_name: str, payload: Any) -> Optional[Dict[str, Any]]:
        if not isinstance(payload, dict):
            return None

        critic = _clean_string(payload.get("critic")) or fallback_name
        if not critic:
            return None

        identity = payload.get("identity") or {}
        title = _clean_string(identity.get("title")) if isinstance(identity, dict) else None
        domain = _clean_string(identity.get("domain")) if isinstance(identity, dict) else None

        passed = bool(payload.get("passed"))
        exit_code = _to_int(payload.get("code"))
        timestamp_raw = _clean_string(payload.get("timestamp"))
        timestamp = None
        parsed_ts = _parse_timestamp(timestamp_raw)
        if parsed_ts:
            timestamp = parsed_ts.isoformat()
        elif timestamp_raw:
            timestamp = timestamp_raw

        summary = (
            _summarise_text(payload.get("analysis"))
            or _summarise_text(payload.get("stderr"))
            or _summarise_text(payload.get("stdout"))
        )

        return {
            "critic": critic,
            "title": title,
            "domain": domain,
            "passed": passed,
            "exit_code": exit_code,
            "timestamp": timestamp,
            "summary": summary,
        }


ansi_escape_re = re.compile(r"\x1B\[[0-9;]*[A-Za-z]")


def _parse_timestamp(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    candidate = value.strip()
    if not candidate:
        return None
    if candidate.endswith("Z"):
        candidate = f"{candidate[:-1]}+00:00"
    try:
        return datetime.fromisoformat(candidate)
    except ValueError:
        return None


def _strip_ansi(value: str) -> str:
    return ansi_escape_re.sub("", value)


def _summarise_text(value: Any, limit: int = 240) -> Optional[str]:
    text = _clean_string(value)
    if not text:
        return None
    for raw_line in _strip_ansi(text).splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if len(line) > limit:
            return f"{line[:limit].rstrip()}…"
        return line
    return None


__all__ = ["OrchestrationMetricsService", "OrchestrationMetricsUnavailable"]
