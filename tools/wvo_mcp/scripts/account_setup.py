#!/usr/bin/env python3
"""Interactive provider/account setup for WeatherVane autopilot."""

from __future__ import annotations

import os
import subprocess
import sys
from getpass import getpass
from pathlib import Path
from typing import Dict, List

import yaml

ROOT = Path(__file__).resolve().parents[3]
ACCOUNTS_YAML = ROOT / "state" / "accounts.yaml"
ENV_FILE = ROOT / "state" / "accounts.env"

PROVIDER_MENU = [
    {"id": "codex", "label": "OpenAI Codex (Tier A)", "type": "cli"},
    {"id": "claude", "label": "Claude Code API (Tier A+)", "type": "api"},
    {"id": "claude_opus", "label": "Claude Opus API (Tier A+ preview)", "type": "api"},
    {"id": "claude_sonnet", "label": "Claude Sonnet API (Tier A+ preview)", "type": "api"},
    {"id": "claude_haiku", "label": "Claude Haiku API (Tier B preview)", "type": "api"},
    {"id": "glm_latest", "label": "GLM Plus API (Tier B preview)", "type": "api"},
    {"id": "gemini_pro", "label": "Gemini 1.5 Pro API (Tier C preview)", "type": "api"},
    {"id": "gemini_flash", "label": "Gemini 1.5 Flash API (Tier C-/D preview)", "type": "api"},
]

ENV_KEYS = {
    "claude": "ANTHROPIC_API_KEY",
    "claude_opus": "ANTHROPIC_API_KEY",
    "claude_sonnet": "ANTHROPIC_API_KEY",
    "claude_haiku": "ANTHROPIC_API_KEY",
    "glm_latest": "GLM_API_KEY",
    "gemini_pro": "GEMINI_API_KEY",
    "gemini_flash": "GEMINI_API_KEY",
}

ENABLE_FLAGS = {
    "claude_opus": "WVO_ENABLE_PROVIDER_CLAUDE_OPUS",
    "claude_sonnet": "WVO_ENABLE_PROVIDER_CLAUDE_SONNET",
    "claude_haiku": "WVO_ENABLE_PROVIDER_CLAUDE_HAIKU",
    "glm_latest": "WVO_ENABLE_PROVIDER_GLM",
    "gemini_pro": "WVO_ENABLE_PROVIDER_GEMINI_PRO",
    "gemini_flash": "WVO_ENABLE_PROVIDER_GEMINI_FLASH",
}

CONFIGURED_PROVIDERS: set[str] = set()


def ensure_accounts_yaml(data: Dict[str, List[Dict[str, str]]]) -> None:
    ACCOUNTS_YAML.parent.mkdir(parents=True, exist_ok=True)
    with ACCOUNTS_YAML.open("w", encoding="utf-8") as handle:
        yaml.safe_dump(data, handle, sort_keys=False)


def load_accounts_yaml() -> Dict[str, List[Dict[str, str]]]:
    if not ACCOUNTS_YAML.exists():
        template = {
            "codex": [],
            "claude": [],
        }
        ensure_accounts_yaml(template)
        return template
    data = yaml.safe_load(ACCOUNTS_YAML.read_text(encoding="utf-8")) or {}
    data.setdefault("codex", [])
    data.setdefault("claude", [])
    return data


def write_env_var(key: str, value: str) -> None:
    ENV_FILE.parent.mkdir(parents=True, exist_ok=True)
    lines = []
    if ENV_FILE.exists():
        lines = [ln.rstrip("\n") for ln in ENV_FILE.read_text(encoding="utf-8").splitlines()]
    kv = { }
    for line in lines:
        if not line or line.strip().startswith("#"):
            continue
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        kv[k.strip()] = v
    kv[key] = value
    new_lines = [f"{k}={v}" for k, v in kv.items()]
    ENV_FILE.write_text("\n".join(new_lines) + "\n", encoding="utf-8")


def mark_enable_flag(flag: str) -> None:
    if not flag:
        return
    write_env_var(flag, "1")


def run_codex_login(home: Path) -> None:
    env = os.environ.copy()
    env["CODEX_HOME"] = str(home)
    try:
        subprocess.run(["codex", "login"], check=True, env=env)
    except FileNotFoundError:
        print("codex CLI not found on PATH; install it before running login.")
    except subprocess.CalledProcessError as exc:
        print(f"codex login exited with status {exc.returncode}; rerun later if needed.")


def configure_codex(accounts: Dict[str, List[Dict[str, str]]]) -> None:
    print("\nConfiguring Codex (Tier A)...")
    account_id = input("Account id [codex_primary]: ").strip() or "codex_primary"
    email = input("Account email (login email): ").strip()
    label = input("Label [personal]: ").strip() or "personal"

    home = ROOT / ".accounts" / "codex" / account_id
    entry = {
        "id": account_id,
        "email": email,
        "label": label,
        "profile": "weathervane_orchestrator",
        "home": str(home),
    }

    codex_accounts = [item for item in accounts.get("codex", []) if item.get("id") != account_id]
    codex_accounts.append(entry)
    accounts["codex"] = codex_accounts
    ensure_accounts_yaml(accounts)

    home.mkdir(parents=True, exist_ok=True)
    run_login = input("Run `codex login` now? [Y/n]: ").strip().lower()
    if run_login in {"", "y", "yes"}:
        run_codex_login(home)
    else:
        print("Skip codex login; run manually later with CODEX_HOME path shown above.")
    CONFIGURED_PROVIDERS.add("codex")


def configure_claude_variant(provider_id: str) -> None:
    key_name = ENV_KEYS[provider_id]
    print(f"\nConfiguring {provider_id} ({key_name})...")
    api_key = getpass(f"Enter {key_name}: ")
    if not api_key:
        print("No key entered; skipping.")
        return
    write_env_var(key_name, api_key)
    flag = ENABLE_FLAGS.get(provider_id)
    if flag:
        mark_enable_flag(flag)
    print(f"Stored {key_name} in {ENV_FILE}. Enable flag set: {flag or 'n/a'}")
    CONFIGURED_PROVIDERS.add(provider_id)


def configure_claude_cli(accounts: Dict[str, List[Dict[str, str]]]) -> None:
    print("\nConfiguring Claude CLI account (optional)...")
    account_id = input("Claude account id [claude_primary]: ").strip() or "claude_primary"
    label = input("Label [primary]: ").strip() or "primary"
    bin_path = input("Claude CLI binary path [claude]: ").strip() or "claude"
    config_dir = ROOT / ".accounts" / "claude" / account_id

    entry = {
        "id": account_id,
        "label": label,
        "bin": bin_path,
        "env": {"CLAUDE_CONFIG_DIR": str(config_dir)},
    }

    claude_accounts = [item for item in accounts.get("claude", []) if item.get("id") != account_id]
    claude_accounts.append(entry)
    accounts["claude"] = claude_accounts
    ensure_accounts_yaml(accounts)

    config_dir.mkdir(parents=True, exist_ok=True)
    run_login = input("Run `claude login` now? [y/N]: ").strip().lower()
    if run_login in {"y", "yes"}:
        env = os.environ.copy()
        env["CLAUDE_CONFIG_DIR"] = str(config_dir)
        try:
            subprocess.run([bin_path, "login"], check=True, env=env)
        except FileNotFoundError:
            print(f"Claude CLI '{bin_path}' not found. Install it or adjust the path.")
        except subprocess.CalledProcessError as exc:
            print(f"Claude login exited with status {exc.returncode}; rerun manually if needed.")


def configure_provider(provider_id: str, accounts: Dict[str, List[Dict[str, str]]]) -> None:
    if provider_id == "codex":
        configure_codex(accounts)
        return

    if provider_id == "claude":
        configure_claude_cli(accounts)
        configure_claude_variant("claude")
        CONFIGURED_PROVIDERS.add("claude")
        return

    if provider_id in ENV_KEYS:
        if provider_id.startswith("claude_"):
            configure_claude_variant(provider_id)
        else:
            configure_claude_variant(provider_id)
        return

    print(f"Provider '{provider_id}' not recognised in setup flow.")


def print_menu() -> None:
    print("\n=== Provider Account Registration ===")
    for idx, item in enumerate(PROVIDER_MENU, start=1):
        print(f"  {idx}. {item['label']}")
    print("  q. Quit")


def main() -> int:
    print("WeatherVane Account Registration Mode\n")
    print("This flow updates state/accounts.yaml and state/accounts.env.")
    print("Sensitive keys are written to state/accounts.env — keep it secure.")

    accounts = load_accounts_yaml()

    while True:
        print_menu()
        choice = input("Select a provider to configure: ").strip().lower()
        if choice in {"q", "quit", "exit"}:
            break
        if not choice:
            continue
        if choice.isdigit():
            idx = int(choice) - 1
            if 0 <= idx < len(PROVIDER_MENU):
                provider = PROVIDER_MENU[idx]
                configure_provider(provider["id"], accounts)
                continue
        print("Invalid selection; choose a number or 'q' to quit.")

    print("\nAccount setup complete. Next steps:")
    print(f"  - Review {ACCOUNTS_YAML} for CLI accounts.")
   print(f"  - Source {ENV_FILE} to load API keys (e.g. `source {ENV_FILE}`).")
    print("  - Re-launch make mcp-autopilot when ready.")

    smoke_candidates = [pid for pid in sorted(CONFIGURED_PROVIDERS) if pid in ENV_KEYS]
    if smoke_candidates:
        run_smoke = input("Run provider smoke tests now? [y/N]: ").strip().lower()
        if run_smoke in {"y", "yes"}:
            for provider_id in smoke_candidates:
                print(f"\nRunning smoke test for {provider_id}...")
                cmd = [
                    "npm",
                    "run",
                    "providers:smoke",
                    "--",
                    "--provider",
                    provider_id,
                    "--include-staging",
                ]
                try:
                    subprocess.run(cmd, check=True, cwd=ROOT / "tools" / "wvo_mcp")
                except subprocess.CalledProcessError as exc:
                    print(f"Smoke test for {provider_id} failed (exit {exc.returncode}). Review output above.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
