from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import math
from typing import Any, Iterable, Mapping, Sequence

from shared.schemas.base import GuardrailSettings


class EntityType(str, Enum):
    CAMPAIGN = "campaign"
    AD_SET = "ad_set"
    AD = "ad"
    CREATIVE = "creative"


class SectionType(str, Enum):
    SPEND = "spend"
    AUDIENCE = "audience"
    CREATIVE = "creative"
    DELIVERY = "delivery"


class FieldKind(str, Enum):
    ANY = "any"
    NUMERIC = "numeric"
    CATEGORICAL = "categorical"
    SET = "set"
    MAPPING = "mapping"
    SEQUENCE = "sequence"


class GuardrailSeverity(str, Enum):
    WARNING = "warning"
    CRITICAL = "critical"


@dataclass(slots=True)
class GuardrailBreach:
    code: str
    severity: GuardrailSeverity
    message: str
    limit: float | None = None
    observed: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "severity": self.severity.value,
            "message": self.message,
            "limit": self.limit,
            "observed": self.observed,
        }

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> GuardrailBreach:
        severity = payload.get("severity", GuardrailSeverity.WARNING.value)
        return cls(
            code=str(payload.get("code", "")),
            severity=GuardrailSeverity(severity),
            message=str(payload.get("message", "")),
            limit=_coerce_optional_float(payload.get("limit")),
            observed=_coerce_optional_float(payload.get("observed")),
        )


@dataclass(slots=True)
class AdPushMetric:
    name: str
    value: float
    unit: str
    label: str | None = None
    direction: str | None = None

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "name": self.name,
            "value": self.value,
            "unit": self.unit,
        }
        if self.label is not None:
            payload["label"] = self.label
        if self.direction is not None:
            payload["direction"] = self.direction
        return payload

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> AdPushMetric:
        return cls(
            name=str(payload.get("name", "")),
            value=float(payload.get("value", 0.0) or 0.0),
            unit=str(payload.get("unit", "")),
            label=payload.get("label"),
            direction=payload.get("direction"),
        )


@dataclass(slots=True)
class FieldChange:
    field_path: str
    label: str
    before: Any
    after: Any
    delta: float | None = None
    percent_delta: float | None = None
    unit: str | None = None
    forecast_delta: dict[str, float] | None = None
    guardrails: list[GuardrailBreach] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "field_path": self.field_path,
            "label": self.label,
            "before": self.before,
            "after": self.after,
            "delta": self.delta,
            "percent_delta": self.percent_delta,
            "unit": self.unit,
            "forecast_delta": self.forecast_delta,
            "guardrails": [breach.to_dict() for breach in self.guardrails],
        }
        return payload


@dataclass(slots=True)
class SectionDiff:
    section: SectionType
    summary: list[AdPushMetric] = field(default_factory=list)
    changes: list[FieldChange] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "section": self.section.value,
            "summary": [metric.to_dict() for metric in self.summary],
            "changes": [change.to_dict() for change in self.changes],
        }


@dataclass(slots=True)
class EntityDiff:
    entity_type: EntityType
    entity_id: str | None
    name: str | None
    change_type: str
    sections: list[SectionDiff] = field(default_factory=list)
    guardrails: list[GuardrailBreach] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "entity_type": self.entity_type.value,
            "entity_id": self.entity_id,
            "name": self.name,
            "change_type": self.change_type,
            "sections": [section.to_dict() for section in self.sections],
            "guardrails": [breach.to_dict() for breach in self.guardrails],
        }


@dataclass(slots=True)
class AdPushDiff:
    run_id: str
    tenant_id: str
    generation_mode: str
    generated_at: datetime
    window_start: datetime | None
    window_end: datetime | None
    summary: list[AdPushMetric]
    entities: list[EntityDiff]
    guardrails: list[GuardrailBreach]
    notes: list[str]
    source_plan_id: str | None = None
    spend_guardrail_report: "SpendGuardrailReport | None" = None

    def to_dict(self) -> dict[str, Any]:
        payload = {
            "run_id": self.run_id,
            "tenant_id": self.tenant_id,
            "generation_mode": self.generation_mode,
            "generated_at": self.generated_at.isoformat(),
            "window_start": self.window_start.isoformat() if self.window_start else None,
            "window_end": self.window_end.isoformat() if self.window_end else None,
            "summary": [metric.to_dict() for metric in self.summary],
            "entities": [entity.to_dict() for entity in self.entities],
            "guardrails": [breach.to_dict() for breach in self.guardrails],
            "notes": list(self.notes),
            "source_plan_id": self.source_plan_id,
        }
        payload["spend_guardrail_report"] = (
            self.spend_guardrail_report.to_dict() if self.spend_guardrail_report else None
        )
        return payload


@dataclass(slots=True)
class SpendGuardrailPlatformReport:
    platform: str
    baseline_spend: float
    proposed_spend: float
    spend_delta: float
    percent_delta: float | None
    direction: str | None
    guardrails: list[GuardrailBreach] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "platform": self.platform,
            "baseline_spend": self.baseline_spend,
            "proposed_spend": self.proposed_spend,
            "spend_delta": self.spend_delta,
            "percent_delta": self.percent_delta,
            "direction": self.direction,
            "guardrails": [breach.to_dict() for breach in self.guardrails],
        }


@dataclass(slots=True)
class SpendGuardrailTotals:
    baseline_spend: float
    proposed_spend: float
    spend_delta: float
    percent_delta: float | None
    direction: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "baseline_spend": self.baseline_spend,
            "proposed_spend": self.proposed_spend,
            "spend_delta": self.spend_delta,
            "percent_delta": self.percent_delta,
            "direction": self.direction,
        }


@dataclass(slots=True)
class SpendGuardrailReport:
    totals: SpendGuardrailTotals
    platforms: list[SpendGuardrailPlatformReport] = field(default_factory=list)
    guardrails: list[GuardrailBreach] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "totals": self.totals.to_dict(),
            "platforms": [platform.to_dict() for platform in self.platforms],
            "guardrails": [breach.to_dict() for breach in self.guardrails],
        }


@dataclass(slots=True)
class NormalisedField:
    key: str
    field_path: str
    label: str
    value: Any
    kind: FieldKind = FieldKind.ANY
    unit: str | None = None
    forecast_delta: dict[str, float] | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def normalised_value(self) -> Any:
        if self.kind == FieldKind.SET:
            return _normalise_set(self.value)
        if self.kind == FieldKind.MAPPING and isinstance(self.value, Mapping):
            return _sort_mapping(self.value)
        if self.kind == FieldKind.SEQUENCE and isinstance(self.value, Sequence) and not isinstance(
            self.value, (str, bytes)
        ):
            return list(self.value)
        return self.value

    def numeric_value(self) -> float | None:
        if self.value is None:
            return None
        if isinstance(self.value, (int, float)):
            return float(self.value)
        if isinstance(self.value, str):
            try:
                return float(self.value)
            except ValueError:
                return None
        return None

    @classmethod
    def from_dict(cls, key: str, payload: Mapping[str, Any]) -> NormalisedField:
        field_path = str(payload.get("field_path") or key)
        label = str(payload.get("label") or key)
        kind = FieldKind(payload.get("kind", FieldKind.ANY.value))
        metadata = dict(payload.get("metadata") or {})
        value = payload.get("value")
        if kind == FieldKind.SET:
            value = _normalise_set(value)
        elif kind == FieldKind.MAPPING and isinstance(value, Mapping):
            value = _sort_mapping(value)
        forecast_delta = payload.get("forecast_delta")
        if forecast_delta is not None and not isinstance(forecast_delta, Mapping):
            raise ValueError("forecast_delta must be a mapping when provided")
        return cls(
            key=key,
            field_path=field_path,
            label=label,
            value=value,
            kind=kind,
            unit=payload.get("unit"),
            forecast_delta=dict(forecast_delta) if forecast_delta is not None else None,
            metadata=metadata,
        )


@dataclass(slots=True)
class NormalisedNode:
    entity_type: EntityType
    entity_id: str | None
    name: str | None
    sections: dict[SectionType, dict[str, NormalisedField]]
    anchor: str | None = None
    status: str | None = None
    metrics: list[AdPushMetric] = field(default_factory=list)
    guardrails: list[GuardrailBreach] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def key(self) -> tuple[str, str]:
        anchor = (
            self.anchor
            or self.entity_id
            or self.metadata.get("external_id")
            or self.metadata.get("reference")
            or self.name
        )
        if anchor is None:
            anchor = f"generated:{id(self)}"
        return (self.entity_type.value, str(anchor))

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> NormalisedNode:
        entity_type = EntityType(payload["entity_type"])
        sections_payload = payload.get("sections") or {}
        sections: dict[SectionType, dict[str, NormalisedField]] = {}
        for section_key, fields in sections_payload.items():
            section = SectionType(section_key)
            field_map: dict[str, NormalisedField] = {}
            for field_key, field_payload in (fields or {}).items():
                field_map[field_key] = NormalisedField.from_dict(field_key, field_payload)
            sections[section] = field_map
        metrics_payload = payload.get("metrics") or []
        metrics = [
            AdPushMetric.from_dict(item)
            for item in metrics_payload
            if isinstance(item, Mapping)
        ]
        guardrails_payload = payload.get("guardrails") or []
        guardrails = [
            GuardrailBreach.from_dict(item)
            for item in guardrails_payload
            if isinstance(item, Mapping)
        ]
        return cls(
            entity_type=entity_type,
            entity_id=payload.get("entity_id"),
            name=payload.get("name"),
            sections=sections,
            anchor=payload.get("anchor"),
            status=payload.get("status"),
            metrics=metrics,
            guardrails=guardrails,
            metadata=dict(payload.get("metadata") or {}),
        )


def load_nodes_from_payload(payload: Any) -> list[NormalisedNode]:
    if isinstance(payload, Mapping):
        raw = payload.get("entities")
        if raw is None:
            raw = payload.get("nodes")
        if raw is None and "entity_type" in payload:
            raw = [payload]
    elif isinstance(payload, Sequence) and not isinstance(payload, (str, bytes)):
        raw = payload
    else:
        raise TypeError("payload must be a mapping or sequence of entities")

    nodes: list[NormalisedNode] = []
    for item in raw or []:
        if not isinstance(item, Mapping):
            raise TypeError("entity payloads must be mappings")
        nodes.append(NormalisedNode.from_dict(item))
    return nodes


class SpendGuardrailAggregator:
    _DELTA_GUARDRAIL_CODE = "platform_spend_delta_exceeds_limit"
    _MIN_SPEND_GUARDRAIL_CODE = "platform_spend_below_minimum"

    def __init__(self, guardrails: GuardrailSettings) -> None:
        self.guardrails = guardrails
        self._overall = {"before": 0.0, "after": 0.0}
        self._platform_totals: dict[str, dict[str, float]] = defaultdict(
            lambda: {"before": 0.0, "after": 0.0}
        )

    def track(self, platform: str, field_change: FieldChange) -> None:
        if field_change.unit != "usd":
            return
        platform_key = platform or "unknown"
        before = _coerce_to_float(field_change.before)
        after = _coerce_to_float(field_change.after)
        self._overall["before"] += before
        self._overall["after"] += after
        totals = self._platform_totals[platform_key]
        totals["before"] += before
        totals["after"] += after

    def overall_summary(self) -> list[AdPushMetric]:
        delta = self._overall["after"] - self._overall["before"]
        direction = _direction_from_delta(delta)
        metrics = [
            AdPushMetric(
                name="total_spend_after",
                value=self._overall["after"],
                unit="usd",
                label="Total daily spend after",
                direction=direction,
            )
        ]
        if not math.isclose(delta, 0.0, abs_tol=1e-6):
            metrics.append(
                AdPushMetric(
                    name="total_spend_delta",
                    value=delta,
                    unit="usd",
                    label="Spend delta",
                    direction=direction,
                )
            )
        return metrics

    def build_report(self) -> SpendGuardrailReport | None:
        if not self._platform_totals:
            return None
        platforms: list[SpendGuardrailPlatformReport] = []
        guardrails: list[GuardrailBreach] = []
        for platform in sorted(self._platform_totals.keys()):
            totals = self._platform_totals[platform]
            before = totals["before"]
            after = totals["after"]
            delta = after - before
            percent_delta = _percent_delta(before, after)
            direction = _direction_from_delta(delta)
            platform_guardrails = self._evaluate_platform_guardrails(
                platform=platform,
                before=before,
                after=after,
                percent_delta=percent_delta,
            )
            guardrails.extend(platform_guardrails)
            platforms.append(
                SpendGuardrailPlatformReport(
                    platform=platform,
                    baseline_spend=before,
                    proposed_spend=after,
                    spend_delta=delta,
                    percent_delta=percent_delta,
                    direction=direction,
                    guardrails=platform_guardrails,
                )
            )
        totals_report = self._build_totals()
        return SpendGuardrailReport(
            totals=totals_report,
            platforms=platforms,
            guardrails=guardrails,
        )

    def _build_totals(self) -> SpendGuardrailTotals:
        before = self._overall["before"]
        after = self._overall["after"]
        delta = after - before
        percent_delta = _percent_delta(before, after)
        direction = _direction_from_delta(delta)
        return SpendGuardrailTotals(
            baseline_spend=before,
            proposed_spend=after,
            spend_delta=delta,
            percent_delta=percent_delta,
            direction=direction,
        )

    def _evaluate_platform_guardrails(
        self,
        *,
        platform: str,
        before: float,
        after: float,
        percent_delta: float | None,
    ) -> list[GuardrailBreach]:
        breaches: list[GuardrailBreach] = []
        limit = self.guardrails.max_daily_budget_delta_pct
        if percent_delta is not None and limit >= 0:
            observed = abs(percent_delta)
            if observed > limit:
                breaches.append(
                    GuardrailBreach(
                        code=self._DELTA_GUARDRAIL_CODE,
                        severity=GuardrailSeverity.WARNING,
                        message=(
                            f"{platform} spend changed by {percent_delta:.1f}% "
                            f"exceeding limit of {limit:.1f}%"
                        ),
                        limit=limit,
                        observed=percent_delta,
                    )
                )
        min_spend = self.guardrails.min_daily_spend
        if min_spend > 0 and after < min_spend:
            breaches.append(
                GuardrailBreach(
                    code=self._MIN_SPEND_GUARDRAIL_CODE,
                    severity=GuardrailSeverity.CRITICAL,
                    message=(
                        f"{platform} spend ({after:.2f}) falls below minimum "
                        f"spend of {min_spend:.2f}"
                    ),
                    limit=min_spend,
                    observed=after,
                )
            )
        return breaches


class GuardrailEvaluator:
    def __init__(self, settings: GuardrailSettings) -> None:
        self.settings = settings

    def evaluate(
        self,
        entity_type: EntityType,
        field_change: FieldChange,
    ) -> list[GuardrailBreach]:
        breaches: list[GuardrailBreach] = []
        if field_change.unit == "usd" and field_change.percent_delta is not None:
            limit = self.settings.max_daily_budget_delta_pct
            observed = abs(field_change.percent_delta)
            if observed > limit and limit >= 0:
                breaches.append(
                    GuardrailBreach(
                        code="budget_delta_exceeds_limit",
                        severity=GuardrailSeverity.WARNING,
                        message=(
                            f"{field_change.label} changed by "
                            f"{field_change.percent_delta:.1f}% "
                            f"exceeding limit of {limit:.1f}%"
                        ),
                        limit=limit,
                        observed=field_change.percent_delta,
                    )
                )
        if field_change.unit == "usd" and field_change.after is not None:
            try:
                after_value = float(field_change.after)
            except (TypeError, ValueError):
                after_value = None
            if (
                after_value is not None
                and after_value < self.settings.min_daily_spend
                and self.settings.min_daily_spend > 0
            ):
                breaches.append(
                    GuardrailBreach(
                        code="spend_below_minimum",
                        severity=GuardrailSeverity.CRITICAL,
                        message=(
                            f"{field_change.label} falls below minimum spend "
                            f"of {self.settings.min_daily_spend:.2f}"
                        ),
                        limit=self.settings.min_daily_spend,
                        observed=after_value,
                    )
                )
        return breaches


class AdPushDiffBuilder:
    def __init__(self, guardrails: GuardrailSettings) -> None:
        self.guardrails = guardrails
        self._guardrail_evaluator = GuardrailEvaluator(guardrails)

    def build(
        self,
        *,
        baseline_nodes: Iterable[NormalisedNode],
        proposed_nodes: Iterable[NormalisedNode],
        tenant_id: str,
        run_id: str,
        generation_mode: str,
        generated_at: datetime,
        window_start: datetime | None = None,
        window_end: datetime | None = None,
        notes: Sequence[str] = (),
        source_plan_id: str | None = None,
    ) -> AdPushDiff:
        baseline_map = {node.key: node for node in baseline_nodes}
        proposed_map = {node.key: node for node in proposed_nodes}
        aggregator = SpendGuardrailAggregator(self.guardrails)
        entities: list[EntityDiff] = []
        all_guardrails: list[GuardrailBreach] = []

        for key in sorted({*baseline_map.keys(), *proposed_map.keys()}):
            baseline = baseline_map.get(key)
            proposed = proposed_map.get(key)
            entity_diff = self._build_entity_diff(
                baseline=baseline,
                proposed=proposed,
                aggregator=aggregator,
            )
            if entity_diff is None:
                continue
            entities.append(entity_diff)
            all_guardrails.extend(entity_diff.guardrails)

        summary_metrics = aggregator.overall_summary()
        spend_report = aggregator.build_report()
        if spend_report:
            all_guardrails.extend(spend_report.guardrails)

        return AdPushDiff(
            run_id=run_id,
            tenant_id=tenant_id,
            generation_mode=generation_mode,
            generated_at=generated_at,
            window_start=window_start,
            window_end=window_end,
            summary=summary_metrics,
            entities=entities,
            guardrails=all_guardrails,
            notes=list(notes),
            source_plan_id=source_plan_id,
            spend_guardrail_report=spend_report,
        )

    def _build_entity_diff(
        self,
        *,
        baseline: NormalisedNode | None,
        proposed: NormalisedNode | None,
        aggregator: SpendGuardrailAggregator,
    ) -> EntityDiff | None:
        entity_type = (proposed or baseline).entity_type  # type: ignore[union-attr]
        entity_id = (proposed or baseline).entity_id  # type: ignore[union-attr]
        name = (proposed or baseline).name  # type: ignore[union-attr]
        platform = self._resolve_platform(baseline, proposed)
        if baseline is None and proposed is None:  # pragma: no cover - defensive
            return None
        if baseline is None:
            change_type = "create"
        elif proposed is None:
            change_type = "delete"
        else:
            change_type = "update"

        sections: list[SectionDiff] = []
        entity_guardrails: list[GuardrailBreach] = []

        for section in SectionType:
            section_diff, section_guardrails = self._build_section_diff(
                section=section,
                entity_type=entity_type,
                baseline_fields=(baseline.sections.get(section) if baseline else {}) or {},
                proposed_fields=(proposed.sections.get(section) if proposed else {}) or {},
                platform=platform,
                aggregator=aggregator,
            )
            if section_diff:
                sections.append(section_diff)
            entity_guardrails.extend(section_guardrails)

        if change_type == "update" and not sections:
            change_type = "noop"

        if change_type == "noop" and not sections:
            return None

        return EntityDiff(
            entity_type=entity_type,
            entity_id=entity_id,
            name=name,
            change_type=change_type,
            sections=sections,
            guardrails=entity_guardrails,
        )

    def _build_section_diff(
        self,
        *,
        section: SectionType,
        entity_type: EntityType,
        baseline_fields: Mapping[str, NormalisedField],
        proposed_fields: Mapping[str, NormalisedField],
        platform: str,
        aggregator: SpendGuardrailAggregator,
    ) -> tuple[SectionDiff | None, list[GuardrailBreach]]:
        changes: list[FieldChange] = []
        guardrails: list[GuardrailBreach] = []
        keys = set(baseline_fields.keys()) | set(proposed_fields.keys())
        for key in sorted(keys):
            before = baseline_fields.get(key)
            after = proposed_fields.get(key)
            change = self._build_field_change(before, after)
            if change is None:
                continue
            guardrail_breaches = self._guardrail_evaluator.evaluate(entity_type, change)
            if guardrail_breaches:
                change.guardrails.extend(guardrail_breaches)
                guardrails.extend(guardrail_breaches)
            aggregator.track(platform, change)
            changes.append(change)
        if not changes:
            return None, guardrails
        summary = _compute_section_summary(section, changes)
        return SectionDiff(section=section, summary=summary, changes=changes), guardrails

    @staticmethod
    def _resolve_platform(
        baseline: NormalisedNode | None, proposed: NormalisedNode | None
    ) -> str:
        for node in (proposed, baseline):
            if node is None:
                continue
            for key in ("platform", "channel", "provider"):
                value = node.metadata.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
        return "unknown"

    @staticmethod
    def _build_field_change(
        before: NormalisedField | None,
        after: NormalisedField | None,
    ) -> FieldChange | None:
        if before is None and after is None:  # pragma: no cover - defensive
            return None
        field = after or before
        field_path = field.field_path
        label = field.label
        unit = after.unit if after and after.unit else before.unit if before else None
        before_value = before.normalised_value() if before else None
        after_value = after.normalised_value() if after else None
        delta: float | None = None
        percent_delta: float | None = None
        if (
            before
            and after
            and before.kind == FieldKind.NUMERIC
            and after.kind == FieldKind.NUMERIC
        ):
            before_num = before.numeric_value()
            after_num = after.numeric_value()
            if before_num is not None and after_num is not None:
                delta = after_num - before_num
                if math.isfinite(before_num) and not math.isclose(before_num, 0.0, abs_tol=1e-9):
                    percent_delta = (delta / before_num) * 100
                elif math.isfinite(after_num):
                    percent_delta = 100.0 if after_num > 0 else 0.0

        if before_value == after_value and delta is None and percent_delta is None:
            # No observable change
            if before is not None and after is not None:
                return None

        forecast_delta = after.forecast_delta if after and after.forecast_delta else before.forecast_delta if before else None

        return FieldChange(
            field_path=field_path,
            label=label,
            before=before_value,
            after=after_value,
            delta=delta,
            percent_delta=percent_delta,
            unit=unit,
            forecast_delta=forecast_delta,
        )


def _normalise_set(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, (set, frozenset, list, tuple)):
        items = value
    else:
        items = [value]
    normalised = {str(item) for item in items if item is not None}
    return sorted(normalised)


def _sort_mapping(value: Mapping[str, Any]) -> dict[str, Any]:
    return {key: value[key] for key in sorted(value.keys())}


def _compute_section_summary(
    section: SectionType, changes: Sequence[FieldChange]
) -> list[AdPushMetric]:
    total_before = 0.0
    total_after = 0.0
    for change in changes:
        if change.unit != "usd":
            continue
        before_value = change.before
        after_value = change.after
        if isinstance(before_value, (int, float)):
            total_before += float(before_value)
        if isinstance(after_value, (int, float)):
            total_after += float(after_value)
    if math.isclose(total_before, 0.0, abs_tol=1e-6) and math.isclose(
        total_after, 0.0, abs_tol=1e-6
    ):
        return []
    delta = total_after - total_before
    direction = _direction_from_delta(delta)
    metrics = [
        AdPushMetric(
            name=f"{section.value}_spend_after",
            value=total_after,
            unit="usd",
            label="Section spend after",
            direction=direction,
        )
    ]
    if not math.isclose(delta, 0.0, abs_tol=1e-6):
        metrics.append(
            AdPushMetric(
                name=f"{section.value}_spend_delta",
                value=delta,
                unit="usd",
                label="Section spend delta",
                direction=direction,
            )
        )
    return metrics


def _direction_from_delta(delta: float) -> str | None:
    if math.isclose(delta, 0.0, abs_tol=1e-6):
        return "flat"
    if delta > 0:
        return "increase"
    return "decrease"


def _coerce_optional_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


def _coerce_to_float(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return 0.0
    return 0.0


def _percent_delta(before: float, after: float) -> float | None:
    if math.isclose(before, 0.0, abs_tol=1e-6):
        if math.isclose(after, 0.0, abs_tol=1e-6):
            return 0.0
        if after > 0:
            return 100.0
        if after < 0:
            return -100.0
        return 0.0
    return ((after - before) / before) * 100.0
