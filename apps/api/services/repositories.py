from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.db import models


class TenantRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, tenant_id: str) -> models.Tenant | None:
        stmt = select(models.Tenant).where(models.Tenant.id == tenant_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create(self, tenant_id: str, name: str, region: str | None = None) -> models.Tenant:
        tenant = models.Tenant(id=tenant_id, name=name, region=region)
        self.session.add(tenant)
        await self.session.flush()
        return tenant


class ConnectionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_by_tenant(self, tenant_id: str) -> list[models.Connection]:
        stmt = select(models.Connection).where(models.Connection.tenant_id == tenant_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())


class PlanRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def latest_plan(self, tenant_id: str) -> models.Plan | None:
        stmt = (
            select(models.Plan)
            .where(models.Plan.tenant_id == tenant_id)
            .order_by(models.Plan.generated_at.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create_plan(
        self,
        tenant_id: str,
        horizon_days: int,
        slices: list[dict[str, object]],
        status: str = "draft",
        notes: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> models.Plan:
        plan = models.Plan(
            tenant_id=tenant_id,
            horizon_days=horizon_days,
            status=status,
            notes=notes,
            metadata_payload=metadata or {},
            generated_at=datetime.utcnow(),
        )
        self.session.add(plan)
        await self.session.flush()

        for slice_payload in slices:
            payload = (
                slice_payload.model_dump()  # type: ignore[attr-defined]
                if hasattr(slice_payload, "model_dump")
                else dict(slice_payload)
            )

            plan_date = self._coerce_datetime(payload.get("plan_date") or plan.generated_at)
            geo_group = str(payload.get("geo_group_id") or "GLOBAL")
            category = str(payload.get("category") or "Uncategorised")
            channel = str(payload.get("channel") or payload.get("cell") or "unspecified")

            spend = float(payload.get("recommended_spend", 0.0) or 0.0)
            revenue_quantiles = self._to_mapping(payload.get("expected_revenue"))
            roas_quantiles = self._to_mapping(payload.get("expected_roas"))
            if not roas_quantiles:
                roas_quantiles = self._derive_roas(revenue_quantiles, spend)

            metadata = self._build_rationale_metadata(payload)

            plan_slice = models.PlanSlice(
                plan_id=plan.id,
                plan_date=plan_date,
                geo_group_id=geo_group,
                category=category,
                channel=channel,
                recommended_spend=spend,
                expected_revenue_low=float(revenue_quantiles.get("p10", 0.0) or 0.0),
                expected_revenue_mid=float(revenue_quantiles.get("p50", 0.0) or 0.0),
                expected_revenue_high=float(revenue_quantiles.get("p90", 0.0) or 0.0),
                expected_roas_low=float(roas_quantiles.get("p10", 0.0) or 0.0),
                expected_roas_mid=float(roas_quantiles.get("p50", 0.0) or 0.0),
                expected_roas_high=float(roas_quantiles.get("p90", 0.0) or 0.0),
                rationale=metadata,
            )
            self.session.add(plan_slice)

        await self.session.flush()
        await self.session.refresh(plan)
        return plan

    @staticmethod
    def _coerce_datetime(value: Any) -> datetime:
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            text = value.strip()
            if text.endswith("Z"):
                text = text[:-1] + "+00:00"
            return datetime.fromisoformat(text)
        raise ValueError("plan slice requires `plan_date`")

    @staticmethod
    def _derive_roas(expected_revenue: dict[str, Any], spend: float) -> dict[str, float]:
        if spend <= 0:
            return {"p10": 0.0, "p50": 0.0, "p90": 0.0}
        return {
            "p10": float(expected_revenue.get("p10", 0.0) or 0.0) / spend,
            "p50": float(expected_revenue.get("p50", 0.0) or 0.0) / spend,
            "p90": float(expected_revenue.get("p90", 0.0) or 0.0) / spend,
        }

    @staticmethod
    def _build_rationale_metadata(payload: dict[str, Any]) -> dict[str, Any]:
        confidence = payload.get("confidence")
        if hasattr(confidence, "value"):
            confidence = confidence.value  # type: ignore[attr-defined]
        assumptions = payload.get("assumptions") or []
        if not isinstance(assumptions, list):
            assumptions = [assumptions]
        assumptions = [str(item) for item in assumptions if item is not None]
        rationale = payload.get("rationale")
        if not isinstance(rationale, dict):
            rationale = {}
        return {
            "confidence": confidence,
            "assumptions": assumptions,
            "rationale": rationale,
            "cell": payload.get("cell"),
            "status": payload.get("status"),
        }

    @staticmethod
    def _to_mapping(value: Any) -> dict[str, Any]:
        if value is None:
            return {}
        if isinstance(value, dict):
            return value
        if hasattr(value, "model_dump"):
            return value.model_dump()
        return {}


class AdPushDiffRepository:
    def __init__(self, state_path: Path | str | None = None) -> None:
        default_path = os.getenv("AD_PUSH_STATE_PATH", "state/ad_push_diffs.json")
        self.state_path = Path(state_path or default_path)

    def latest(self, tenant_id: str) -> dict[str, Any] | None:
        tenant = str(tenant_id)
        for record in self._load_state():
            if record.get("tenant_id") == tenant:
                return record
        return None

    def get(self, tenant_id: str, run_id: str) -> dict[str, Any] | None:
        tenant = str(tenant_id)
        run = str(run_id)
        for record in self._load_state():
            if record.get("tenant_id") == tenant and record.get("run_id") == run:
                return record
        return None

    def _load_state(self) -> list[dict[str, Any]]:
        if not self.state_path.exists():
            return []
        try:
            raw = json.loads(self.state_path.read_text())
        except json.JSONDecodeError:
            return []

        records: list[dict[str, Any]] = []
        if isinstance(raw, list):
            records = [item for item in raw if isinstance(item, dict)]
        elif isinstance(raw, dict):
            records = [raw]
        return records


class AdPushRollbackRepository:
    def __init__(self, root: Path | str | None = None) -> None:
        default_root = os.getenv("AD_PUSH_ROLLBACK_ROOT", "storage/metadata/ad_push_rollback")
        self.root = Path(root or default_root)

    def get(self, tenant_id: str, run_id: str) -> dict[str, Any] | None:
        path = self.root / str(tenant_id) / f"{run_id}.json"
        if not path.exists():
            return None
        try:
            payload = json.loads(path.read_text())
        except json.JSONDecodeError:
            return None
        if not isinstance(payload, dict):
            return None
        payload.setdefault("tenant_id", str(tenant_id))
        payload.setdefault("run_id", str(run_id))
        return payload


class AutomationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def ensure_policy(self, tenant_id: str) -> models.GuardrailPolicy:
        policy = await self.session.get(models.GuardrailPolicy, tenant_id)
        if policy is None:
            policy = models.GuardrailPolicy(tenant_id=tenant_id)
            self.session.add(policy)
            await self.session.flush()
        return policy

    async def fetch_policy(self, tenant_id: str) -> models.GuardrailPolicy:
        return await self.ensure_policy(tenant_id)

    async def persist_policy(self, policy: models.GuardrailPolicy) -> models.GuardrailPolicy:
        policy.last_settings_update_at = datetime.utcnow()
        self.session.add(policy)
        await self.session.flush()
        await self.session.refresh(policy)
        return policy

    async def create_data_request(
        self,
        tenant_id: str,
        request_type: str,
        requested_by: str | None = None,
        notes: str | None = None,
    ) -> models.DataRequest:
        request = models.DataRequest(
            tenant_id=tenant_id,
            request_type=request_type,
            requested_by=requested_by,
            notes=notes,
        )
        self.session.add(request)
        await self.session.flush()
        await self.session.refresh(request)
        return request


class AuditLogRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def record(
        self,
        tenant_id: str,
        action: str,
        actor_type: str,
        actor_id: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> models.AuditLog:
        entry = models.AuditLog(
            tenant_id=tenant_id,
            actor_type=actor_type,
            actor_id=actor_id,
            action=action,
            payload=payload or {},
        )
        self.session.add(entry)
        await self.session.flush()
        await self.session.refresh(entry)
        return entry

    async def list_by_tenant(self, tenant_id: str, limit: int = 50) -> list[models.AuditLog]:
        stmt = (
            select(models.AuditLog)
            .where(models.AuditLog.tenant_id == tenant_id)
            .order_by(models.AuditLog.created_at.desc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
