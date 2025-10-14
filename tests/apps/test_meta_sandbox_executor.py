from __future__ import annotations

import json
from pathlib import Path

import pytest

from apps.worker.sandbox.meta_executor import MetaSandboxExecutor, MetaSandboxResult, main
from shared.libs.storage.vault import CredentialVault


def _write_vault(path: Path) -> None:
    payload = {
        "services": {
            "meta_ads": {
                "account_id": "act_123456789",
                "access_token": "vault-token",
                "app_id": "vault-app",
                "app_secret": "vault-secret",
                "graph_version": "v19.0",
            }
        }
    }
    path.write_text(json.dumps(payload), encoding="utf-8")


@pytest.mark.asyncio
async def test_meta_sandbox_executor_records_operations(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    vault_path = tmp_path / "vault.json"
    _write_vault(vault_path)
    for env_var in ("META_ACCESS_TOKEN", "META_APP_ID", "META_APP_SECRET", "META_ACCOUNT_ID"):
        monkeypatch.delenv(env_var, raising=False)

    vault = CredentialVault(path=vault_path)
    executor = MetaSandboxExecutor(vault)
    try:
        result: MetaSandboxResult = await executor.run_demo_plan()
    finally:
        await executor.close()

    assert result.operations, "Expected recorded operations"
    first_operation = result.operations[0]
    assert first_operation["path"].startswith("/act_123456789/campaigns")
    assert result.responses["campaign"]["id"].startswith("cmp_")
    assert result.responses["ad"]["id"].startswith("ad_")


def test_meta_sandbox_cli_writes_artifact(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    vault_path = tmp_path / "vault.json"
    _write_vault(vault_path)
    output_path = tmp_path / "artifact.json"
    exit_code = main(["--vault-path", str(vault_path), "--output", str(output_path)])

    assert exit_code == 0
    artifact = json.loads(output_path.read_text(encoding="utf-8"))
    assert artifact["dry_run"] is True
    assert artifact["credential_source"] == "vault"
    assert artifact["operation_count"] == len(artifact["operations"]) > 0

