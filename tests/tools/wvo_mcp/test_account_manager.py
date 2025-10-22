#!/usr/bin/env python3
"""
Unit tests for account_manager.py

Tests multi-provider account management, cooldown logic, and account selection.
"""
from __future__ import annotations

import json
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

import pytest
import yaml

# Import the account manager module
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "tools" / "wvo_mcp" / "scripts"))
import account_manager


@pytest.fixture
def temp_workspace(tmp_path):
    """Create a temporary workspace with accounts config"""
    config_dir = tmp_path / "state"
    config_dir.mkdir()
    accounts_root = tmp_path / ".accounts"
    accounts_root.mkdir()

    # Mock the module-level paths
    with mock.patch.object(account_manager, 'REPO_ROOT', tmp_path):
        with mock.patch.object(account_manager, 'CONFIG_PATH', config_dir / "accounts.yaml"):
            with mock.patch.object(account_manager, 'RUNTIME_PATH', config_dir / "accounts_runtime.json"):
                with mock.patch.object(account_manager, 'ACCOUNTS_ROOT', accounts_root):
                    yield {
                        'root': tmp_path,
                        'config_path': config_dir / "accounts.yaml",
                        'runtime_path': config_dir / "accounts_runtime.json",
                        'accounts_root': accounts_root,
                    }


class TestSlugify:
    """Test the slugify helper function"""

    def test_slugify_basic(self):
        assert account_manager.slugify("test-account") == "test-account"

    def test_slugify_with_spaces(self):
        assert account_manager.slugify("test account") == "test_account"

    def test_slugify_with_special_chars(self):
        assert account_manager.slugify("test@account.com") == "test_account_com"

    def test_slugify_empty_string(self):
        assert account_manager.slugify("") == "account"

    def test_slugify_preserves_underscores_and_hyphens(self):
        assert account_manager.slugify("my-test_account-123") == "my-test_account-123"


class TestRuntimeManagement:
    """Test runtime state persistence"""

    def test_ensure_runtime_creates_new_file(self, temp_workspace):
        runtime = account_manager.ensure_runtime()

        assert "codex" in runtime
        assert "claude" in runtime
        assert runtime["codex"] == {}
        assert runtime["claude"] == {}

        # Verify file was created
        assert temp_workspace['runtime_path'].exists()

    def test_ensure_runtime_loads_existing(self, temp_workspace):
        # Pre-populate runtime file
        existing_data = {
            "codex": {"account1": {"last_selected": "2025-10-20T12:00:00+00:00"}},
            "claude": {"account2": {"cooldown_until": "2025-10-20T13:00:00+00:00"}}
        }
        temp_workspace['runtime_path'].write_text(json.dumps(existing_data))

        runtime = account_manager.ensure_runtime()

        assert runtime["codex"]["account1"]["last_selected"] == "2025-10-20T12:00:00+00:00"
        assert runtime["claude"]["account2"]["cooldown_until"] == "2025-10-20T13:00:00+00:00"

    def test_ensure_runtime_handles_corrupt_json(self, temp_workspace):
        # Write invalid JSON
        temp_workspace['runtime_path'].write_text("{ invalid json }")

        runtime = account_manager.ensure_runtime()

        # Should reset to empty state
        assert runtime == {"codex": {}, "claude": {}}

    def test_write_runtime_persists_data(self, temp_workspace):
        data = {
            "codex": {"test_account": {"last_selected": "2025-10-20T12:00:00+00:00"}},
            "claude": {}
        }

        account_manager.write_runtime(data)

        # Verify file contents
        persisted = json.loads(temp_workspace['runtime_path'].read_text())
        assert persisted["codex"]["test_account"]["last_selected"] == "2025-10-20T12:00:00+00:00"


class TestConfigNormalization:
    """Test config loading and normalization"""

    def test_normalize_config_sets_defaults(self, temp_workspace):
        raw_config = {
            "codex": [],
            "claude": []
        }

        normalized = account_manager.normalize_config(raw_config)

        assert "codex" in normalized
        assert "claude" in normalized

    def test_normalize_config_codex_account_with_defaults(self, temp_workspace):
        raw_config = {
            "codex": [
                {"id": "test_account", "email": "test@example.com"}
            ],
            "claude": []
        }

        normalized = account_manager.normalize_config(raw_config)

        account = normalized["codex"][0]
        assert account["id"] == "test_account"
        assert account["email"] == "test@example.com"
        assert "home" in account
        assert account["profile"] == "weathervane_orchestrator"

        # Verify home directory was created
        home_path = Path(account["home"])
        assert home_path.exists()
        assert home_path.is_dir()

    def test_normalize_config_claude_account_with_defaults(self, temp_workspace):
        raw_config = {
            "codex": [],
            "claude": [
                {"id": "claude_primary", "email": "test@example.com"}
            ]
        }

        normalized = account_manager.normalize_config(raw_config)

        account = normalized["claude"][0]
        assert account["id"] == "claude_primary"
        assert account["bin"] == "claude"
        assert "env" in account
        assert "CLAUDE_CONFIG_DIR" in account["env"]

        # Verify config dir was created
        config_dir = Path(account["env"]["CLAUDE_CONFIG_DIR"])
        assert config_dir.exists()
        assert config_dir.is_dir()

    def test_normalize_config_rejects_duplicate_codex_ids(self, temp_workspace):
        raw_config = {
            "codex": [
                {"id": "duplicate", "email": "test1@example.com"},
                {"id": "duplicate", "email": "test2@example.com"}
            ],
            "claude": []
        }

        with pytest.raises(ValueError, match="Duplicate Codex account id"):
            account_manager.normalize_config(raw_config)

    def test_normalize_config_rejects_duplicate_codex_emails(self, temp_workspace):
        raw_config = {
            "codex": [
                {"id": "account1", "email": "test@example.com"},
                {"id": "account2", "email": "test@example.com"}
            ],
            "claude": []
        }

        with pytest.raises(ValueError, match="share the same email"):
            account_manager.normalize_config(raw_config)

    def test_normalize_config_rejects_duplicate_codex_homes(self, temp_workspace):
        home_dir = temp_workspace['accounts_root'] / "codex" / "shared"
        home_dir.mkdir(parents=True)

        raw_config = {
            "codex": [
                {"id": "account1", "email": "test1@example.com", "home": str(home_dir)},
                {"id": "account2", "email": "test2@example.com", "home": str(home_dir)}
            ],
            "claude": []
        }

        with pytest.raises(ValueError, match="point to the same CODEX_HOME"):
            account_manager.normalize_config(raw_config)

    def test_normalize_config_rejects_missing_id(self, temp_workspace):
        raw_config = {
            "codex": [
                {"email": "test@example.com"}  # Missing id
            ],
            "claude": []
        }

        with pytest.raises(ValueError, match="missing 'id'"):
            account_manager.normalize_config(raw_config)

    def test_normalize_config_rejects_missing_email(self, temp_workspace):
        raw_config = {
            "codex": [
                {"id": "test_account"}  # Missing email
            ],
            "claude": []
        }

        with pytest.raises(ValueError, match="missing required email"):
            account_manager.normalize_config(raw_config)


class TestAccountSelection:
    """Test next account selection logic"""

    def test_next_account_selects_first_available(self, temp_workspace):
        config = {
            "codex": [
                {"id": "account1", "email": "test1@example.com"},
                {"id": "account2", "email": "test2@example.com"}
            ],
            "claude": []
        }
        temp_workspace['config_path'].write_text(yaml.dump(config))

        with pytest.raises(SystemExit) as exc_info:
            account_manager.next_account("codex")

        assert exc_info.value.code == 0
        # Should select account1 (never used before)

    def test_next_account_rotates_based_on_last_selected(self, temp_workspace):
        config = {
            "codex": [
                {"id": "account1", "email": "test1@example.com"},
                {"id": "account2", "email": "test2@example.com"}
            ],
            "claude": []
        }
        temp_workspace['config_path'].write_text(yaml.dump(config))

        # Mark account1 as recently used
        runtime = {
            "codex": {
                "account1": {"last_selected": "2025-10-20T12:00:00+00:00"}
            },
            "claude": {}
        }
        temp_workspace['runtime_path'].write_text(json.dumps(runtime))

        # Capture stdout
        with mock.patch('builtins.print') as mock_print:
            with pytest.raises(SystemExit) as exc_info:
                account_manager.next_account("codex")

            # Should select account2 (never used)
            output = mock_print.call_args[0][0]
            result = json.loads(output)
            assert result["account_id"] == "account2"

    def test_next_account_skips_cooldown_accounts(self, temp_workspace):
        config = {
            "codex": [
                {"id": "account1", "email": "test1@example.com"},
                {"id": "account2", "email": "test2@example.com"}
            ],
            "claude": []
        }
        temp_workspace['config_path'].write_text(yaml.dump(config))

        # Put account1 on cooldown
        future_time = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        runtime = {
            "codex": {
                "account1": {"cooldown_until": future_time}
            },
            "claude": {}
        }
        temp_workspace['runtime_path'].write_text(json.dumps(runtime))

        with mock.patch('builtins.print') as mock_print:
            with pytest.raises(SystemExit) as exc_info:
                account_manager.next_account("codex")

            # Should select account2 (not on cooldown)
            output = mock_print.call_args[0][0]
            result = json.loads(output)
            assert result["account_id"] == "account2"

    def test_next_account_returns_wait_when_all_on_cooldown(self, temp_workspace):
        config = {
            "codex": [
                {"id": "account1", "email": "test1@example.com"}
            ],
            "claude": []
        }
        temp_workspace['config_path'].write_text(yaml.dump(config))

        # Put account on cooldown
        future_time = (datetime.now(timezone.utc) + timedelta(seconds=300)).isoformat()
        runtime = {
            "codex": {
                "account1": {"cooldown_until": future_time}
            },
            "claude": {}
        }
        temp_workspace['runtime_path'].write_text(json.dumps(runtime))

        with mock.patch('builtins.print') as mock_print:
            with pytest.raises(SystemExit) as exc_info:
                account_manager.next_account("codex")

            assert exc_info.value.code == 2  # Wait exit code

            output = mock_print.call_args[0][0]
            result = json.loads(output)
            assert "wait_seconds" in result
            assert result["wait_seconds"] > 0

    def test_next_account_claude_returns_correct_env(self, temp_workspace):
        config = {
            "codex": [],
            "claude": [
                {"id": "claude_primary", "email": "test@example.com"}
            ]
        }
        temp_workspace['config_path'].write_text(yaml.dump(config))

        with mock.patch('builtins.print') as mock_print:
            with pytest.raises(SystemExit) as exc_info:
                account_manager.next_account("claude")

            assert exc_info.value.code == 0

            output = mock_print.call_args[0][0]
            result = json.loads(output)
            assert result["provider"] == "claude"
            assert result["account_id"] == "claude_primary"
            assert "env" in result
            assert "CLAUDE_CONFIG_DIR" in result["env"]


class TestCooldownManagement:
    """Test cooldown recording and clearing"""

    def test_record_cooldown_sets_future_timestamp(self, temp_workspace):
        account_manager.ensure_runtime()

        before = datetime.now(timezone.utc)
        account_manager.record_cooldown("codex", "test_account", 600, reason="rate_limit")
        after = datetime.now(timezone.utc)

        runtime = json.loads(temp_workspace['runtime_path'].read_text())
        entry = runtime["codex"]["test_account"]

        assert "cooldown_until" in entry
        cooldown_time = datetime.fromisoformat(entry["cooldown_until"].replace('Z', '+00:00'))

        # Should be ~600 seconds in the future
        expected_min = before + timedelta(seconds=595)
        expected_max = after + timedelta(seconds=605)
        assert expected_min <= cooldown_time <= expected_max

        assert entry["last_cooldown_reason"] == "rate_limit"

    def test_clear_cooldown_removes_timestamp(self, temp_workspace):
        # Set a cooldown
        account_manager.ensure_runtime()
        account_manager.record_cooldown("codex", "test_account", 600)

        # Clear it
        account_manager.clear_cooldown("codex", "test_account")

        runtime = json.loads(temp_workspace['runtime_path'].read_text())
        entry = runtime["codex"]["test_account"]

        assert "cooldown_until" not in entry

    def test_record_cooldown_handles_zero_seconds(self, temp_workspace):
        account_manager.ensure_runtime()
        account_manager.record_cooldown("claude", "test_account", 0)

        runtime = json.loads(temp_workspace['runtime_path'].read_text())
        entry = runtime["claude"]["test_account"]

        # Should set cooldown_until to now (effectively no cooldown)
        assert "cooldown_until" in entry


class TestIntegrationScenarios:
    """Integration tests for realistic multi-provider scenarios"""

    def test_multi_provider_account_rotation(self, temp_workspace):
        """Test rotating between Codex and Claude accounts"""
        config = {
            "codex": [
                {"id": "codex1", "email": "codex1@example.com"},
                {"id": "codex2", "email": "codex2@example.com"}
            ],
            "claude": [
                {"id": "claude1", "email": "claude1@example.com"},
                {"id": "claude2", "email": "claude2@example.com"}
            ]
        }
        temp_workspace['config_path'].write_text(yaml.dump(config))

        # Get first Codex account
        with mock.patch('builtins.print') as mock_print:
            with pytest.raises(SystemExit):
                account_manager.next_account("codex")
            result1 = json.loads(mock_print.call_args[0][0])
            assert result1["account_id"] == "codex1"

        # Get first Claude account
        with mock.patch('builtins.print') as mock_print:
            with pytest.raises(SystemExit):
                account_manager.next_account("claude")
            result2 = json.loads(mock_print.call_args[0][0])
            assert result2["account_id"] == "claude1"

        # Get second Codex account (rotation)
        with mock.patch('builtins.print') as mock_print:
            with pytest.raises(SystemExit):
                account_manager.next_account("codex")
            result3 = json.loads(mock_print.call_args[0][0])
            assert result3["account_id"] == "codex2"

    def test_cooldown_fallback_across_providers(self, temp_workspace):
        """Test that cooldowns work independently per provider"""
        config = {
            "codex": [{"id": "codex1", "email": "codex@example.com"}],
            "claude": [{"id": "claude1", "email": "claude@example.com"}]
        }
        temp_workspace['config_path'].write_text(yaml.dump(config))

        # Put Codex on cooldown
        account_manager.ensure_runtime()
        future_time = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        runtime = {
            "codex": {"codex1": {"cooldown_until": future_time}},
            "claude": {}
        }
        temp_workspace['runtime_path'].write_text(json.dumps(runtime))

        # Codex should be on cooldown (exit code 2)
        with mock.patch('builtins.print'):
            with pytest.raises(SystemExit) as exc_info:
                account_manager.next_account("codex")
            assert exc_info.value.code == 2

        # Claude should still be available (exit code 0)
        with mock.patch('builtins.print'):
            with pytest.raises(SystemExit) as exc_info:
                account_manager.next_account("claude")
            assert exc_info.value.code == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
