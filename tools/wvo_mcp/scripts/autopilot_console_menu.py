#!/usr/bin/env python3
"""Interactive command tree for managing autopilot agent accounts inside tmux."""

from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
import sys
import textwrap
from pathlib import Path
from typing import Dict, List, Optional

ROOT = Path(__file__).resolve().parents[3]
SCRIPT_DIR = Path(__file__).resolve().parent

if str(SCRIPT_DIR) not in sys.path:
  sys.path.insert(0, str(SCRIPT_DIR))

try:
  from account_manager import load_config  # type: ignore
except ImportError:  # pragma: no cover - defensive fallback.
  load_config = None  # type: ignore[assignment]


def account_label(account: Dict[str, object]) -> str:
  label = str(account.get("label") or "").strip()
  if label:
    return label
  identifier = str(account.get("id") or "").strip()
  return identifier or "unnamed"


def run_subprocess(command: List[str], env: Optional[Dict[str, str]] = None) -> subprocess.CompletedProcess:
  return subprocess.run(command, check=True, env=env)


def tmux_set_option(session: Optional[str], key: str, value: str) -> None:
  if not session:
    return
  try:
    subprocess.run(
      ["tmux", "set-option", "-t", session, key, value],
      check=True,
      stdout=subprocess.DEVNULL,
      stderr=subprocess.DEVNULL,
    )
  except (subprocess.CalledProcessError, FileNotFoundError):
    # Safe to ignore when tmux is unavailable (e.g., unit tests).
    pass


def update_provider_status(session: Optional[str], provider: str, value: str) -> None:
  if provider == "codex":
    tmux_set_option(session, "@wvo_codex_status", value)
  elif provider == "claude":
    tmux_set_option(session, "@wvo_claude_status", value)
  elif provider == "glm":
    tmux_set_option(session, "@wvo_glm_status", value)


def tmux_popup(session: Optional[str], title: str, command: str, *, width: str = "90%", height: str = "80%") -> None:
  popup_args = ["tmux", "display-popup", "-E", "-w", width, "-h", height, "-T", title]
  if session:
    popup_args.extend(["-t", session])
  popup_args.extend(["bash", "-lc", command])
  try:
    subprocess.run(popup_args, check=True)
  except FileNotFoundError:
    print(f"\n┌─ {title} ─────────────────────────────┐")
    subprocess.run(["bash", "-lc", command], check=False)
    print("└───────────────────────────────────────┘")
  except subprocess.CalledProcessError as exc:
    print(f"⚠️  Unable to open tmux popup ({exc})")


def repo_shell(command: str) -> str:
  return f"cd {shlex.quote(str(ROOT))} && {command}"


def python_popup(session: Optional[str], title: str, script: str, *, width: str = "90%", height: str = "80%") -> None:
  normalized = textwrap.dedent(script).strip("\n")
  command = repo_shell(f"python - <<'PY'\n{normalized}\nPY")
  tmux_popup(session, title, command, width=width, height=height)


def bootstrap_top_permissions(
  session: Optional[str],
  workspace: Path,
  instructions: Path,
  level: str,
) -> int:
  if load_config is None:
    print("⚠️  Account manager unavailable; skipping top-permission bootstrap.")
    return 1

  if not instructions.exists():
    print(f"⚠️  Instructions file missing at {instructions}; Codex approval updates may fail.")

  try:
    config = load_config()
  except Exception as exc:  # pragma: no cover - defensive fallback
    print(f"❌ Failed to load state/accounts.yaml: {exc}")
    return 1

  errors = 0

  def safe_run(label: str, func) -> None:
    nonlocal errors
    try:
      func()
    except Exception as exc:  # pragma: no cover - defensive fallback
      errors += 1
      print(f"⚠️  {label}: {exc}")

  for account in config.get("codex", []):
    label = account_label(account)
    safe_run(f"Codex login ({label})", lambda acc=account: codex_login(acc, session))
    safe_run(
      f"Codex approval ({label})",
      lambda acc=account: codex_set_approval(acc, level, session, workspace, instructions),
    )

  for account in config.get("claude", []):
    label = account_label(account)
    safe_run(f"Claude login ({label})", lambda acc=account: claude_login(acc, session))

  if errors:
    print(f"⚠️  Top-permission bootstrap completed with {errors} issue(s).")
  else:
    print("✅ Top permissions applied to configured services.")
  return 0 if errors == 0 else 1


def codex_login(account: Dict[str, object], session: Optional[str]) -> None:
  home = Path(str(account.get("home") or "")).expanduser()
  profile = str(account.get("profile") or "weathervane_orchestrator")
  env = os.environ.copy()
  env["CODEX_HOME"] = str(home)
  env["CODEX_PROFILE_NAME"] = profile
  label = account_label(account)
  try:
    run_subprocess(["codex", "login"], env=env)
    update_provider_status(session, "codex", f"🛠 codex: {label} [login ok]")
    print(f"✅ Codex login refreshed for {label} ({profile}).")
  except FileNotFoundError:
    update_provider_status(session, "codex", "🛠 codex: cli missing")
    print("❌ Codex CLI not found in PATH. Install the Codex CLI to authenticate accounts.")
  except subprocess.CalledProcessError as exc:
    update_provider_status(session, "codex", f"🛠 codex: {label} [login failed]")
    print(f"❌ Codex login failed for {label} ({profile}). Exit code {exc.returncode}.")


def codex_set_approval(
  account: Dict[str, object],
  level: str,
  session: Optional[str],
  workspace: Path,
  instructions: Path,
) -> None:
  level = level.lower()
  if level not in {"never", "on-request", "always"}:
    raise ValueError("Unsupported Codex approval level. Use never, on-request, or always.")

  profile = str(account.get("profile") or "weathervane_orchestrator")
  home = Path(str(account.get("home") or "")).expanduser()
  config_path = home / "config.toml"
  configure_script = ROOT / "tools" / "wvo_mcp" / "scripts" / "configure_codex_profile.py"

  command = [
    sys.executable,
    str(configure_script),
    str(config_path),
    profile,
    str(workspace),
    str(instructions),
    "--ask-for-approval",
    level,
  ]

  try:
    run_subprocess(command)
    label = account_label(account)
    update_provider_status(session, "codex", f"🛠 codex: {label} [approval={level}]")
    print(f"✅ Updated Codex approval policy for {label} → {level}.")
  except subprocess.CalledProcessError as exc:
    print(f"❌ Failed to update Codex approval policy (exit code {exc.returncode}).")


def claude_login(account: Dict[str, object], session: Optional[str]) -> None:
  bin_name = str(account.get("bin") or "claude")
  env_overrides = account.get("env") or {}
  env = os.environ.copy()
  if isinstance(env_overrides, dict):
    for key, value in env_overrides.items():
      env[str(key)] = str(value)

  label = account_label(account)
  try:
    run_subprocess([bin_name, "login", "--dangerously-skip-permissions"], env=env)
    update_provider_status(session, "claude", f"🧠 claude: {label} [login ok]")
    print(f"✅ Claude login refreshed for {label}.")
  except FileNotFoundError:
    update_provider_status(session, "claude", "🧠 claude: cli missing")
    print("❌ Claude CLI not found in PATH. Install the Claude CLI to authenticate accounts.")
  except subprocess.CalledProcessError as exc:
    update_provider_status(session, "claude", f"🧠 claude: {label} [login failed]")
    print(f"❌ Claude login failed for {label}. Exit code {exc.returncode}.")


def list_providers(config: Dict[str, List[Dict[str, object]]]) -> List[str]:
  providers: List[str] = []
  if config.get("codex"):
    providers.append("codex")
  if config.get("claude"):
    providers.append("claude")
  providers.append("glm")
  return providers


def diagnostics_menu(session: Optional[str]) -> None:
  log_path = Path(os.environ.get("WVO_AUTOPILOT_LOG", "/tmp/wvo_autopilot.log"))
  state_file = Path(os.environ.get("WVO_AUTOPILOT_STATE_FILE", "/tmp/wvo_autopilot_last.json"))
  events_path = Path(os.environ.get("WVO_AUTOPILOT_EVENTS_PATH", ROOT / "state" / "autopilot_events.jsonl"))
  sessions_path = ROOT / "state" / "autopilot_sessions.jsonl"
  try:
    agent_refresh = float(os.environ.get("WVO_AUTOPILOT_AGENT_REFRESH", "2"))
  except ValueError:
    agent_refresh = 2.0
  agent_refresh_str = f"{agent_refresh:g}" if agent_refresh else "2"

  while True:
    print("\n╔════════════════ Diagnostics ════════════════╗")
    print("║ 1) Live agent dashboard (follow)            ║")
    print("║ 2) Live activity feed (follow)              ║")
    print("║ 3) Current summary snapshot                 ║")
    print("║ 4) Blocker history (last 5 summaries)       ║")
    print("║ 5) Tail autopilot log (last 120 lines)      ║")
    print("║ 6) Status ticker snapshot                   ║")
    print("║  b) Back                                    ║")
    print("╚═════════════════════════════════════════════╝")
    choice = input("Select diagnostic: ").strip().lower()
    if choice in {"b", "q"}:
      return
    if choice == "1":
      cmd = repo_shell(
        "PYTHONUNBUFFERED=1 python tools/wvo_mcp/scripts/activity_feed.py --mode agents --follow --interval "
        + agent_refresh_str
      )
      tmux_popup(session, "Agent Dashboard ▸ live", cmd)
      continue
    if choice == "2":
      cmd = repo_shell(
        "PYTHONUNBUFFERED=1 python tools/wvo_mcp/scripts/activity_feed.py --mode feed --follow --tail 60"
      )
      tmux_popup(session, "Activity Feed ▸ live", cmd)
      continue
    if choice == "3":
      state_path_json = json.dumps(str(state_file))
      state_path_text = json.dumps(str(state_file))
      summary_template = """
import datetime, json, pathlib, textwrap
state_path = pathlib.Path({state_path})
if not state_path.exists():
    print("No summary available at {state_text}.")
    raise SystemExit(0)
try:
    data = json.loads(state_path.read_text(encoding='utf-8') or '{}')
except json.JSONDecodeError:
    print("Summary file is not valid JSON.")
    raise SystemExit(0)
if isinstance(data, list):
    data = next((item for item in data if isinstance(item, dict)), {{}}) or {{}}
elif not isinstance(data, dict):
    data = {{}}
ts = datetime.datetime.fromtimestamp(state_path.stat().st_mtime, datetime.timezone.utc)
print(f"Summary captured at {{ts.isoformat()}}")
print()
def section(title, entries):
    print(f"{{title}}:")
    if not entries:
        print("  (none)\n")
        return
    for entry in entries:
        if isinstance(entry, str):
            print(f"  - {{entry}}")
        else:
            print(f"  - {{json.dumps(entry, ensure_ascii=False)}}")
    print()
section("Completed", data.get("completed_tasks") or [])
section("In Progress", data.get("in_progress") or [])
section("Next Focus", data.get("next_focus") or [])
section("Blockers", data.get("blockers") or [])
notes = (data.get("notes") or "").strip()
if notes:
    print("Notes:")
    print(textwrap.dedent(notes))
      """
      summary_script = textwrap.dedent(summary_template).format(
        state_path=state_path_json,
        state_text=state_path_text,
      )
      python_popup(session, "Current Autopilot Summary", summary_script, width="70%", height="75%")
      continue
    if choice == "4":
      sessions_path_json = json.dumps(str(sessions_path))
      blockers_template = """
import datetime, json, pathlib
path = pathlib.Path({sessions_path})
if not path.exists():
    print("No session archive found at {sessions_text}.")
    raise SystemExit(0)
lines = [line for line in path.read_text(encoding='utf-8').splitlines() if line.strip()][-5:]
if not lines:
    print("No recorded summaries yet.")
    raise SystemExit(0)
def normalise_ts(raw):
    if not raw:
        return "unknown"
    try:
        return datetime.datetime.fromisoformat(str(raw).replace('Z', '+00:00')).isoformat()
    except Exception:
        return str(raw)
for raw in reversed(lines):
    entry = json.loads(raw)
    ts = normalise_ts(entry.get('completed_at') or entry.get('timestamp'))
    blockers = entry.get('blockers') or []
    print(f"[{{ts}}] Blockers:")
    if not blockers:
        print("  (none)\n")
    else:
        for blk in blockers:
            if isinstance(blk, str):
                print(f"  - {{blk}}")
            else:
                print(f"  - {{json.dumps(blk, ensure_ascii=False)}}")
        print()
      """
      blockers_script = textwrap.dedent(blockers_template).format(
        sessions_path=sessions_path_json,
        sessions_text=json.dumps(str(sessions_path)),
      )
      python_popup(session, "Blocker History (last 5)", blockers_script, width="80%", height="70%")
      continue
    if choice == "5":
      command = repo_shell(
        f"if [ -f {shlex.quote(str(log_path))} ]; then tail -n 120 {shlex.quote(str(log_path))}; "
        f"else echo 'Log file not found: {log_path}'; fi"
      )
      tmux_popup(session, "Autopilot Log ▸ tail -120", command, width="85%", height="70%")
      continue
    if choice == "6":
      command = repo_shell(
        f"python tools/wvo_mcp/scripts/autopilot_status_line.py --log {shlex.quote(str(log_path))} --events {shlex.quote(str(events_path))}"
      )
      tmux_popup(session, "Status Snapshot", command, width="70%", height="40%")
      continue
    print("⚠️  Invalid selection.")


def account_action_menu(
  provider: str,
  account: Dict[str, object],
  session: Optional[str],
  workspace: Path,
  instructions: Path,
) -> None:
  label = account_label(account)
  while True:
    print(f"\n[{provider}] {label}")
    print("  1) Login / refresh credentials")
    if provider == "codex":
      print("  2) Set approval policy (never / on-request / always)")
    print("  b) Back")
    choice = input("Select option: ").strip().lower()
    if choice == "1":
      if provider == "codex":
        codex_login(account, session)
      elif provider == "claude":
        claude_login(account, session)
      else:
        print("GLM integration coming soon – no login action yet.")
    elif provider == "codex" and choice == "2":
      level = input("Enter approval level [never/on-request/always]: ").strip().lower()
      try:
        codex_set_approval(account, level, session, workspace, instructions)
      except ValueError as exc:
        print(f"⚠️  {exc}")
    elif choice in {"b", "q"}:
      return
    else:
      print("⚠️  Invalid selection.")


def provider_menu(
  provider: str,
  accounts: List[Dict[str, object]],
  session: Optional[str],
  workspace: Path,
  instructions: Path,
) -> None:
  if provider == "glm":
    print("\n🧬 GLM integration is not yet configured. Add entries to state/accounts.yaml when available.")
    return

  if not accounts:
    print(f"\n⚠️  No {provider} accounts configured in state/accounts.yaml.")
    return

  while True:
    print(f"\n[{provider}] Accounts")
    for idx, account in enumerate(accounts, start=1):
      label = account_label(account)
      print(f"  {idx}) {label}")
    print("  b) Back")
    selection = input("Select account: ").strip().lower()
    if selection in {"b", "q"}:
      return
    try:
      index = int(selection)
    except ValueError:
      print("⚠️  Invalid selection.")
      continue
    if not 1 <= index <= len(accounts):
      print("⚠️  Invalid selection.")
      continue
    account = accounts[index - 1]
    account_action_menu(provider, account, session, workspace, instructions)


def interactive_menu(session: Optional[str], workspace: Path, instructions: Path) -> None:
  if load_config is None:
    print("⚠️  account_manager module unavailable; cannot load provider accounts.")
    return

  try:
    config = load_config()
  except Exception as exc:  # pylint: disable=broad-except
    print(f"❌ Failed to load state/accounts.yaml: {exc}")
    return

  providers = list_providers(config)

  while True:
    print("\n╔══════════════════════════════════════════════════════╗")
    print("║ WeatherVane Autopilot Command Palette                ║")
    print("╠══════════════════════════════════════════════════════╣")
    for idx, provider in enumerate(providers, start=1):
      label = {
        "codex": "Codex accounts",
        "claude": "Claude accounts",
        "glm": "GLM (coming soon)",
      }.get(provider, provider)
      print(f"║  {idx}) {label:<44}║")
    print("║  d) Diagnostics dashboard                             ║")
    print("║  r) Refresh agent dashboard                          ║")
    print("║  q) Quit                                             ║")
    print("╚══════════════════════════════════════════════════════╝")
    choice = input("Select option: ").strip().lower()
    if choice == "q":
      return
    if choice == "d":
      diagnostics_menu(session)
      continue
    if choice == "r":
      try:
        subprocess.run(
          ["tmux", "refresh-client", "-t", session or ""],
          check=False,
          stdout=subprocess.DEVNULL,
          stderr=subprocess.DEVNULL,
        )
        print("🔄 Agent dashboard refresh requested.")
      except FileNotFoundError:
        print("⚠️  tmux not available; cannot refresh automatically.")
      continue
    try:
      index = int(choice)
    except ValueError:
      print("⚠️  Invalid selection.")
      continue
    if not 1 <= index <= len(providers):
      print("⚠️  Invalid selection.")
      continue
    provider = providers[index - 1]
    provider_accounts = config.get(provider, [])
    provider_menu(provider, provider_accounts, session, workspace, instructions)


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("--session", help="tmux session name (optional).")
  parser.add_argument("--root", default=str(ROOT), help="Workspace root path.")
  parser.add_argument("--workspace", default=str(ROOT), help="Active workspace path.")
  parser.add_argument(
    "--instructions",
    default=str(ROOT / "docs" / "wvo_prompt.md"),
    help="Path to the base instructions file for Codex profile.",
  )

  subparsers = parser.add_subparsers(dest="command")

  subparsers.add_parser("menu", help="Launch the interactive menu (default).")

  login_parser = subparsers.add_parser("login", help="Trigger a login for a provider/account.")
  login_parser.add_argument("--provider", required=True, choices=["codex", "claude", "glm"])
  login_parser.add_argument("--account", required=True, help="Account id defined in state/accounts.yaml.")

  approval_parser = subparsers.add_parser("approval", help="Set Codex approval policy for an account.")
  approval_parser.add_argument("--provider", required=True, choices=["codex"])
  approval_parser.add_argument("--account", required=True, help="Account id defined in state/accounts.yaml.")
  approval_parser.add_argument("--level", required=True, choices=["never", "on-request", "always"])

  bootstrap_parser = subparsers.add_parser(
    "bootstrap",
    help="Grant top permissions for all configured services (logins + max approvals).",
  )
  bootstrap_parser.add_argument(
    "--level",
    default="always",
    choices=["never", "on-request", "always"],
    help="Approval level to apply to Codex accounts (default: always).",
  )

  return parser.parse_args()


def find_account(config: Dict[str, List[Dict[str, object]]], provider: str, account_id: str) -> Dict[str, object]:
  for account in config.get(provider, []):
    if str(account.get("id")) == account_id:
      return account
  raise KeyError(f"Account '{account_id}' not found for provider '{provider}'.")


def main() -> int:
  args = parse_args()
  session = args.session
  workspace = Path(args.workspace).expanduser().resolve()
  instructions = Path(args.instructions).expanduser().resolve()

  if args.command in {None, "menu"}:
    interactive_menu(session, workspace, instructions)
    return 0

  if args.command == "bootstrap":
    level = getattr(args, "level", "always")
    return bootstrap_top_permissions(session, workspace, instructions, level)

  if load_config is None:
    print("❌ account_manager module unavailable; cannot manage accounts.")
    return 1

  try:
    config = load_config()
  except Exception as exc:  # pylint: disable=broad-except
    print(f"❌ Failed to load state/accounts.yaml: {exc}")
    return 1

  try:
    account = find_account(config, args.provider, args.account)
  except KeyError as exc:
    print(f"❌ {exc}")
    return 1

  if args.command == "login":
    if args.provider == "codex":
      codex_login(account, session)
    elif args.provider == "claude":
      claude_login(account, session)
    else:
      print("🧬 GLM integration will support login commands once providers are configured.")
    return 0

  if args.command == "approval":
    codex_set_approval(account, args.level, session, workspace, instructions)
    return 0

  print("⚠️  Unsupported command.")
  return 1


if __name__ == "__main__":
  raise SystemExit(main())
