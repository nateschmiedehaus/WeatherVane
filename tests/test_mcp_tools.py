import json
import os
import select
import subprocess
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TIMEOUT = 5.0

CODEX_TOOLS = frozenset(
    [
        "orchestrator_status",
        "auth_status",
        "plan_next",
        "plan_update",
        "context_write",
        "context_snapshot",
        "fs_read",
        "fs_write",
        "cmd_run",
        "critics_run",
        "autopilot_record_audit",
        "autopilot_status",
        "worker_health",
        "heavy_queue_enqueue",
        "heavy_queue_update",
        "heavy_queue_list",
        "artifact_record",
        "codex_commands",
        "mcp_admin_flags",
        "settings_update",
        "route_switch",
        "upgrade_apply_patch",
        "tool_manifest",
        "lsp_initialize",
        "lsp_server_status",
        "lsp_definition",
        "lsp_references",
        "lsp_hover",
    ]
)

CLAUDE_TOOLS = frozenset(
    [
        "wvo_status",
        "state_save",
        "state_metrics",
        "state_prune",
        "quality_standards",
        "quality_checklist",
        "quality_philosophy",
        "provider_status",
        "auth_status",
        "roadmap_check_and_extend",
        "plan_next",
        "plan_update",
        "context_write",
        "context_snapshot",
        "fs_read",
        "fs_write",
        "cmd_run",
        "critics_run",
        "autopilot_record_audit",
        "autopilot_status",
        "command_autopilot",
        "heavy_queue_enqueue",
        "heavy_queue_update",
        "heavy_queue_list",
        "artifact_record",
        "cli_commands",
        "mcp_admin_flags",
        "screenshot_capture",
        "screenshot_capture_multiple",
        "screenshot_session",
        "lsp_initialize",
        "lsp_server_status",
        "lsp_definition",
        "lsp_references",
        "lsp_hover",
    ]
)


def _extract_json_payload(text: str) -> Dict[str, object]:
    if "```json" in text:
        snippet = text.split("```json", 1)[1]
        json_str = snippet.split("```", 1)[0]
        return json.loads(json_str.strip())
    cleaned = text.strip()
    if cleaned.startswith(("✅", "❌", "🚀", "📋", "🔍")):
        parts = cleaned.split("\n", 1)
        if len(parts) > 1:
            cleaned = parts[1].strip()
    return json.loads(cleaned)


class MCPTestClient:
    def __init__(
        self,
        entry_path: str,
        env_updates: Optional[Dict[str, str]] = None,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        self.entry_path = entry_path
        self.env_updates = env_updates or {}
        self.timeout = timeout
        self.proc: Optional[subprocess.Popen[str]] = None
        self._next_id = 1
        self.stderr_lines: List[str] = []
        self._notifications: List[dict] = []

    def __enter__(self) -> "MCPTestClient":
        env = os.environ.copy()
        env.update(self.env_updates)
        command = ["node", self.entry_path]
        self.proc = subprocess.Popen(
            command,
            cwd=str(REPO_ROOT),
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        self._initialize()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    def close(self) -> None:
        if not self.proc:
            return
        if self.proc.poll() is None:
            self.proc.terminate()
            try:
                _, err = self.proc.communicate(timeout=2)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                _, err = self.proc.communicate(timeout=2)
        else:
            _, err = self.proc.communicate()
        self.stderr_lines = [line for line in (err or "").splitlines() if line]
        self.proc = None

    def _initialize(self) -> None:
        self._request(
            "initialize",
            {
                "protocolVersion": "2025-06-18",
                "clientInfo": {"name": "weathervane-tests", "version": "0.0.1"},
                "capabilities": {},
            },
        )
        self._send({"jsonrpc": "2.0", "method": "initialized", "params": {}})

    def list_tools(self) -> List[str]:
        result = self._request("tools/list", {})
        tools = result.get("tools", [])
        return [tool["name"] for tool in tools]

    def call_plan_next(self, **arguments) -> Dict[str, object]:
        params = {"name": "plan_next", "arguments": {"limit": 1, **arguments}}
        result = self._request("tools/call", params)
        content = result.get("content", [])
        assert content, "plan_next returned no content"
        payload = _extract_json_payload(content[0]["text"])
        return payload

    def call_tool(self, name: str, arguments: Optional[dict] = None) -> dict:
        params = {"name": name, "arguments": arguments or {}}
        return self._request("tools/call", params)

    def _request(self, method: str, params: Optional[dict]) -> dict:
        request_id = self._next_id
        self._next_id += 1
        message = {"jsonrpc": "2.0", "id": request_id, "method": method}
        if params is not None:
            message["params"] = params
        self._send(message)
        while True:
            msg = self._read_message()
            if msg.get("id") == request_id:
                if "error" in msg:
                    raise RuntimeError(f"MCP request failed: {msg['error']}")
                return msg["result"]
            self._notifications.append(msg)

    def _send(self, message: dict) -> None:
        if not self.proc or not self.proc.stdin:
            raise RuntimeError("MCP process is not running")
        serialized = json.dumps(message)
        self.proc.stdin.write(serialized + "\n")
        self.proc.stdin.flush()

    def _read_message(self) -> dict:
        if not self.proc or not self.proc.stdout:
            raise RuntimeError("MCP process is not running")
        deadline = time.monotonic() + self.timeout
        stdout = self.proc.stdout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("Timed out waiting for MCP response")
            ready, _, _ = select.select([stdout], [], [], remaining)
            if not ready:
                continue
            line = stdout.readline()
            if line == "":
                if self.proc.poll() is not None:
                    raise RuntimeError("MCP process exited unexpectedly")
                continue
            stripped = line.strip()
            if not stripped:
                continue
            try:
                return json.loads(stripped)
            except json.JSONDecodeError:
                # Server may emit human-readable logs on stdout before responding.
                # Skip any non-JSON lines and continue reading until a valid message arrives.
                continue


def _contains_error(lines: List[str]) -> bool:
    return any('"level":"error"' in line or "Unhandled MCP server error" in line for line in lines)


def _clear_pid_lock() -> None:
    pid_path = REPO_ROOT / "state" / ".mcp.pid"
    if pid_path.exists():
        try:
            pid_path.unlink()
        except OSError:
            pass


def _fetch_tools(
    entry_path: str, env_updates: Optional[Dict[str, str]] = None
) -> Tuple[List[str], Dict[str, object], List[str]]:
    _clear_pid_lock()
    client = MCPTestClient(entry_path, env_updates)
    with client:
        tool_names = client.list_tools()
        payload = client.call_plan_next(minimal=True)
        assert "tasks" in payload
        assert isinstance(payload["tasks"], list)
    return tool_names, payload, client.stderr_lines


@pytest.mark.parametrize(
    "entry_path,expected_tools",
    [
        ("tools/wvo_mcp/dist/index.js", CODEX_TOOLS),
        ("tools/wvo_mcp/dist/index-claude.js", CLAUDE_TOOLS),
    ],
)
def test_mcp_tool_inventory_and_dry_run_parity(entry_path: str, expected_tools: frozenset[str]) -> None:
    tools, payload, stderr = _fetch_tools(entry_path, {})
    assert set(tools) == expected_tools
    assert len(tools) == len(expected_tools)
    assert len(tools) == len(set(tools)), "Tool inventory contains duplicates"
    assert not _contains_error(stderr)
    assert payload.get("profile") in {"low", "medium", "high"}
    assert payload.get("clusters") in ([], None)
    if "correlation_id" in payload:
        assert isinstance(payload["correlation_id"], str)
        assert payload["correlation_id"].startswith("mcp:plan_next:")
    if "count" in payload:
        assert payload["count"] == len(payload["tasks"])
    assert payload.get("tasks") is not None
    live_tasks = payload["tasks"]

    dry_tools, dry_payload, dry_stderr = _fetch_tools(entry_path, {"WVO_DRY_RUN": "1"})
    assert set(dry_tools) == expected_tools
    assert len(dry_tools) == len(expected_tools)
    assert len(dry_tools) == len(set(dry_tools)), "Tool inventory contains duplicates under dry-run"
    assert not _contains_error(dry_stderr)
    assert dry_payload.get("profile") == payload.get("profile")
    assert dry_payload.get("clusters") == payload.get("clusters")
    if "correlation_id" in dry_payload:
        assert isinstance(dry_payload["correlation_id"], str)
        assert dry_payload["correlation_id"].startswith("mcp:plan_next:")
    if "count" in dry_payload:
        assert dry_payload["count"] == len(live_tasks)

    assert dry_payload.get("tasks") == live_tasks, "plan_next results differ under dry-run"


@pytest.mark.parametrize(
    "entry_path",
    [
        "tools/wvo_mcp/dist/index.js",
        "tools/wvo_mcp/dist/index-claude.js",
    ],
)
def test_dry_run_blocks_mutating_tools(entry_path: str) -> None:
    _clear_pid_lock()
    with MCPTestClient(entry_path, {"WVO_DRY_RUN": "1"}) as client:
        result = client.call_tool(
            "context_write",
            {"section": "dry-run-check", "content": "mutations should fail", "append": False},
        )
    if "isError" in result:
        assert result["isError"] is True
    texts = [chunk.get("text", "") for chunk in result.get("content", []) if isinstance(chunk, dict)]
    assert any("Dry-run mode forbids" in text for text in texts)
