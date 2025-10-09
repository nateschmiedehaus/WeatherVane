from __future__ import annotations

import logging
from typing import Any, Mapping

import httpx

logger = logging.getLogger(__name__)


class WebhookPublisher:
    def __init__(self, url: str | None) -> None:
        self.url = url

    async def publish(self, event: str, payload: Mapping[str, Any]) -> None:
        if not self.url:
            return
        data = {"event": event, "payload": dict(payload)}
        headers: dict[str, str] = {}
        context_tags = data["payload"].get("context_tags")
        if isinstance(context_tags, list) and context_tags:
            headers["X-WeatherVane-Context"] = ",".join(str(tag) for tag in context_tags)
        context_warnings = data["payload"].get("context_warnings")
        if isinstance(context_warnings, list) and context_warnings:
            codes = [
                warning.get("code")
                for warning in context_warnings
                if isinstance(warning, Mapping) and warning.get("code")
            ]
            if codes:
                headers["X-WeatherVane-Warnings"] = ",".join(str(code) for code in codes)
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(self.url, json=data, headers=headers or None)
        except httpx.HTTPError:
            logger.warning("Webhook delivery failed for %s", event, exc_info=True)
