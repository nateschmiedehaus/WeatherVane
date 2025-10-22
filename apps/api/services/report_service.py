from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Sequence

import jsonschema

from apps.api.services.exceptions import SchemaValidationError
from apps.api.services.plan_service import PlanService
from shared.schemas.base import (
    ConfidenceLevel,
    PlanResponse,
    PlanSlice,
    ReportHeroTile,
    ReportNarrativeCard,
    ReportSchedule,
    ReportSuccessHighlight,
    ReportTrend,
    ReportTrendPoint,
    ReportsResponse,
)
from shared.validation.schemas import validate_reports_response


def _safe_divide(numerator: float, denominator: float) -> float | None:
    if not numerator and numerator != 0:
        return None
    if not denominator:
        return None
    if denominator == 0:
        return None
    return numerator / denominator


def _confidence_score(level: ConfidenceLevel) -> float:
    mapping = {
        ConfidenceLevel.HIGH: 0.9,
        ConfidenceLevel.MEDIUM: 0.65,
        ConfidenceLevel.LOW: 0.35,
    }
    return mapping.get(level, 0.5)


def _driver_from_slice(slice_: PlanSlice) -> str:
    if slice_.rationale and slice_.rationale.primary_driver:
        return slice_.rationale.primary_driver
    factors = slice_.rationale.supporting_factors if slice_.rationale else []
    return factors[0] if factors else "Weather-driven opportunity"


def _risk_from_slice(slice_: PlanSlice) -> str:
    if slice_.rationale:
        risks = slice_.rationale.risks or []
        if risks:
            return risks[0]
        assumptions = slice_.rationale.assumptions or []
        if assumptions:
            return assumptions[0]
    if slice_.assumptions:
        return slice_.assumptions[0]
    return "Guardrails require operator approval."


def _weather_index(slice_: PlanSlice) -> float:
    baseline = slice_.expected_revenue.p50
    spread = slice_.expected_revenue.p90 - slice_.expected_revenue.p10
    ratio = _safe_divide(spread, baseline) or 0.0
    scaled = max(0.0, min(ratio * 120.0 + 40.0, 140.0))
    return round(scaled, 2)


@dataclass
class ReportService:
    plan_service: PlanService
    logger = logging.getLogger(__name__)

    async def latest_report(
        self,
        tenant_id: str,
        *,
        horizon_days: int = 7,
    ) -> ReportsResponse:
        plan = await self.plan_service.get_latest_plan(tenant_id, horizon_days=horizon_days)
        payload = self._build_response(plan)
        self._validate_reports_contract(payload, tenant_id=tenant_id)
        return payload

    def _build_response(self, plan: PlanResponse) -> ReportsResponse:
        slices = list(plan.slices or [])
        hero_tiles = self._build_hero_tiles(slices)
        narratives = self._build_narratives(slices)
        trend = self._build_trend(slices)
        schedule = self._build_schedule(plan, slices)
        success = self._build_success(plan, slices, narratives)

        return ReportsResponse(
            tenant_id=plan.tenant_id,
            generated_at=plan.generated_at,
            hero_tiles=hero_tiles,
            narratives=narratives,
            trend=trend,
            schedule=schedule,
            success=success,
            context_tags=list(plan.context_tags or []),
            data_context=plan.data_context,
            context_warnings=list(plan.context_warnings or []),
        )

    def _build_hero_tiles(self, slices: Sequence[PlanSlice]) -> list[ReportHeroTile]:
        if not slices:
            return [
                ReportHeroTile(
                    id="roi",
                    label="Weather ROI",
                    value=0.0,
                    unit="multiple",
                    narrative="Connect live spend data to unlock weather ROI tracking.",
                    delta_pct=None,
                    delta_value=None,
                ),
                ReportHeroTile(
                    id="spend",
                    label="Recommended spend",
                    value=0.0,
                    unit="usd",
                    narrative="Run the pipeline to generate spend guidance.",
                    delta_pct=None,
                    delta_value=None,
                ),
                ReportHeroTile(
                    id="guardrails",
                    label="Guardrail confidence",
                    value=0.0,
                    unit="percent",
                    narrative="Confidence will populate once plan slices are available.",
                    delta_pct=None,
                    delta_value=None,
                ),
            ]

        spend_total = sum(slice_.recommended_spend for slice_ in slices)
        revenue_total = sum(slice_.expected_revenue.p50 for slice_ in slices)
        top_slice = max(
            slices,
            key=lambda slice_: slice_.expected_revenue.p50,
        )
        roi_multiple = _safe_divide(revenue_total, spend_total) or 0.0
        roi_delta = _safe_divide(revenue_total - spend_total, spend_total)

        confidence_scores = [_confidence_score(slice_.confidence) for slice_ in slices]
        guardrail_score = (
            sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0.0
        )
        guardrail_pct = guardrail_score * 100.0

        volatility = (
            sum(slice_.expected_revenue.p90 - slice_.expected_revenue.p10 for slice_ in slices)
            if slices
            else 0.0
        )

        hero_tiles = [
            ReportHeroTile(
                id="roi",
                label="Weather ROI",
                value=round(roi_multiple, 3),
                unit="multiple",
                narrative=f"{_driver_from_slice(top_slice)} drives the strongest return in {top_slice.geo_group_id}.",
                delta_pct=round(roi_delta * 100.0, 2) if roi_delta is not None else None,
                delta_value=round(revenue_total - spend_total, 2),
            ),
            ReportHeroTile(
                id="spend",
                label="Recommended spend",
                value=round(spend_total, 2),
                unit="usd",
                narrative=f"Allocator recommends {top_slice.channel} spend in {top_slice.geo_group_id} to capture the surge.",
                delta_pct=None,
                delta_value=round(volatility, 2),
            ),
            ReportHeroTile(
                id="guardrails",
                label="Guardrail confidence",
                value=round(guardrail_pct, 2),
                unit="percent",
                narrative="Confidence blends high and medium-signal slices with guardrail posture baked in.",
                delta_pct=None,
                delta_value=None,
            ),
        ]
        return hero_tiles

    def _build_narratives(self, slices: Sequence[PlanSlice]) -> list[ReportNarrativeCard]:
        stories: list[ReportNarrativeCard] = []
        if not slices:
            return stories

        ranked = sorted(
            slices,
            key=lambda slice_: slice_.expected_revenue.p90,
            reverse=True,
        )
        for slice_ in ranked[:6]:
            headline = f"{slice_.category} · {slice_.geo_group_id}"
            driver = _driver_from_slice(slice_)
            summary = (
                f"Recommend {slice_.channel} activation worth {slice_.recommended_spend:,.0f} USD to unlock "
                f"{slice_.expected_revenue.p50:,.0f} USD with {slice_.confidence.value.lower()} confidence."
            )
            narrative = ReportNarrativeCard(
                id=f"{slice_.plan_date.isoformat()}::{slice_.geo_group_id}::{slice_.channel}",
                headline=headline,
                summary=summary,
                weather_driver=driver,
                spend=float(round(slice_.recommended_spend, 2)),
                expected_revenue=float(round(slice_.expected_revenue.p50, 2)),
                confidence=slice_.confidence,
                plan_date=slice_.plan_date,
                category=slice_.category,
                channel=slice_.channel,
            )
            stories.append(narrative)
        return stories

    def _build_trend(self, slices: Sequence[PlanSlice]) -> ReportTrend:
        if not slices:
            return ReportTrend(cadence="7-day", points=[])

        buckets: dict[datetime, dict[str, list[float] | float]] = defaultdict(
            lambda: {"spend": 0.0, "weather": [], "guardrail": []}
        )
        for slice_ in slices:
            key = datetime(slice_.plan_date.year, slice_.plan_date.month, slice_.plan_date.day)
            entry = buckets[key]
            entry["spend"] = float(entry["spend"]) + float(slice_.recommended_spend)
            weather = entry["weather"]
            guardrail = entry["guardrail"]
            if isinstance(weather, list):
                weather.append(_weather_index(slice_))
            if isinstance(guardrail, list):
                guardrail.append(_confidence_score(slice_.confidence) * 100.0)

        points: list[ReportTrendPoint] = []
        for date_key in sorted(buckets):
            payload = buckets[date_key]
            weather_values = payload["weather"]
            guardrail_values = payload["guardrail"]
            avg_weather = (
                sum(weather_values) / len(weather_values) if weather_values else 0.0
            )
            avg_guardrail = (
                sum(guardrail_values) / len(guardrail_values) if guardrail_values else 0.0
            )
            points.append(
                ReportTrendPoint(
                    date=date_key,
                    recommended_spend=round(float(payload["spend"]), 2),
                    weather_index=round(avg_weather, 2),
                    guardrail_score=round(avg_guardrail, 2),
                )
            )
        cadence = f"{max(len(points), 1)}-day"
        return ReportTrend(cadence=cadence, points=points)

    def _build_schedule(
        self,
        plan: PlanResponse,
        slices: Sequence[PlanSlice],
    ) -> ReportSchedule:
        has_live_data = bool(slices) and not plan.context_warnings
        status = "active" if has_live_data else "demo"
        cadence = "weekly" if has_live_data else "demo-only"
        recipients: list[str] = ["finance@demo.example"] if has_live_data else []
        next_delivery = plan.generated_at + timedelta(days=7) if has_live_data else None
        note = None if has_live_data else "Enable live spend connectors to schedule weekly exports."

        return ReportSchedule(
            status=status,
            cadence=cadence,
            recipients=recipients,
            delivery_format="pdf",
            next_delivery_at=next_delivery,
            last_sent_at=plan.generated_at if has_live_data else None,
            can_edit=has_live_data,
            time_zone="America/New_York",
            note=note,
        )

    def _build_success(
        self,
        plan: PlanResponse,
        slices: Sequence[PlanSlice],
        narratives: Sequence[ReportNarrativeCard],
    ) -> ReportSuccessHighlight:
        if slices:
            top = max(
                slices,
                key=lambda slice_: slice_.expected_revenue.p50,
            )
            headline = f"{top.geo_group_id} unlocked weather-driven spend win"
            summary = (
                f"Weather uplift in {top.geo_group_id} converted {top.channel} pushes into "
                f"{top.expected_revenue.p50:,.0f} USD revenue last week while respecting guardrails."
            )
            metric_label = "Incremental revenue"
            metric_value = float(round(top.expected_revenue.p50 - top.recommended_spend, 2))
            metric_unit = "usd"
            persona = "finance"
        else:
            headline = "Connect data sources to publish success stories"
            summary = (
                "Reports will highlight weekly wins once plan slices are available. Connect ad and "
                "commerce systems to unlock storytelling."
            )
            metric_label = "Incremental revenue"
            metric_value = 0.0
            metric_unit = "usd"
            persona = "operations"

        cta_href = "/plan?source=reports"
        cta_label = "Open Plan to action this win"

        if narratives:
            summary = (
                f"{narratives[0].headline} leads with {narratives[0].weather_driver}. "
                f"Expected revenue {narratives[0].expected_revenue:,.0f} USD."
            )

        return ReportSuccessHighlight(
            headline=headline,
            summary=summary,
            metric_label=metric_label,
            metric_value=metric_value,
            metric_unit=metric_unit,
            cta_label=cta_label,
            cta_href=cta_href,
            persona=persona,
        )

    def _validate_reports_contract(self, payload: ReportsResponse, *, tenant_id: str) -> None:
        try:
            validate_reports_response(payload)
        except (jsonschema.ValidationError, jsonschema.SchemaError) as error:
            if isinstance(error, jsonschema.ValidationError):
                path = list(error.absolute_path)
                reason = error.message
            else:
                path = []
                reason = str(error)
            self.logger.exception(
                "Reports schema validation failed for tenant %s at %s: %s",
                tenant_id,
                path or "<root>",
                reason,
            )
            raise SchemaValidationError(
                "Reports contract violated",
                schema="reports_response",
                tenant_id=tenant_id,
                path=path,
                reason=reason,
            ) from error
