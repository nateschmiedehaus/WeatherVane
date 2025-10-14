"""Meta sandbox dry-run executor with credential vault integration."""

from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import httpx

from shared.libs.connectors import MetaAdsConfig
from shared.libs.connectors.meta import MetaAdsConnector
from shared.libs.connectors.meta_marketing import (
    AdSetSpec,
    AdSpec,
    CampaignSpec,
    CreativeSpec,
    MetaMarketingClient,
)
from shared.libs.storage.vault import CredentialVault, CredentialVaultError


def _isoformat_now() -> str:
    moment = datetime.now(timezone.utc).replace(microsecond=0)
    return moment.isoformat().replace("+00:00", "Z")


class MetaDryRunConnector(MetaAdsConnector):
    """Meta connector subclass that records requests instead of hitting the API."""

    def __init__(self, config: MetaAdsConfig, recorder: list[dict[str, Any]]) -> None:
        super().__init__(config)
        self._recorder = recorder
        self._counter = 0
        self._resource_registry: dict[str, dict[str, Any]] = {}

    async def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        payload = kwargs.get("json")
        params = kwargs.get("params")
        record: dict[str, Any] = {
            "method": method,
            "path": path,
        }
        if payload is not None:
            record["payload"] = json.loads(json.dumps(payload))
        if params is not None:
            record["params"] = json.loads(json.dumps(params))
        self._counter += 1
        response_body = self._fake_response(method, path)
        record["response"] = dict(response_body)
        self._recorder.append(record)
        request = self._client.build_request(method, path, **kwargs)
        return httpx.Response(200, json=response_body, request=request)

    def _fake_response(self, method: str, path: str) -> dict[str, Any]:
        if method == "POST":
            resource = path.rstrip("/").split("/")[-1]
            if resource == "campaigns":
                identifier = f"cmp_{self._counter}"
            elif resource == "adsets":
                identifier = f"adset_{self._counter}"
            elif resource == "adcreatives":
                identifier = f"creative_{self._counter}"
            elif resource == "ads":
                identifier = f"ad_{self._counter}"
            else:
                identifier = f"obj_{self._counter}"
            self._resource_registry[identifier] = {"resource": resource}
            return {"id": identifier}
        if method == "GET":
            identifier = path.strip("/") or "unknown"
            resource = self._resource_registry.get(identifier, {}).get("resource", "campaign")
            return {
                "id": identifier,
                "resource": resource,
                "status": "PAUSED",
                "name": f"Dry Run {resource.title()}",
            }
        return {"success": True}


@dataclass(slots=True)
class MetaSandboxResult:
    operations: list[dict[str, Any]]
    responses: dict[str, Any]


class MetaSandboxExecutor:
    """High-level sandbox runner that records Meta Marketing API operations."""

    def __init__(self, vault: CredentialVault) -> None:
        mapping = {
            "account_id": "META_ACCOUNT_ID",
            "access_token": "META_ACCESS_TOKEN",
            "app_id": "META_APP_ID",
            "app_secret": "META_APP_SECRET",
            "graph_version": "META_GRAPH_VERSION",
        }
        resolved = vault.resolve(
            "meta_ads",
            mapping,
            required=("account_id", "access_token", "app_id", "app_secret"),
        )
        secrets = resolved.secrets
        graph_version = secrets.get("graph_version") or "v19.0"
        config = MetaAdsConfig(
            access_token=secrets["access_token"],
            app_id=secrets["app_id"],
            app_secret=secrets["app_secret"],
            graph_version=graph_version,
        )
        self._operations: list[dict[str, Any]] = []
        self._connector = MetaDryRunConnector(config, self._operations)
        self._client = MetaMarketingClient(self._connector, secrets["account_id"])
        self.account_id = secrets["account_id"]
        self.credential_source = resolved.source

    async def close(self) -> None:
        await self._client.close()

    async def run_demo_plan(self) -> MetaSandboxResult:
        """Execute a representative dry-run plan and capture API interactions."""

        campaign_spec = CampaignSpec(
            name="Weather Surge Awareness",
            objective="SALES",
            daily_budget=7500,
            special_ad_categories=("NONE",),
            status="PAUSED",
        )
        campaign = await self._client.create_campaign(campaign_spec)

        adset_spec = AdSetSpec(
            name="Heatwave shoppers",
            campaign_id=campaign["id"],
            billing_event="IMPRESSIONS",
            optimization_goal="LINK_CLICKS",
            daily_budget=5000,
            targeting={
                "geo_locations": {"countries": ["US"]},
                "flexible_spec": [{"behaviors": [{"id": "6002714895372", "name": "Frequent Shoppers"}]}],
            },
        )
        adset = await self._client.create_ad_set(adset_spec)

        creative_spec = CreativeSpec(
            name="Weather-protected carousel",
            object_story_spec={
                "page_id": "1234567890",
                "link_data": {
                    "message": "Stay ahead of the forecast with guaranteed two-day delivery.",
                    "link": "https://example.com/weather-ready",
                    "call_to_action": {"type": "SHOP_NOW"},
                },
            },
        )
        creative = await self._client.create_creative(creative_spec)

        ad_spec = AdSpec(
            name="Weather guardrail launch",
            adset_id=adset["id"],
            creative_id=creative["id"],
            status="PAUSED",
        )
        ad = await self._client.create_ad(ad_spec)

        campaign_fetch = await self._client.get_campaign(
            campaign["id"],
            fields=("id", "name", "status", "objective"),
        )

        responses = {
            "campaign": campaign,
            "adset": adset,
            "creative": creative,
            "ad": ad,
            "campaign_fetch": campaign_fetch,
        }
        return MetaSandboxResult(operations=list(self._operations), responses=responses)


def _build_artifact(executor: MetaSandboxExecutor, result: MetaSandboxResult) -> dict[str, Any]:
    return {
        "generated_at": _isoformat_now(),
        "account_id": executor.account_id,
        "credential_source": executor.credential_source,
        "dry_run": True,
        "operation_count": len(result.operations),
        "operations": result.operations,
        "responses": result.responses,
    }


def _parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Meta sandbox dry-run executor")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("experiments/meta/sandbox_run.json"),
        help="Destination for sandbox run artifact (default: experiments/meta/sandbox_run.json)",
    )
    parser.add_argument(
        "--vault-path",
        type=Path,
        default=None,
        help="Override credential vault path (default: environment or state/security/credentials.json)",
    )
    return parser.parse_args(list(argv) if argv is not None else None)


async def _run_async(args: argparse.Namespace) -> dict[str, Any]:
    vault = CredentialVault(path=args.vault_path) if args.vault_path else CredentialVault()
    executor = MetaSandboxExecutor(vault)
    try:
        result = await executor.run_demo_plan()
        artifact = _build_artifact(executor, result)
    finally:
        await executor.close()

    output_path: Path = args.output.expanduser()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(artifact, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return artifact


def main(argv: Iterable[str] | None = None) -> int:
    args = _parse_args(argv)
    try:
        asyncio.run(_run_async(args))
    except CredentialVaultError as exc:
        print(f"[meta-sandbox] {exc}", flush=True)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

