"""Aggregate onboarding progress data for API responses."""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Mapping, Sequence

from shared.libs.storage.state import JsonStateStore

from . import demo
from .models import (
    AutomationAuditRecord,
    ConnectorProgressRecord,
    OnboardingMode,
    OnboardingSnapshot,
)

LOGGER = logging.getLogger(__name__)

STATE_ROOT_ENV = "ONBOARDING_STATE_ROOT"
EXPERIMENTS_ROOT_ENV = "ONBOARDING_EXPERIMENTS_ROOT"
DEFAULT_STATE_ROOT = Path("storage/metadata/state")
DEFAULT_EXPERIMENTS_ROOT = Path("experiments")

INGESTION_NAMESPACE = "ingestion"
GEOCODING_NAMESPACE = "geocoding"


async def get_onboarding_snapshot(tenant_id: str, mode: OnboardingMode) -> OnboardingSnapshot:
    """Return onboarding progress snapshot for a tenant and mode."""

    if mode is OnboardingMode.DEMO:
        connectors = list(demo.build_demo_connectors(tenant_id))
        audits = list(demo.build_demo_audits(tenant_id))
        return OnboardingSnapshot(
            tenant_id=tenant_id,
            mode=mode,
            connectors=connectors,
            audits=audits,
            fallback_reason=None,
        )

    connectors, audits = _collect_live_payload(tenant_id)
    fallback_reason = None
    if not connectors:
        fallback_reason = "live_progress_unavailable"
        LOGGER.info(
            "Fallback to demo onboarding snapshot for tenant=%s mode=%s",
            tenant_id,
            mode.value,
        )
        connectors = list(demo.build_demo_connectors(tenant_id))
        # Keep any audits we managed to assemble so telemetry still surfaces.
    return OnboardingSnapshot(
        tenant_id=tenant_id,
        mode=mode,
        connectors=connectors,
        audits=audits,
        fallback_reason=fallback_reason,
    )


def _collect_live_payload(
    tenant_id: str,
) -> tuple[list[ConnectorProgressRecord], list[AutomationAuditRecord]]:
    connectors = _build_connector_progress(tenant_id)
    audits = _build_audit_preview(tenant_id)
    return connectors, audits


def _build_connector_progress(tenant_id: str) -> list[ConnectorProgressRecord]:
    store = _state_store()
    geocoding = store.load(GEOCODING_NAMESPACE, tenant_id) or {}
    connectors: list[ConnectorProgressRecord] = []

    shopify = _shopify_progress(store, tenant_id, geocoding)
    if shopify:
        connectors.append(shopify)

    ads = _ads_progress(store, tenant_id)
    connectors.extend(record for record in ads if record)

    promo = _promo_progress(store, tenant_id)
    if promo:
        connectors.append(promo)

    weather = _weather_progress(store, tenant_id)
    if weather:
        connectors.append(weather)

    return connectors


def _shopify_progress(
    store: JsonStateStore,
    tenant_id: str,
    geocoding_state: Mapping[str, object],
) -> ConnectorProgressRecord | None:
    payload = store.load(INGESTION_NAMESPACE, f"{tenant_id}_shopify")
    updated_at = _parse_datetime(payload.get("updated_at")) if payload else None
    orders = int(payload.get("orders_row_count") or 0) if payload else 0
    products = int(payload.get("products_row_count") or 0) if payload else 0
    geocoded_ratio = _extract_ratio(payload.get("orders_geocoded_ratio"), geocoding_state.get("ratio"))

    if not payload:
        return ConnectorProgressRecord(
            slug="shopify",
            label="Shopify",
            status="action_needed",
            progress=0,
            summary="No Shopify ingestion runs detected. Connect credentials to begin syncing orders.",
            action="connect_shopify",
            updated_at=None,
        )

    if orders > 0 and geocoded_ratio is not None and geocoded_ratio >= 0.9:
        status = "ready"
        progress = 100
        action = None
    elif orders > 0:
        status = "in_progress"
        progress = 75
        action = "improve_geocoding"
    else:
        status = "in_progress"
        progress = 35
        action = "trigger_shopify_sync"

    ratio_display = f"{geocoded_ratio:.0%}" if geocoded_ratio is not None else "n/a"
    summary = f"Orders synced: {orders} (geocoded {ratio_display}); Products: {products}"
    return ConnectorProgressRecord(
        slug="shopify",
        label="Shopify",
        status=status,
        progress=progress,
        summary=summary,
        action=action,
        updated_at=updated_at,
    )


def _ads_progress(store: JsonStateStore, tenant_id: str) -> Sequence[ConnectorProgressRecord]:
    payload = store.load(INGESTION_NAMESPACE, f"{tenant_id}_ads")
    if not payload:
        return (
            ConnectorProgressRecord(
                slug="meta-primary",
                label="Meta Ads",
                status="action_needed",
                progress=0,
                summary="No Meta Ads activity recorded. Add API credentials to pull spend and conversion history.",
                action="connect_meta",
                updated_at=None,
            ),
            ConnectorProgressRecord(
                slug="google-ads",
                label="Google Ads",
                status="action_needed",
                progress=0,
                summary="No Google Ads activity recorded. Connect Google Ads to surface spend insights.",
                action="connect_google",
                updated_at=None,
            ),
        )

    updated_at = _parse_datetime(payload.get("updated_at"))
    meta_rows = int(payload.get("meta_rows") or 0)
    google_rows = int(payload.get("google_rows") or 0)

    records: list[ConnectorProgressRecord] = []
    for slug, label, rows in (
        ("meta-primary", "Meta Ads", meta_rows),
        ("google-ads", "Google Ads", google_rows),
    ):
        if rows > 0:
            status = "ready"
            progress = 100
            summary = f"Synced {rows} rows of {label} performance data."
            action = None
        else:
            status = "in_progress"
            progress = 40
            summary = f"No {label} rows synced yet. Credentials connected but data import pending."
            action = f"connect_{'meta' if slug == 'meta-primary' else 'google'}"
        records.append(
            ConnectorProgressRecord(
                slug=slug,
                label=label,
                status=status,
                progress=progress,
                summary=summary,
                action=action,
                updated_at=updated_at,
            )
        )
    return records


def _promo_progress(store: JsonStateStore, tenant_id: str) -> ConnectorProgressRecord | None:
    payload = store.load(INGESTION_NAMESPACE, f"{tenant_id}_promo")
    updated_at = _parse_datetime(payload.get("updated_at")) if payload else None
    campaigns = int(payload.get("promo_rows") or 0) if payload else 0

    if not payload:
        summary = "No Klaviyo campaigns captured. Connect Klaviyo to populate promo telemetry."
        return ConnectorProgressRecord(
            slug="klaviyo",
            label="Klaviyo",
            status="action_needed",
            progress=0,
            summary=summary,
            action="connect_klaviyo",
            updated_at=None,
        )

    if campaigns > 0:
        status = "ready"
        progress = 100
        action = None
        summary = f"Synced {campaigns} Klaviyo campaign records."
    else:
        status = "in_progress"
        progress = 40
        action = "trigger_klaviyo_sync"
        summary = "Klaviyo credentials detected; awaiting first campaign sync."

    return ConnectorProgressRecord(
        slug="klaviyo",
        label="Klaviyo",
        status=status,
        progress=progress,
        summary=summary,
        action=action,
        updated_at=updated_at,
    )


def _weather_progress(store: JsonStateStore, tenant_id: str) -> ConnectorProgressRecord | None:
    payload = store.load(INGESTION_NAMESPACE, f"{tenant_id}_window")
    updated_at = _parse_datetime(payload.get("updated_at")) if payload else None
    report_path = payload.get("report_path") if payload else None
    status = "ready" if payload else "in_progress"
    progress = 100 if payload else 50
    summary = "Weather coverage snapshot generated." if payload else "Awaiting weather coverage validation."
    action = None if payload else "refresh_weather_cache"

    return ConnectorProgressRecord(
        slug="weather",
        label="Weather Coverage",
        status=status,
        progress=progress,
        summary=summary if not report_path else f"Weather report captured at {report_path}.",
        action=action,
        updated_at=updated_at,
    )


def _build_audit_preview(tenant_id: str) -> list[AutomationAuditRecord]:
    audits: list[AutomationAuditRecord] = []
    root = _experiments_root()

    rl_audit = _rl_shadow_audit(tenant_id, root / "rl" / "shadow_mode.json")
    if rl_audit:
        audits.append(rl_audit)

    allocator_audit = _allocator_audit(tenant_id, root / "allocator" / "saturation_report.json")
    if allocator_audit:
        audits.append(allocator_audit)

    creative_audit = _creative_audit(tenant_id, root / "creative" / "response_scores.json")
    if creative_audit:
        audits.append(creative_audit)

    return audits


def _rl_shadow_audit(tenant_id: str, path: Path) -> AutomationAuditRecord | None:
    payload = _load_json(path)
    if not payload:
        return None

    generated_at = _parse_datetime(payload.get("generated_at"))
    overrides = payload.get("diagnostics", {}).get("safety_override_rate")
    guardrail_violations = payload.get("guardrail_violations", 0)
    headline = "Autopilot shadow mode guardrails exercised"
    detail = (
        f"Safety overrides fired at {overrides:.0%} rate; guardrail violations={guardrail_violations}."
        if isinstance(overrides, (int, float))
        else f"Guardrail violations={guardrail_violations} with deterministic fallback stress test."
    )
    return AutomationAuditRecord(
        id=f"{tenant_id}-audit-shadow",
        status="shadow",
        headline=headline,
        detail=detail,
        actor="Autopilot engine",
        occurred_at=generated_at,
    )


def _allocator_audit(tenant_id: str, path: Path) -> AutomationAuditRecord | None:
    payload = _load_json(path)
    if not payload:
        return None

    diagnostics = payload.get("allocator", {}).get("diagnostics", {})
    profit = diagnostics.get("scenario_profit_p50")
    guardrails = diagnostics.get("guardrail_binding", False)
    generated_at = _parse_datetime(payload.get("generated_at"))

    headline = "Allocator saturation plan validated"
    detail = (
        f"P50 profit forecast ${profit:,.0f}; guardrail binding={bool(guardrails)}."
        if isinstance(profit, (int, float))
        else "Allocator optimizer succeeded with guardrails respected."
    )
    return AutomationAuditRecord(
        id=f"{tenant_id}-audit-allocator",
        status="approved",
        headline=headline,
        detail=detail,
        actor="Allocator simulator",
        occurred_at=generated_at,
    )


def _creative_audit(tenant_id: str, path: Path) -> AutomationAuditRecord | None:
    payload = _load_json(path)
    if not payload:
        return None

    summary = payload.get("summary", {})
    blocked = summary.get("blocked_creatives")
    watchlist = summary.get("watchlist_creatives")
    generated_at = _parse_datetime(payload.get("generated_at"))

    headline = "Creative guardrail scan completed"
    detail = (
        f"{blocked} creatives blocked; {watchlist} under watch."
        if isinstance(blocked, (int, float)) and isinstance(watchlist, (int, float))
        else "Creative safety policies evaluated across latest uploads."
    )
    return AutomationAuditRecord(
        id=f"{tenant_id}-audit-creatives",
        status="approved" if (blocked == 0 and watchlist == 0) else "pending",
        headline=headline,
        detail=detail,
        actor="Guardrail scanner",
        occurred_at=generated_at,
    )


def _state_store() -> JsonStateStore:
    root = Path(os.getenv(STATE_ROOT_ENV, str(DEFAULT_STATE_ROOT)))
    return JsonStateStore(root=root)


def _experiments_root() -> Path:
    return Path(os.getenv(EXPERIMENTS_ROOT_ENV, str(DEFAULT_EXPERIMENTS_ROOT)))


def _parse_datetime(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _extract_ratio(*candidates: object) -> float | None:
    for value in candidates:
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            try:
                return float(value)
            except ValueError:
                continue
    return None


def _load_json(path: Path) -> dict[str, object] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        LOGGER.warning("Failed to parse onboarding artifact %s", path)
        return None
