from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from typing import Any

import httpx
import pytest


class LightweightTestClient:
    """Async httpx-based test client compatible with FastAPI's TestClient API."""

    __test__ = False  # Prevent pytest from collecting this helper as a test class.

    def __init__(
        self,
        app: Any,
        *,
        base_url: str = "http://testserver",
        timeout: float | httpx.Timeout | None = 5.0,
        headers: dict[str, str] | None = None,
        cookies: dict[str, str] | None = None,
    ) -> None:
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        self._client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url=base_url,
            headers=headers,
            cookies=cookies,
            timeout=timeout,
        )

    def __enter__(self) -> "LightweightTestClient":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    def close(self) -> None:
        self._run(self._client.aclose())
        self._loop.close()
        asyncio.set_event_loop(None)

    def _run(self, awaitable):
        return self._loop.run_until_complete(awaitable)

    def request(self, method: str, *args, **kwargs):
        return self._run(self._client.request(method, *args, **kwargs))

    def get(self, *args, **kwargs):
        return self._run(self._client.get(*args, **kwargs))

    def post(self, *args, **kwargs):
        return self._run(self._client.post(*args, **kwargs))

    def put(self, *args, **kwargs):
        return self._run(self._client.put(*args, **kwargs))

    def delete(self, *args, **kwargs):
        return self._run(self._client.delete(*args, **kwargs))

    def patch(self, *args, **kwargs):
        return self._run(self._client.patch(*args, **kwargs))

    @property
    def cookies(self):
        return self._client.cookies

    @property
    def app(self):
        transport = self._client._transport  # type: ignore[attr-defined]
        return getattr(transport, "app", None)


def _install_test_client_patch() -> None:
    try:
        import fastapi.testclient as fastapi_testclient

        fastapi_testclient.TestClient = LightweightTestClient  # type: ignore[assignment]
    except ImportError:  # pragma: no cover
        pass

    try:
        import starlette.testclient as starlette_testclient

        starlette_testclient.TestClient = LightweightTestClient  # type: ignore[assignment]
    except ImportError:  # pragma: no cover
        pass


_install_test_client_patch()

# Disable experiments routes during tests to avoid optional heavy dependencies.
os.environ.setdefault("WEATHERVANE_DISABLE_EXPERIMENTS_ROUTES", "1")

# Add project root to Python path
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

@pytest.fixture(autouse=True)
def setup_test_env(tmp_path):
    """Set up test environment."""
    # Create directories needed by tests
    for path in [
        "state/analytics",
        "state/telemetry",
        "state/artifacts/stakeholder",
        "docs/models"
    ]:
        (tmp_path / path).mkdir(parents=True, exist_ok=True)

    # Override root directory for tests
    os.environ["WEATHERVANE_ROOT"] = str(tmp_path)
