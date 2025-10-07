from __future__ import annotations

from datetime import datetime

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
    ) -> models.Plan:
        plan = models.Plan(
            tenant_id=tenant_id,
            horizon_days=horizon_days,
            status=status,
            notes=notes,
            generated_at=datetime.utcnow(),
        )
        self.session.add(plan)
        await self.session.flush()

        for slice_payload in slices:
            plan_slice = models.PlanSlice(plan_id=plan.id, **slice_payload)
            self.session.add(plan_slice)

        await self.session.flush()
        await self.session.refresh(plan)
        return plan
