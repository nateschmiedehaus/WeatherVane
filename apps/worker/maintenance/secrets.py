"""Utility to audit connector secrets and persist credential metadata."""

from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Sequence


@dataclass
class SecretRequirement:
    """Metadata describing an environment secret used by WeatherVane."""

    name: str
    optional: bool = False
    description: str | None = None
    service: str = "shared"
    owner: str = "ops"
    storage: str = "environment"
    rotation_sla: str = "90 days"
    fallback_contact: str = "ops@weathervane.ai"
    notes: List[str] = field(default_factory=list)


REQUIRED_SECRETS: List[SecretRequirement] = [
    SecretRequirement(
        "SHOPIFY_ACCESS_TOKEN",
        description="Shopify Admin API token",
        service="shopify",
        owner="apps/worker",
        storage="Kubernetes secret: shopify-access-token",
        rotation_sla="120 days",
        fallback_contact="oncall+ops@weathervane.ai",
        notes=["Rotate immediately if Shopify reports credential compromise."],
    ),
    SecretRequirement(
        "SHOPIFY_SHOP_DOMAIN",
        description="Shopify shop domain",
        service="shopify",
        owner="apps/worker",
        storage="Kubernetes secret: shopify-shop-domain",
        rotation_sla="Aligned with Shopify credential refresh",
        fallback_contact="oncall+ops@weathervane.ai",
    ),
    SecretRequirement(
        "META_ACCESS_TOKEN",
        optional=True,
        description="Meta Marketing API token",
        service="meta_ads",
        owner="apps/worker",
        storage="Vault: kv/marketing/meta",
        rotation_sla="60 days",
        fallback_contact="ads-platform@weathervane.ai",
        notes=["Invalidate immediately if webhook alerts signal compromise."],
    ),
    SecretRequirement(
        "META_APP_ID",
        optional=True,
        service="meta_ads",
        owner="apps/worker",
        storage="Vault: kv/marketing/meta",
        rotation_sla="Annual review",
        fallback_contact="ads-platform@weathervane.ai",
    ),
    SecretRequirement(
        "META_APP_SECRET",
        optional=True,
        service="meta_ads",
        owner="apps/worker",
        storage="Vault: kv/marketing/meta",
        rotation_sla="60 days",
        fallback_contact="ads-platform@weathervane.ai",
    ),
    SecretRequirement(
        "GOOGLEADS_DEVELOPER_TOKEN",
        optional=True,
        service="google_ads",
        owner="apps/worker",
        storage="Vault: kv/marketing/google",
        rotation_sla="Quarterly",
        fallback_contact="ads-platform@weathervane.ai",
    ),
    SecretRequirement(
        "GOOGLEADS_REFRESH_TOKEN",
        optional=True,
        service="google_ads",
        owner="apps/worker",
        storage="Vault: kv/marketing/google",
        rotation_sla="30 days",
        fallback_contact="ads-platform@weathervane.ai",
        notes=["Refresh token rotation must follow Google re-auth handshake."],
    ),
    SecretRequirement(
        "GOOGLEADS_OAUTH_CLIENT_ID",
        optional=True,
        service="google_ads",
        owner="apps/worker",
        storage="Vault: kv/marketing/google",
        rotation_sla="Annual review",
        fallback_contact="ads-platform@weathervane.ai",
    ),
    SecretRequirement(
        "GOOGLEADS_OAUTH_CLIENT_SECRET",
        optional=True,
        service="google_ads",
        owner="apps/worker",
        storage="Vault: kv/marketing/google",
        rotation_sla="60 days",
        fallback_contact="ads-platform@weathervane.ai",
    ),
    SecretRequirement(
        "GOOGLEADS_CUSTOMER_ID",
        optional=True,
        service="google_ads",
        owner="apps/worker",
        storage="Vault: kv/marketing/google",
        rotation_sla="Annual review",
        fallback_contact="ads-platform@weathervane.ai",
    ),
    SecretRequirement(
        "KLAVIYO_API_KEY",
        optional=True,
        description="Klaviyo campaign API key",
        service="klaviyo",
        owner="apps/worker",
        storage="Vault: kv/marketing/klaviyo",
        rotation_sla="90 days",
        fallback_contact="ops@weathervane.ai",
    ),
]

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CATALOG_PATH = REPO_ROOT / "state" / "security" / "credential_catalog.json"


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check required WeatherVane secrets")
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output JSON instead of human-readable text",
    )
    parser.add_argument(
        "--write-catalog",
        action="store_true",
        help="Persist credential catalog with metadata to state/security/credential_catalog.json",
    )
    parser.add_argument(
        "--catalog-path",
        type=Path,
        default=None,
        help="Override destination for credential catalog JSON (defaults to state/security/credential_catalog.json)",
    )
    return parser.parse_args(list(argv) if argv is not None else None)


def check_secrets(requirements: Sequence[SecretRequirement] = REQUIRED_SECRETS) -> dict[str, list[str]]:
    present: list[str] = []
    missing: list[str] = []
    optional_missing: list[str] = []

    for req in requirements:
        if os.getenv(req.name):
            present.append(req.name)
        else:
            if req.optional:
                optional_missing.append(req.name)
            else:
                missing.append(req.name)

    return {
        "present": present,
        "missing": missing,
        "optional_missing": optional_missing,
    }


def compile_catalog(
    requirements: Sequence[SecretRequirement] = REQUIRED_SECRETS,
    *,
    now: datetime | None = None,
) -> Dict[str, object]:
    """Compile a credential catalog including presence status and metadata."""

    timestamp = (now or datetime.now(timezone.utc)).isoformat()
    secrets_payload: list[dict[str, object]] = []
    stats = {"total": 0, "present": 0, "missing": 0, "optional_missing": 0}

    for req in requirements:
        stats["total"] += 1
        present = bool(os.getenv(req.name))
        if present:
            stats["present"] += 1
        elif req.optional:
            stats["optional_missing"] += 1
        else:
            stats["missing"] += 1
        secrets_payload.append(
            {
                "name": req.name,
                "optional": req.optional,
                "present": present,
                "description": req.description,
                "service": req.service,
                "owner": req.owner,
                "storage": req.storage,
                "rotation_sla": req.rotation_sla,
                "fallback_contact": req.fallback_contact,
                "notes": list(req.notes),
            }
        )

    return {
        "generated_at": timestamp,
        "secrets": secrets_payload,
        "stats": stats,
    }


def write_catalog(catalog: Dict[str, object], destination: Path) -> Path:
    """Persist the credential catalog to the provided location."""

    destination = destination.expanduser()
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(catalog, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return destination


def main(argv: Iterable[str] | None = None) -> None:
    args = parse_args(argv)
    report = check_secrets()
    catalog_path: Path | None = None

    if args.write_catalog:
        catalog = compile_catalog()
        destination = args.catalog_path.expanduser() if args.catalog_path is not None else DEFAULT_CATALOG_PATH
        catalog_path = write_catalog(catalog, destination)

    if args.json:
        output: Dict[str, object] = dict(report)
        if catalog_path:
            output["catalog_path"] = str(catalog_path)
        print(json.dumps(output, indent=2, sort_keys=True))
        return

    if report["missing"]:
        print("[secrets] Missing required env vars:")
        for name in report["missing"]:
            print(f"  - {name}")
    else:
        print("[secrets] All required secrets present")
    if report["optional_missing"]:
        print("[secrets] Optional (recommended) secrets not set:")
        for name in report["optional_missing"]:
            print(f"  - {name}")

    if catalog_path:
        print(f"[secrets] Credential catalog saved to {catalog_path}")


if __name__ == "__main__":
    main()

