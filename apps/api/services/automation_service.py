from __future__ import annotations

from datetime import datetime
from typing import Any

import logging

import jsonschema

from shared.schemas.base import (
    AutomationConsent,
    AutomationSettings,
    AutomationSettingsResponse,
    ContextWarning,
    DataRequestPayload,
    DataRequestResponse,
    DataRequestType,
    ConsentStatus,
    AutomationMode,
    GuardrailSettings,
)

from .repositories import AutomationRepository, AuditLogRepository
from .notifications import WebhookPublisher
from shared.data_context import ContextService, default_context_service
from shared.data_context.warnings import ContextWarningEngine, default_warning_engine
from apps.api.services.exceptions import SchemaValidationError
from shared.validation.schemas import (
    validate_automation_settings_response,
    validate_data_request_response,
)

logger = logging.getLogger(__name__)

class AutomationService:
    def __init__(
        self,
        repository: AutomationRepository,
        audit_repo: AuditLogRepository,
        publisher: WebhookPublisher | None = None,
        context_service: ContextService | None = None,
        warning_engine: ContextWarningEngine | None = None,
    ) -> None:
        self.repository = repository
        self.audit_repo = audit_repo
        self.publisher = publisher or WebhookPublisher(None)
        self.context_service = context_service or default_context_service
        self.warning_engine = warning_engine or default_warning_engine

    async def get_settings(self, tenant_id: str) -> AutomationSettingsResponse:
        policy = await self.repository.fetch_policy(tenant_id)
        tags, warnings, data_context = self._context_bundle(tenant_id, policy)
        settings = self._to_schema(policy, context_tags=tags)
        response = AutomationSettingsResponse(
            tenant_id=tenant_id,
            settings=settings,
            updated_at=policy.last_settings_update_at,
            context_tags=tags,
            data_context=data_context,
            context_warnings=warnings,
        )
        self._validate_settings_response(response, tenant_id=tenant_id)
        return response

    async def update_settings(
        self,
        tenant_id: str,
        payload: AutomationSettings,
    ) -> AutomationSettingsResponse:
        policy = await self.repository.fetch_policy(tenant_id)
        previous_consent = policy.consent_status
        previous_mode = policy.autopilot_mode
        self._apply_policy(policy, payload)
        policy.last_settings_actor = payload.updated_by
        context_tags, warnings, data_context = self._context_bundle(tenant_id, policy)
        policy.alerts = self._merge_alerts(policy.alerts, payload.notes, context_tags, warnings)
        policy = await self.repository.persist_policy(policy)
        await self._audit_settings_change(
            tenant_id,
            previous_consent=previous_consent,
            new_consent=policy.consent_status,
            previous_mode=previous_mode,
            new_mode=policy.autopilot_mode,
            actor=payload.updated_by,
            context_tags=context_tags,
            context_warnings=warnings,
            data_context=data_context,
        )
        await self._notify(
            "automation.settings.updated",
            {
                "tenant_id": tenant_id,
                "mode": policy.autopilot_mode,
                "consent_status": policy.consent_status,
                "updated_by": payload.updated_by,
                "timestamp": policy.last_settings_update_at.isoformat()
                if policy.last_settings_update_at
                else datetime.utcnow().isoformat(),
            },
            tenant_id=tenant_id,
            context_tags=context_tags,
            context_warnings=warnings,
            data_context=data_context,
        )
        settings = self._to_schema(policy, context_tags=context_tags)
        response = AutomationSettingsResponse(
            tenant_id=tenant_id,
            settings=settings,
            updated_at=policy.last_settings_update_at,
            context_tags=context_tags,
            data_context=data_context,
            context_warnings=warnings,
        )
        self._validate_settings_response(response, tenant_id=tenant_id)
        return response

    async def create_data_request(
        self,
        tenant_id: str,
        request_type: DataRequestType,
        payload: DataRequestPayload,
    ) -> DataRequestResponse:
        request = await self.repository.create_data_request(
            tenant_id=tenant_id,
            request_type=request_type.value,
            requested_by=payload.requested_by,
            notes=payload.notes,
        )

        policy = await self.repository.fetch_policy(tenant_id)
        now = datetime.utcnow()
        event = f"privacy.request.{request_type.value}"
        if request_type is DataRequestType.export:
            policy.last_export_at = now
        elif request_type is DataRequestType.delete:
            policy.last_delete_at = now
        await self.repository.persist_policy(policy)
        context_tags, warnings, data_context = self._context_bundle(tenant_id, policy)
        await self.audit_repo.record(
            tenant_id=tenant_id,
            action=event,
            actor_type="system",
            actor_id=payload.requested_by,
            payload={
                "requested_by": payload.requested_by,
                "notes": payload.notes,
                "request_type": request_type.value,
                "request_id": request.id,
            },
        )
        await self._notify(
            event,
            {
                "tenant_id": tenant_id,
                "requested_by": payload.requested_by,
                "request_id": request.id,
                "timestamp": request.requested_at.isoformat(),
            },
            tenant_id=tenant_id,
            context_tags=context_tags,
            context_warnings=warnings,
            data_context=data_context,
        )

        response = self._request_to_schema(request)
        self._validate_data_request_response(response, tenant_id=tenant_id)
        return response

    def _apply_policy(self, policy, payload: AutomationSettings) -> None:  # type: ignore[no-untyped-def]
        guardrails = payload.guardrails
        policy.max_daily_budget_delta_pct = guardrails.max_daily_budget_delta_pct
        policy.min_daily_spend = guardrails.min_daily_spend
        policy.roas_floor = guardrails.roas_floor
        policy.cpa_ceiling = guardrails.cpa_ceiling
        policy.change_windows = list(guardrails.change_windows)
        policy.autopilot_mode = payload.mode.value
        policy.pushes_enabled = payload.pushes_enabled
        policy.push_cap_daily = payload.daily_push_cap
        policy.push_window_start_utc = payload.push_window_start_utc
        policy.push_window_end_utc = payload.push_window_end_utc
        policy.retention_days = payload.retention_days
        if payload.last_export_at is not None:
            policy.last_export_at = payload.last_export_at
        if payload.last_delete_at is not None:
            policy.last_delete_at = payload.last_delete_at

        consent = payload.consent
        policy.consent_status = consent.status.value
        policy.consent_version = consent.version
        policy.consent_actor = consent.actor
        if consent.status == ConsentStatus.granted:
            policy.consent_recorded_at = consent.granted_at or datetime.utcnow()
        elif consent.status == ConsentStatus.revoked:
            policy.consent_recorded_at = consent.revoked_at or datetime.utcnow()

    def _merge_alerts(
        self,
        alerts: dict[str, Any] | None,
        notes: str | None,
        context_tags: list[str],
        warnings: list[ContextWarning],
    ) -> dict[str, Any]:
        existing = dict(alerts or {})
        if notes is not None:
            existing["notes"] = notes

        if context_tags or warnings:
            existing["context"] = {
                "tags": list(context_tags),
                "warnings": [warning.model_dump() for warning in warnings],
            }
        else:
            existing.pop("context", None)
        return existing

    def _context_bundle(
        self,
        tenant_id: str,
        policy,
        *,
        tags: list[str] | None = None,
    ) -> tuple[list[str], list[ContextWarning], dict[str, Any] | None]:  # type: ignore[no-untyped-def]
        derived_tags = list(tags if tags is not None else self.context_service.derive_tags(tenant_id, metadata=None))
        autopilot_active = self._is_autopilot_enabled(policy)
        pushes_enabled = bool(getattr(policy, "pushes_enabled", False))
        payloads = self.warning_engine.evaluate(
            derived_tags,
            autopilot_enabled=autopilot_active,
            pushes_enabled=pushes_enabled,
        )
        warnings = [
            ContextWarning(
                code=item.code,
                message=item.message,
                severity=item.severity,
                tags=list(item.tags),
            )
            for item in payloads
        ]
        data_context = self._latest_context(tenant_id)
        return derived_tags, warnings, data_context

    @staticmethod
    def _is_autopilot_enabled(policy) -> bool:  # type: ignore[no-untyped-def]
        mode_value = getattr(policy, "autopilot_mode", AutomationMode.manual.value) or AutomationMode.manual.value
        try:
            return AutomationMode(mode_value) == AutomationMode.autopilot
        except ValueError:
            return str(mode_value).lower() == AutomationMode.autopilot.value

    def _to_schema(
        self,
        policy,
        *,
        context_tags: list[str] | None = None,
    ) -> AutomationSettings:  # type: ignore[no-untyped-def]
        guardrails = GuardrailSettings(
            max_daily_budget_delta_pct=policy.max_daily_budget_delta_pct,
            min_daily_spend=policy.min_daily_spend,
            roas_floor=policy.roas_floor,
            cpa_ceiling=policy.cpa_ceiling,
            change_windows=policy.change_windows or [],
        )
        mode_value = policy.autopilot_mode or AutomationMode.manual.value
        consent_status_value = policy.consent_status or ConsentStatus.pending.value
        consent_version = policy.consent_version or "1.0"
        consent = AutomationConsent(
            status=ConsentStatus(consent_status_value),
            version=consent_version,
            granted_at=policy.consent_recorded_at if policy.consent_status == "granted" else None,
            revoked_at=policy.consent_recorded_at if policy.consent_status == "revoked" else None,
            actor=policy.consent_actor,
        )
        notes = None
        if isinstance(policy.alerts, dict):
            notes = policy.alerts.get("notes")

        tags = context_tags if context_tags is not None else self.context_service.derive_tags(policy.tenant_id, metadata=None)
        return AutomationSettings(
            mode=AutomationMode(mode_value),
            pushes_enabled=policy.pushes_enabled,
            daily_push_cap=policy.push_cap_daily,
            push_window_start_utc=policy.push_window_start_utc,
            push_window_end_utc=policy.push_window_end_utc,
            guardrails=guardrails,
            consent=consent,
            retention_days=policy.retention_days,
            last_export_at=policy.last_export_at,
            last_delete_at=policy.last_delete_at,
            last_updated_at=policy.last_settings_update_at,
            updated_by=policy.last_settings_actor,
            notes=notes,
            data_context_tags=tags,
        )

    def _latest_context(self, tenant_id: str) -> dict[str, Any] | None:
        snapshot = self.context_service.latest_snapshot(tenant_id)
        if not snapshot:
            return None
        return snapshot.to_dict()

    def _request_to_schema(self, request) -> DataRequestResponse:  # type: ignore[no-untyped-def]
        return DataRequestResponse(
            request_id=request.id,
            tenant_id=request.tenant_id,
            request_type=DataRequestType(request.request_type),
            status=request.status,
            requested_by=request.requested_by,
            requested_at=request.requested_at,
            processed_at=request.processed_at,
        )

    async def _audit_settings_change(
        self,
        tenant_id: str,
        previous_consent: str | None,
        new_consent: str | None,
        previous_mode: str | None,
        new_mode: str | None,
        actor: str | None,
        context_tags: list[str],
        context_warnings: list[ContextWarning],
        data_context: dict[str, Any] | None,
    ) -> None:
        changes: dict[str, Any] = {}
        if previous_consent != new_consent:
            changes["consent_status"] = {
                "before": previous_consent,
                "after": new_consent,
            }
        if previous_mode != new_mode:
            changes["mode"] = {
                "before": previous_mode,
                "after": new_mode,
            }
        if not changes:
            return
        await self.audit_repo.record(
            tenant_id=tenant_id,
            action="automation.settings.updated",
            actor_type="user" if actor else "system",
            actor_id=actor,
            payload=changes,
        )
        await self._notify(
            "automation.settings.updated",
            {
                "tenant_id": tenant_id,
                "changes": changes,
                "actor": actor,
            },
            tenant_id=tenant_id,
            context_tags=context_tags,
            context_warnings=context_warnings,
            data_context=data_context,
        )

    async def _notify(
        self,
        event: str,
        payload: dict[str, Any],
        *,
        tenant_id: str | None = None,
        context_tags: list[str] | None = None,
        context_warnings: list[ContextWarning] | None = None,
        data_context: dict[str, Any] | None = None,
    ) -> None:
        if not self.publisher.url:
            return
        body = dict(payload)
        tags = list(context_tags or [])
        warnings = list(context_warnings or [])

        if tags:
            body.setdefault("context_tags", tags)
        if warnings:
            body.setdefault(
                "context_warnings",
                [warning.model_dump() for warning in warnings],
            )
        if data_context is None and tenant_id:
            data_context = self._latest_context(tenant_id)
        if data_context:
            body.setdefault("data_context", data_context)

        try:
            await self.publisher.publish(event, body)
        except Exception:  # pragma: no cover - logging only
            logger.warning("Failed to deliver webhook event %s", event, exc_info=True)

    def _validate_settings_response(
        self,
        payload: AutomationSettingsResponse,
        *,
        tenant_id: str,
    ) -> None:
        try:
            validate_automation_settings_response(payload)
        except (jsonschema.ValidationError, jsonschema.SchemaError) as error:
            if isinstance(error, jsonschema.ValidationError):
                path = list(error.absolute_path)
                reason = error.message
            else:
                path = []
                reason = str(error)
            logger.exception(
                "Automation settings schema validation failed for tenant %s at %s: %s",
                tenant_id,
                path or "<root>",
                reason,
            )
            raise SchemaValidationError(
                "Automation settings contract violated",
                schema="automation_settings_response",
                tenant_id=tenant_id,
                path=path,
                reason=reason,
            ) from error

    def _validate_data_request_response(
        self,
        payload: DataRequestResponse,
        *,
        tenant_id: str,
    ) -> None:
        try:
            validate_data_request_response(payload)
        except (jsonschema.ValidationError, jsonschema.SchemaError) as error:
            if isinstance(error, jsonschema.ValidationError):
                path = list(error.absolute_path)
                reason = error.message
            else:
                path = []
                reason = str(error)
            logger.exception(
                "Data request schema validation failed for tenant %s at %s: %s",
                tenant_id,
                path or "<root>",
                reason,
            )
            raise SchemaValidationError(
                "Automation data request contract violated",
                schema="data_request_response",
                tenant_id=tenant_id,
                path=path,
                reason=reason,
            ) from error
