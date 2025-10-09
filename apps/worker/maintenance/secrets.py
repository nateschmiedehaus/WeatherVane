"""Utility to check required environment variables for connectors."""

from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass
from typing import Iterable, List


@dataclass
class SecretRequirement:
    name: str
    optional: bool = False
    description: str | None = None


REQUIRED_SECRETS: List[SecretRequirement] = [
    SecretRequirement("SHOPIFY_ACCESS_TOKEN", description="Shopify Admin API token"),
    SecretRequirement("SHOPIFY_SHOP_DOMAIN", description="Shopify shop domain"),
    SecretRequirement("META_ACCESS_TOKEN", optional=True, description="Meta Marketing API token"),
    SecretRequirement("META_APP_ID", optional=True),
    SecretRequirement("META_APP_SECRET", optional=True),
    SecretRequirement("GOOGLEADS_DEVELOPER_TOKEN", optional=True),
    SecretRequirement("GOOGLEADS_REFRESH_TOKEN", optional=True),
    SecretRequirement("GOOGLEADS_OAUTH_CLIENT_ID", optional=True),
    SecretRequirement("GOOGLEADS_OAUTH_CLIENT_SECRET", optional=True),
    SecretRequirement("GOOGLEADS_CUSTOMER_ID", optional=True),
    SecretRequirement("KLAVIYO_API_KEY", optional=True),
]


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check required WeatherVane secrets")
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output JSON instead of human-readable text",
    )
    return parser.parse_args(list(argv) if argv is not None else None)


def check_secrets() -> dict[str, list[str]]:
    present: list[str] = []
    missing: list[str] = []
    optional_missing: list[str] = []

    for req in REQUIRED_SECRETS:
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


def main(argv: Iterable[str] | None = None) -> None:
    args = parse_args(argv)
    report = check_secrets()
    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
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


if __name__ == "__main__":
    main()
