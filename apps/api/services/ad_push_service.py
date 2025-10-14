from __future__ import annotations

from apps.api.schemas.ad_push import AdPushDiffResponse, AdPushRollbackManifest
from .repositories import AdPushDiffRepository, AdPushRollbackRepository


class AdPushDiffService:
    def __init__(
        self,
        repository: AdPushDiffRepository | None = None,
        rollback_repository: AdPushRollbackRepository | None = None,
    ) -> None:
        self.repository = repository or AdPushDiffRepository()
        self.rollback_repository = rollback_repository or AdPushRollbackRepository()

    async def get_latest(self, tenant_id: str) -> AdPushDiffResponse | None:
        payload = self.repository.latest(tenant_id)
        if payload is None:
            return None
        return AdPushDiffResponse(**payload)

    async def get_by_run(self, tenant_id: str, run_id: str) -> AdPushDiffResponse | None:
        payload = self.repository.get(tenant_id, run_id)
        if payload is None:
            return None
        return AdPushDiffResponse(**payload)

    async def get_rollback_manifest(
        self,
        tenant_id: str,
        run_id: str,
    ) -> AdPushRollbackManifest | None:
        payload = self.rollback_repository.get(tenant_id, run_id)
        if payload is None:
            return None
        payload.setdefault("tenant_id", tenant_id)
        payload.setdefault("run_id", run_id)
        return AdPushRollbackManifest(**payload)
