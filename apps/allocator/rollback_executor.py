from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping

from shared.libs.automation.rollback import RollbackManifest, RollbackManifestStore


@dataclass(slots=True)
class RollbackAction:
    entity_type: str | None
    entity_id: str | None
    entity_name: str | None
    field_path: str
    field_label: str | None
    proposed_value: float
    baseline_value: float

    @property
    def rollback_delta(self) -> float:
        return self.baseline_value - self.proposed_value

    def to_dict(self) -> dict[str, Any]:
        return {
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "entity_name": self.entity_name,
            "field_path": self.field_path,
            "field_label": self.field_label,
            "proposed_value": self.proposed_value,
            "baseline_value": self.baseline_value,
            "rollback_delta": self.rollback_delta,
            "direction": "increase" if self.rollback_delta > 0 else "decrease",
        }


def load_manifest(tenant_id: str, run_id: str, *, store: RollbackManifestStore | None = None) -> RollbackManifest:
    store = store or RollbackManifestStore()
    manifest = store.load(tenant_id, run_id)
    if manifest is None:
        raise FileNotFoundError(f"Rollback manifest not found for tenant={tenant_id} run={run_id}")
    return manifest


def simulate_rollback(
    manifest: RollbackManifest,
    *,
    simulated_at: datetime | None = None,
) -> dict[str, Any]:
    timestamp = simulated_at or datetime.now(timezone.utc)
    actions = list(_build_actions(manifest))

    guardrail_summary = {
        "total": len(manifest.guardrail_breaches),
        "critical_count": len(manifest.critical_guardrails),
        "critical_codes": list(manifest.critical_guardrail_codes),
    }

    spend_summary = _build_spend_summary(actions)

    payload: dict[str, Any] = {
        "run_id": manifest.run_id,
        "tenant_id": manifest.tenant_id,
        "manifest_generated_at": manifest.generated_at.isoformat(),
        "simulated_at": timestamp.isoformat(),
        "rollback_recommended": manifest.rollback_recommended,
        "critical_guardrail_codes": list(manifest.critical_guardrail_codes),
        "notes": list(manifest.notes),
        "guardrail_summary": guardrail_summary,
        "actions": [action.to_dict() for action in actions],
        "action_count": len(actions),
        "rollback_ready": bool(actions),
        "spend_summary": spend_summary,
    }

    return payload


def write_rollback_simulation(
    output_path: Path | str,
    manifest: RollbackManifest,
    *,
    simulated_at: datetime | None = None,
) -> dict[str, Any]:
    report = simulate_rollback(manifest, simulated_at=simulated_at)
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, sort_keys=True))
    return report


def generate_rollback_simulation(
    tenant_id: str,
    run_id: str,
    *,
    output_path: Path | str,
    store: RollbackManifestStore | None = None,
    simulated_at: datetime | None = None,
) -> dict[str, Any]:
    manifest = load_manifest(tenant_id, run_id, store=store)
    return write_rollback_simulation(output_path, manifest, simulated_at=simulated_at)


def _build_actions(manifest: RollbackManifest) -> Iterable[RollbackAction]:
    baseline_entities = _index_entities(manifest.baseline)
    proposed_entities = _index_entities(manifest.proposed)
    entity_keys = sorted(set(baseline_entities) & set(proposed_entities))

    for key in entity_keys:
        baseline = baseline_entities[key]
        proposed = proposed_entities[key]
        baseline_fields = _extract_numeric_fields(baseline)
        proposed_fields = _extract_numeric_fields(proposed)
        for field_path, proposed_value in proposed_fields.items():
            baseline_value = baseline_fields.get(field_path)
            if baseline_value is None:
                continue
            if abs(proposed_value - baseline_value) < 1e-9:
                continue
            yield RollbackAction(
                entity_type=str(proposed.get("entity_type")),
                entity_id=_optional_str(proposed.get("entity_id")),
                entity_name=_optional_str(proposed.get("name")),
                field_path=field_path,
                field_label=_optional_str(_lookup_field_label(proposed, field_path)),
                proposed_value=proposed_value,
                baseline_value=baseline_value,
            )


def _index_entities(payload: Any | None) -> dict[str, Mapping[str, Any]]:
    if not isinstance(payload, Mapping):
        return {}
    entities = payload.get("entities")
    if not isinstance(entities, Iterable):
        return {}

    indexed: dict[str, Mapping[str, Any]] = {}
    for item in entities:
        if isinstance(item, Mapping):
            key = _entity_key(item)
            if key:
                indexed[key] = item
    return indexed


def _entity_key(entity: Mapping[str, Any]) -> str | None:
    entity_type = entity.get("entity_type")
    entity_id = entity.get("entity_id")
    entity_name = entity.get("name")
    if entity_type and entity_id:
        return f"{entity_type}:{entity_id}"
    if entity_type and entity_name:
        return f"{entity_type}:{entity_name}"
    return None


def _extract_numeric_fields(entity: Mapping[str, Any]) -> dict[str, float]:
    results: dict[str, float] = {}
    sections = entity.get("sections")
    if not isinstance(sections, Mapping):
        return results
    for section in sections.values():
        if not isinstance(section, Mapping):
            continue
        for field in section.values():
            if not isinstance(field, Mapping):
                continue
            value = field.get("value")
            field_path = field.get("field_path")
            if field_path is None or not isinstance(field_path, str):
                continue
            numeric = _coerce_float(value)
            if numeric is None:
                continue
            results[field_path] = numeric
    return results


def _lookup_field_label(entity: Mapping[str, Any], field_path: str) -> str | None:
    sections = entity.get("sections")
    if not isinstance(sections, Mapping):
        return None
    for section in sections.values():
        if not isinstance(section, Mapping):
            continue
        for field in section.values():
            if not isinstance(field, Mapping):
                continue
            if field.get("field_path") == field_path:
                label = field.get("label")
                return str(label) if label is not None else None
    return None


def _build_spend_summary(actions: Iterable[RollbackAction]) -> dict[str, float]:
    total_proposed = 0.0
    total_baseline = 0.0
    for action in actions:
        if action.field_path.endswith("daily_budget") or action.field_path.endswith("lifetime_budget"):
            total_proposed += action.proposed_value
            total_baseline += action.baseline_value
    return {
        "total_proposed": total_proposed,
        "total_baseline": total_baseline,
        "total_rollback_delta": total_baseline - total_proposed,
    }


def _coerce_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return str(value)
