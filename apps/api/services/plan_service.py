from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path

import jsonschema
from shared.schemas.base import (
    ConfidenceLevel,
    ContextWarning,
    PlanQuantiles,
    PlanRationale,
    PlanResponse,
    PlanSlice,
)
from shared.data_context import (
    ContextService,
    ContextWarningEngine,
    default_context_service,
    default_warning_engine,
)
from apps.api.db import models
from .repositories import PlanRepository
from shared.libs.storage.state import JsonStateStore
from shared.schemas.incrementality import IncrementalityDesign, IncrementalitySummary
from shared.validation.schemas import validate_plan_slices

from apps.api.services.exceptions import SchemaValidationError


@lru_cache(maxsize=1)
def _incrementality_store() -> JsonStateStore:
    root = Path(os.getenv("INCREMENTALITY_STORE_ROOT", "storage/metadata/incrementality"))
    return JsonStateStore(root=root)


class PlanService:
    logger = logging.getLogger(__name__)

    def __init__(
        self,
        repository: PlanRepository,
        context_service: ContextService | None = None,
        warning_engine: ContextWarningEngine | None = None,
    ) -> None:
        self.repository = repository
        self.context_service = context_service or default_context_service
        self.warning_engine = warning_engine or default_warning_engine

    async def get_latest_plan(self, tenant_id: str, *, horizon_days: int = 7) -> PlanResponse:
        plan = await self.repository.latest_plan(tenant_id)
        if plan is None or not plan.slices:
            return self._fallback_plan(tenant_id, horizon_days)
        return self._to_schema(plan)

    def _to_schema(self, plan: models.Plan) -> PlanResponse:
        context_tags, data_context, warnings = self._context_payload(plan.tenant_id)
        metadata = plan.metadata_payload or {}
        incrementality_design, incrementality_summary = self._resolve_incrementality(plan.tenant_id, metadata)

        response = PlanResponse(
            tenant_id=plan.tenant_id,
            generated_at=plan.generated_at,
            horizon_days=plan.horizon_days,
            slices=[self._plan_slice_from_model(slice_) for slice_ in plan.slices],
            context_tags=context_tags,
            data_context=data_context,
            context_warnings=warnings,
            incrementality_design=incrementality_design,
            incrementality_summary=incrementality_summary,
        )
        self._validate_plan_contract(response)
        return response

    def _resolve_incrementality(
        self,
        tenant_id: str,
        metadata: dict[str, object] | None,
    ) -> tuple[IncrementalityDesign | None, IncrementalitySummary | None]:
        design_payload: dict[str, object] | None = None
        if isinstance(metadata, dict):
            raw_design = metadata.get("incrementality_design")
            if isinstance(raw_design, dict):
                design_payload = raw_design

        state_payload = self._load_incrementality_state(tenant_id)
        if design_payload is None:
            state_design = state_payload.get("design")
            if isinstance(state_design, dict) and state_design:
                design_payload = state_design

        design = IncrementalityDesign.from_payload(design_payload) if design_payload else None

        summary_payload = state_payload.get("summary") if isinstance(state_payload, dict) else None
        summary: IncrementalitySummary | None = None
        if isinstance(summary_payload, dict) and summary_payload:
            try:
                summary = IncrementalitySummary(**summary_payload)
            except Exception:
                summary = None

        return design, summary

    def _load_incrementality_state(self, tenant_id: str) -> dict[str, object]:
        try:
            state = _incrementality_store().load("designs", tenant_id)
            return state or {}
        except Exception:
            return {}

    def _plan_slice_from_model(self, slice_: models.PlanSlice) -> PlanSlice:
        revenue_quantiles = PlanQuantiles(
            p10=slice_.expected_revenue_low,
            p50=slice_.expected_revenue_mid,
            p90=slice_.expected_revenue_high,
        )
        roas_quantiles = PlanQuantiles(
            p10=slice_.expected_roas_low,
            p50=slice_.expected_roas_mid,
            p90=slice_.expected_roas_high,
        )

        confidence, assumptions, rationale, cell, status = self._normalize_metadata(slice_.rationale)

        return PlanSlice(
            plan_date=slice_.plan_date,
            geo_group_id=slice_.geo_group_id,
            category=slice_.category,
            channel=slice_.channel,
            cell=cell or slice_.channel,
            recommended_spend=slice_.recommended_spend,
            expected_revenue=revenue_quantiles,
            expected_roas=roas_quantiles,
            confidence=confidence,
            assumptions=assumptions,
            rationale=rationale,
            status=status,
        )

    def _normalize_metadata(
        self, metadata: dict[str, object] | None
    ) -> tuple[ConfidenceLevel, list[str], PlanRationale, str | None, str | None]:
        if not metadata:
            rationale = PlanRationale(
                primary_driver="Allocator rationale unavailable",
                supporting_factors=[],
                confidence_level=ConfidenceLevel.MEDIUM,
                data_quality="UNKNOWN",
                assumptions=[],
                risks=[],
            )
            return ConfidenceLevel.MEDIUM, [], rationale, None, None

        if isinstance(metadata, dict) and "rationale" in metadata and isinstance(metadata["rationale"], dict):
            rationale_payload = metadata.get("rationale") or {}
        else:
            rationale_payload = metadata if isinstance(metadata, dict) else {}

        assumptions = metadata.get("assumptions") if isinstance(metadata, dict) else []
        if assumptions is None:
            assumptions = []
        if not isinstance(assumptions, list):
            assumptions = [assumptions]
        assumptions = [str(item) for item in assumptions if item is not None]
        if not assumptions:
            assumptions_raw = rationale_payload.get("assumptions", []) if isinstance(rationale_payload, dict) else []
            if isinstance(assumptions_raw, list):
                assumptions = [str(item) for item in assumptions_raw]
            elif assumptions_raw:
                assumptions = [str(assumptions_raw)]
            else:
                assumptions = []

        cell = metadata.get("cell") if isinstance(metadata, dict) else None
        status = metadata.get("status") if isinstance(metadata, dict) else None

        confidence_value = None
        if isinstance(metadata, dict):
            confidence_value = metadata.get("confidence")
        if confidence_value is None:
            confidence_value = rationale_payload.get("confidence_level")

        confidence = self._parse_confidence(confidence_value)
        rationale = self._build_rationale(rationale_payload, confidence)

        if not assumptions:
            assumptions = list(rationale.assumptions)

        return confidence, assumptions, rationale, cell, status

    @staticmethod
    def _parse_confidence(value: object, fallback: ConfidenceLevel = ConfidenceLevel.MEDIUM) -> ConfidenceLevel:
        if isinstance(value, ConfidenceLevel):
            return value
        if isinstance(value, str):
            try:
                return ConfidenceLevel(value.upper())
            except ValueError:
                return fallback
        return fallback

    @staticmethod
    def _build_rationale(
        payload: dict[str, object] | None, default_confidence: ConfidenceLevel
    ) -> PlanRationale:
        if not payload:
            return PlanRationale(
                primary_driver="Allocator rationale unavailable",
                supporting_factors=[],
                confidence_level=default_confidence,
                data_quality="UNKNOWN",
                assumptions=[],
                risks=[],
            )

        supporting = payload.get("supporting_factors") if isinstance(payload, dict) else None
        if not isinstance(supporting, list):
            supporting = []
            if isinstance(payload, dict):
                for key in ("promo", "note"):
                    value = payload.get(key)
                    if isinstance(value, str):
                        supporting.append(value)
                extras = [
                    str(val)
                    for key, val in payload.items()
                    if key
                    not in {
                        "primary_driver",
                        "supporting_factors",
                        "confidence_level",
                        "data_quality",
                        "assumptions",
                        "risks",
                    }
                    and isinstance(val, str)
                ]
                supporting.extend(extras)

        primary_driver = None
        if isinstance(payload, dict):
            primary_driver = payload.get("primary_driver") or payload.get("weather")
        primary_driver = primary_driver or "Allocator rationale unavailable"

        assumptions: list[str] = []
        if isinstance(payload, dict):
            assumptions_raw = payload.get("assumptions", [])
            if isinstance(assumptions_raw, list):
                assumptions = [str(item) for item in assumptions_raw]
            elif assumptions_raw:
                assumptions = [str(assumptions_raw)]

        risks: list[str] = []
        if isinstance(payload, dict):
            risks_raw = payload.get("risks", [])
            if isinstance(risks_raw, list):
                risks = [str(item) for item in risks_raw]
            elif risks_raw:
                risks = [str(risks_raw)]

        data_quality = "UNKNOWN"
        if isinstance(payload, dict) and payload.get("data_quality"):
            data_quality = str(payload["data_quality"])

        confidence_level = PlanService._parse_confidence(
            payload.get("confidence_level") if isinstance(payload, dict) else None,
            fallback=default_confidence,
        )

        return PlanRationale(
            primary_driver=primary_driver,
            supporting_factors=supporting,
            confidence_level=confidence_level,
            data_quality=data_quality,
            assumptions=assumptions,
            risks=risks,
        )

    def _fallback_plan(self, tenant_id: str, horizon_days: int) -> PlanResponse:
        now = datetime.utcnow()
        slices = []
        for day in range(horizon_days):
            revenue = PlanQuantiles(
                p10=3200 + day * 50,
                p50=3600 + day * 60,
                p90=4100 + day * 70,
            )
            spend = 1200 + day * 25
            roas = PlanQuantiles(p10=2.5, p50=3.0, p90=3.4)
            rationale = PlanRationale(
                primary_driver="Rain probability up 45% vs climatology",
                supporting_factors=["Spring shower promo active"],
                confidence_level=ConfidenceLevel.MEDIUM,
                data_quality="SYNTHETIC",
                assumptions=["Fallback recommendation"],
                risks=["Model unavailable"],
            )
            slices.append(
                PlanSlice(
                    plan_date=now + timedelta(days=day),
                    geo_group_id="PNW_RAIN_COOL",
                    category="Rain Jackets",
                    channel="meta",
                    cell="meta",
                    recommended_spend=spend,
                    expected_revenue=revenue,
                    expected_roas=roas,
                    confidence=ConfidenceLevel.MEDIUM,
                    assumptions=["Spend change capped at 25%"],
                    rationale=rationale,
                    status="DEGRADED",
                )
            )
        context_tags, data_context, warnings = self._context_payload(tenant_id)
        incrementality_design, incrementality_summary = self._resolve_incrementality(tenant_id, None)
        response = PlanResponse(
            tenant_id=tenant_id,
            generated_at=now,
            horizon_days=horizon_days,
            slices=slices,
            context_tags=context_tags,
            data_context=data_context,
            context_warnings=warnings,
            incrementality_design=incrementality_design,
            incrementality_summary=incrementality_summary,
        )
        self._validate_plan_contract(response)
        return response

    def _context_payload(
        self, tenant_id: str
    ) -> tuple[list[str], dict[str, object] | None, list[ContextWarning]]:
        if not self.context_service:
            return [], None, []
        snapshot = self.context_service.latest_snapshot(tenant_id)
        if not snapshot:
            return [], None, []
        payload = snapshot.to_dict()
        tags = list(snapshot.tags)
        warning_payloads = self.warning_engine.evaluate(
            tags,
            autopilot_enabled=False,
            pushes_enabled=False,
        )
        warnings = [
            ContextWarning(
                code=item.code,
                message=item.message,
                severity=item.severity,
                tags=list(item.tags),
            )
            for item in warning_payloads
        ]
        return tags, payload, warnings

    def _validate_plan_contract(self, plan: PlanResponse) -> None:
        try:
            validate_plan_slices(plan.slices)
        except (jsonschema.ValidationError, jsonschema.SchemaError) as error:
            if isinstance(error, jsonschema.ValidationError):
                path = list(error.absolute_path)
                reason = error.message
            else:
                path = []
                reason = str(error)
            self.logger.exception(
                "Plan schema validation failed for tenant %s at %s: %s",
                plan.tenant_id,
                path or "<root>",
                reason,
            )
            raise SchemaValidationError(
                "Plan slice contract violated",
                schema="plan_slice",
                tenant_id=plan.tenant_id,
                path=path,
                reason=reason,
            ) from error
