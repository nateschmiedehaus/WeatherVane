from pathlib import Path
from typing import Dict, List

from tools.wvo_mcp.scripts import autopilot_console_menu as menu


def test_codex_login_sets_environment(monkeypatch):
  captured: Dict[str, str] = {}
  commands: List[List[str]] = []
  statuses: List[str] = []

  def fake_run(command, check=True, env=None):  # type: ignore[override]
    commands.append(command)
    if env:
      captured.update(env)
    return None

  def fake_status(session, provider, value):
    statuses.append(value)

  monkeypatch.setattr(menu, "run_subprocess", fake_run)
  monkeypatch.setattr(menu, "update_provider_status", fake_status)

  account = {
    "id": "codex_personal",
    "label": "personal",
    "home": "/tmp/codex_personal",
    "profile": "weathervane_orchestrator",
  }

  menu.codex_login(account, session="tmux-session")

  assert commands == [["codex", "login"]]
  assert captured["CODEX_HOME"] == "/tmp/codex_personal"
  assert captured["CODEX_PROFILE_NAME"] == "weathervane_orchestrator"
  assert statuses[-1].startswith("🛠 codex: personal")


def test_claude_login_uses_skip_permissions(monkeypatch):
  commands: List[List[str]] = []

  def fake_run(command, check=True, env=None):  # type: ignore[override]
    commands.append(command)
    return None

  monkeypatch.setattr(menu, "run_subprocess", fake_run)

  account = {
    "id": "claude_primary",
    "label": "primary",
    "bin": "claude",
  }

  menu.claude_login(account, session=None)

  assert commands == [["claude", "login", "--dangerously-skip-permissions"]]


def test_codex_set_approval_invokes_configure(monkeypatch, tmp_path: Path):
  commands: List[List[str]] = []
  statuses: List[str] = []

  def fake_run(command, check=True, env=None):  # type: ignore[override]
    commands.append(command)
    return None

  def fake_status(session, provider, value):
    statuses.append(value)

  monkeypatch.setattr(menu, "run_subprocess", fake_run)
  monkeypatch.setattr(menu, "update_provider_status", fake_status)

  account = {
    "id": "codex_client",
    "label": "client",
    "home": str(tmp_path / "codex_client"),
    "profile": "weathervane_orchestrator",
  }

  workspace = tmp_path / "workspace"
  instructions = tmp_path / "instructions.md"
  workspace.mkdir()
  instructions.write_text("base instructions", encoding="utf-8")

  menu.codex_set_approval(account, "on-request", "tmux-session", workspace, instructions)

  assert commands, "configure_codex_profile.py was not invoked"
  configure_cmd = commands[0]
  assert "configure_codex_profile.py" in configure_cmd[1]
  assert configure_cmd[-2:] == ["--ask-for-approval", "on-request"]
  assert statuses[-1].endswith("approval=on-request]")


def test_bootstrap_top_permissions(monkeypatch, tmp_path: Path):
  workspace = tmp_path / "workspace"
  instructions = workspace / "prompt.md"
  workspace.mkdir()
  instructions.write_text("prompt", encoding="utf-8")

  called: List[tuple] = []

  def fake_load_config():
    return {
      "codex": [
        {"id": "codex_personal", "label": "personal", "home": str(tmp_path / "codex_home"), "profile": "weathervane_orchestrator"}
      ],
      "claude": [
        {"id": "claude_primary", "label": "primary"}
      ],
    }

  def fake_codex_login(account, session):
    called.append(("codex_login", account["id"], session))

  def fake_codex_set_approval(account, level, session, workspace_path, instructions_path):
    called.append(("codex_approval", account["id"], level, str(workspace_path), str(instructions_path)))

  def fake_claude_login(account, session):
    called.append(("claude_login", account["id"], session))

  monkeypatch.setattr(menu, "load_config", fake_load_config)
  monkeypatch.setattr(menu, "codex_login", fake_codex_login)
  monkeypatch.setattr(menu, "codex_set_approval", fake_codex_set_approval)
  monkeypatch.setattr(menu, "claude_login", fake_claude_login)

  status_updates: List[str] = []
  monkeypatch.setattr(menu, "update_provider_status", lambda session, provider, value: status_updates.append(f"{provider}:{value}"))

  exit_code = menu.bootstrap_top_permissions("tmux-session", workspace, instructions, "always")

  assert exit_code == 0
  assert ("codex_login", "codex_personal", "tmux-session") in called
  assert ("claude_login", "claude_primary", "tmux-session") in called
  assert any(item[0] == "codex_approval" and item[1] == "codex_personal" and item[2] == "always" for item in called)
