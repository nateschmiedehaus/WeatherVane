from __future__ import annotations

import argparse
import asyncio
from datetime import datetime

from apps.worker.flows.poc_pipeline import orchestrate_poc_flow


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="WeatherVane worker entrypoint")
    parser.add_argument("tenant", nargs="?", default="demo-tenant", help="Tenant identifier")
    parser.add_argument("--start", dest="start", help="ISO8601 start date (optional)")
    parser.add_argument("--end", dest="end", help="ISO8601 end date (optional)")
    return parser.parse_args()


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value)


async def main_async(args: argparse.Namespace) -> dict[str, object]:
    return await orchestrate_poc_flow(
        tenant_id=args.tenant,
        start_date=_parse_datetime(args.start),
        end_date=_parse_datetime(args.end),
    )


def main() -> None:
    args = parse_args()
    result = asyncio.run(main_async(args))

    print("[weathervane-worker] PoC pipeline complete")
    if result:
        print(result)


if __name__ == "__main__":
    main()
