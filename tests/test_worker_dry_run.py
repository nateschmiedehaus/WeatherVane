from __future__ import annotations

from importlib import util as importlib_util
from pathlib import Path

import pytest

TESTS_ROOT = Path(__file__).resolve().parent
HELPERS_PATH = TESTS_ROOT / "test_mcp_tools.py"

if not HELPERS_PATH.exists():
    # Align with pytest skip semantics so the failure is explicit in CI
    raise ImportError("test_mcp_tools.py helper is required for worker dry-run coverage")

_helpers_spec = importlib_util.spec_from_file_location("test_mcp_tools", HELPERS_PATH)
if _helpers_spec is None or _helpers_spec.loader is None:
    raise ImportError("Unable to load MCP helpers for dry-run tests")

_helpers_module = importlib_util.module_from_spec(_helpers_spec)
_helpers_spec.loader.exec_module(_helpers_module)  # type: ignore[attr-defined]

MCPTestClient = _helpers_module.MCPTestClient
_extract_json_payload = _helpers_module._extract_json_payload

REPO_ROOT = Path(__file__).resolve().parents[1]


def _collect_text_chunks(result: dict) -> list[str]:
    texts: list[str] = []
    for chunk in result.get("content", []):
        if isinstance(chunk, dict):
            text = chunk.get("text")
            if isinstance(text, str):
                texts.append(text)
    return texts


def test_worker_dry_run_enforces_read_only() -> None:
    db_path = REPO_ROOT / "state" / "orchestrator.db"
    if not db_path.exists():
        pytest.skip("state/orchestrator.db is missing; cannot validate read-only safeguards")

    with MCPTestClient("tools/wvo_mcp/dist/index.js", {"WVO_DRY_RUN": "1"}) as client:
        plan_payload = client.call_plan_next(minimal=True)
        assert isinstance(plan_payload.get("tasks"), list)

        fs_result = client.call_tool("fs_read", {"path": "README.md"})
        fs_texts = _collect_text_chunks(fs_result)
        assert fs_texts, "Expected fs_read to return content chunks"
        fs_payload = _extract_json_payload(fs_texts[0])
        assert fs_payload.get("path") == "README.md"

        observed_violation = False
        try:
            mutation_result = client.call_tool(
                "plan_update",
                {"task_id": "T1.1.1", "status": "done"},
            )
        except RuntimeError as exc:  # Raised when the MCP server surfaces the worker error
            observed_violation = "Dry-run mode forbids" in str(exc)
        else:
            texts = _collect_text_chunks(mutation_result)
            observed_violation = any("Dry-run mode forbids" in text for text in texts)

        assert observed_violation, "Expected plan_update to be blocked during dry-run mode"
