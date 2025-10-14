import json
import os
import subprocess
import textwrap
from pathlib import Path
from typing import Dict, Iterable, Tuple


def _run_guardrail_script(
    commands: Iterable[str],
    *,
    include_allowlist: bool = False,
) -> Tuple[Dict[str, dict], Iterable[str] | None]:
    repo_root = Path(__file__).resolve().parents[1]
    loader_path = repo_root / "tools" / "wvo_mcp" / "node_modules" / "ts-node" / "esm.mjs"
    if not loader_path.exists():
        raise FileNotFoundError(f"Expected ts-node loader at {loader_path}")

    env = os.environ.copy()
    ts_compiler_options = json.dumps({"module": "es2022"})
    env["NODE_NO_WARNINGS"] = "1"
    env["TS_NODE_COMPILER_OPTIONS"] = ts_compiler_options
    node_options = f"--loader={loader_path}"
    env["NODE_OPTIONS"] = f"{env.get('NODE_OPTIONS', '').strip()} {node_options}".strip()

    script = textwrap.dedent(
        f"""
        const moduleUrl = new URL('./tools/wvo_mcp/src/executor/guardrails.ts', import.meta.url);
        const workspaceRoot = {json.dumps(str(repo_root))};
        const commands = {json.dumps(list(commands))};
        const {{
          ALLOWED_COMMANDS,
          ensureAllowedCommand,
          ensureCommandSafe,
          isCommandAllowed,
        }} = await import(moduleUrl);

        const results = commands.map((cmd) => {{
          let ensureAllowedError = null;
          let ensureSafeError = null;
          const allowed = isCommandAllowed(cmd);
          try {{
            ensureAllowedCommand(cmd);
          }} catch (error) {{
            ensureAllowedError = error instanceof Error ? error.message : String(error);
          }}
          try {{
            ensureCommandSafe(cmd, workspaceRoot);
          }} catch (error) {{
            ensureSafeError = error instanceof Error ? error.message : String(error);
          }}
          return {{ command: cmd, allowed, ensureAllowedError, ensureSafeError }};
        }});

        const payload = {{ results }};
        if ({str(include_allowlist).lower()}) {{
          payload.allowList = Array.from(ALLOWED_COMMANDS);
        }}

        console.log(JSON.stringify(payload));
        """
    )

    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=repo_root,
        env=env,
        capture_output=True,
        check=True,
        text=True,
    )
    payload = json.loads(result.stdout)
    results_by_command = {entry["command"]: entry for entry in payload["results"]}
    return results_by_command, payload.get("allowList")


def test_allowlist_exposes_expected_core_commands() -> None:
    _, allow_list = _run_guardrail_script(["bash"], include_allowlist=True)
    assert allow_list is not None
    for binary in ("bash", "sh", "git", "make", "npm", "python", "pytest", "node", "tsc", "docker"):
        assert binary in allow_list
    assert "curl" not in allow_list


def test_allowlist_accepts_common_developer_commands() -> None:
    results, _ = _run_guardrail_script(["ls", "python script.py", "./scripts/restart_mcp.sh"])
    assert results["ls"]["allowed"] is True
    assert results["ls"]["ensureAllowedError"] is None
    assert results["ls"]["ensureSafeError"] is None

    assert results["python script.py"]["allowed"] is True
    assert results["python script.py"]["ensureAllowedError"] is None
    assert results["python script.py"]["ensureSafeError"] is None

    assert results["./scripts/restart_mcp.sh"]["allowed"] is True
    assert results["./scripts/restart_mcp.sh"]["ensureAllowedError"] is None
    assert results["./scripts/restart_mcp.sh"]["ensureSafeError"] is None


def test_allowlist_rejects_unknown_commands() -> None:
    results, _ = _run_guardrail_script(["curl http://example.com"])
    entry = results["curl http://example.com"]
    assert entry["allowed"] is False
    assert entry["ensureAllowedError"].startswith("Command 'curl' is not permitted.")
    assert entry["ensureSafeError"] is None


def test_allowlist_blocks_command_chaining_and_substitution() -> None:
    results, _ = _run_guardrail_script(["ls && pwd", "python $(echo hi)"])

    chaining = results["ls && pwd"]
    assert chaining["allowed"] is False
    assert chaining["ensureAllowedError"].startswith("Command chaining")
    assert chaining["ensureSafeError"] is None

    substitution = results["python $(echo hi)"]
    assert substitution["allowed"] is False
    assert substitution["ensureAllowedError"].startswith("Command substitution")
    assert substitution["ensureSafeError"] is None


def test_denylist_enforces_secondary_guardrails() -> None:
    results, _ = _run_guardrail_script(["git reset --hard", "cd .."])

    git_reset = results["git reset --hard"]
    assert git_reset["allowed"] is True
    assert git_reset["ensureAllowedError"] is None
    assert git_reset["ensureSafeError"] == "git reset --hard is blocked to protect existing changes."

    cd_parent = results["cd .."]
    assert cd_parent["allowed"] is True
    assert cd_parent["ensureAllowedError"] is None
    assert cd_parent["ensureSafeError"] == "Changing directories outside the workspace is not allowed: .."
