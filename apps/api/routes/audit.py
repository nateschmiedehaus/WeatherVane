from __future__ import annotations

from fastapi import APIRouter, Depends, Path
from sqlalchemy.ext.asyncio import AsyncSession

from shared.schemas.base import AuditLogEntry, AuditLogResponse

from apps.api.dependencies import db_session
from apps.api.services.repositories import AuditLogRepository

router = APIRouter(prefix="/audit")


def get_audit_repo(session: AsyncSession = Depends(db_session)) -> AuditLogRepository:
    return AuditLogRepository(session)


@router.get("/{tenant_id}", response_model=AuditLogResponse)
async def list_audit_logs(
    tenant_id: str = Path(..., description="Tenant identifier"),
    limit: int = 50,
    repo: AuditLogRepository = Depends(get_audit_repo),
) -> AuditLogResponse:
    logs = await repo.list_by_tenant(tenant_id, limit=limit)
    entries = [
        AuditLogEntry(
            id=log.id,
            tenant_id=log.tenant_id,
            actor_type=log.actor_type,
            actor_id=log.actor_id,
            action=log.action,
            payload=log.payload,
            created_at=log.created_at,
        )
        for log in logs
    ]
    return AuditLogResponse(tenant_id=tenant_id, logs=entries)
