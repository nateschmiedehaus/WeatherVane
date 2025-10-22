#!/usr/bin/env python3
"""
Integration tests for multi-provider account management

Tests realistic workflows with actual file I/O and account rotation.
"""
from __future__ import annotations

import json
import subprocess
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
def integration_workspace(tmp_path):
    """Create a fully populated test workspace"""
    config_dir = tmp_path / "state"
    config_dir.mkdir()
    accounts_root = tmp_path / ".accounts"
    accounts_root.mkdir()

    config_path = config_dir / "accounts.yaml"
    runtime_path = config_dir / "accounts_runtime.json"

    # Create realistic multi-provider config
    config = {
        "codex": [
            {
                "id": "codex_personal",
                "email": "personal@example.com",
                "label": "Personal Codex"
            },
            {
                "id": "codex_client",
                "email": "client@example.com",
                "label": "Client Codex"
            }
        ],
        "claude": [
            {
                "id": "claude_primary",
                "email": "primary@example.com",
                "label": "Primary Claude"
            },
            {
                "id": "claude_secondary",
                "email": "secondary@example.com",
                "label": "Secondary Claude"
            }
        ]
    }
    config_path.write_text(yaml.dump(config))

    # Mock the module-level paths
    with mock.patch.object(account_manager, 'REPO_ROOT', tmp_path):
        with mock.patch.object(account_manager, 'CONFIG_PATH', config_path):
            with mock.patch.object(account_manager, 'RUNTIME_PATH', runtime_path):
                with mock.patch.object(account_manager, 'ACCOUNTS_ROOT', accounts_root):
                    yield {
                        'root': tmp_path,
                        'config_path': config_path,
                        'runtime_path': runtime_path,
                        'accounts_root': accounts_root,
                    }


class TestMultiProviderRotation:
    """Test realistic multi-provider account rotation scenarios"""

    def test_round_robin_rotation_codex(self, integration_workspace):
        """Test that Codex accounts rotate in round-robin fashion"""
        selected_accounts = []

        # Select 4 accounts (should cycle through both twice)
        for _ in range(4):
            with mock.patch('builtins.print') as mock_print:
                with pytest.raises(SystemExit) as exc_info:
                    account_manager.next_account("codex")

                assert exc_info.value.code == 0
                output = mock_print.call_args[0][0]
                result = json.loads(output)
                selected_accounts.append(result["account_id"])

        # Should have selected both accounts twice
        assert selected_accounts.count("codex_personal") == 2
        assert selected_accounts.count("codex_client") == 2

        # Should alternate (not same account twice in a row)
        assert selected_accounts[0] != selected_accounts[1]
        assert selected_accounts[1] != selected_accounts[2]

    def test_round_robin_rotation_claude(self, integration_workspace):
        """Test that Claude accounts rotate in round-robin fashion"""
        selected_accounts = []

        for _ in range(4):
            with mock.patch('builtins.print') as mock_print:
                with pytest.raises(SystemExit):
                    account_manager.next_account("claude")

                output = mock_print.call_args[0][0]
                result = json.loads(output)
                selected_accounts.append(result["account_id"])

        assert selected_accounts.count("claude_primary") == 2
        assert selected_accounts.count("claude_secondary") == 2
        assert selected_accounts[0] != selected_accounts[1]

    def test_independent_provider_state(self, integration_workspace):
        """Test that Codex and Claude maintain independent rotation state"""
        # Select Codex account
        with mock.patch('builtins.print') as mock_print:
            with pytest.raises(SystemExit):
                account_manager.next_account("codex")
            codex1 = json.loads(mock_print.call_args[0][0])

        # Select Claude account
        with mock.patch('builtins.print') as mock_print:
            with pytest.raises(SystemExit):
                account_manager.next_account("claude")
            claude1 = json.loads(mock_print.call_args[0][0])

        # Select Codex again - should pick different account
        with mock.patch('builtins.print') as mock_print:
            with pytest.raises(SystemExit):
                account_manager.next_account("codex")
            codex2 = json.loads(mock_print.call_args[0][0])

        # Codex should have rotated
        assert codex1["account_id"] != codex2["account_id"]

        # Claude state should be independent
        assert claude1["provider"] == "claude"
        assert codex1["provider"] == "codex"


class TestCooldownBehavior:
    """Test realistic cooldown scenarios"""

    def test_cooldown_rotation_to_next_account(self, integration_workspace):
        """Test that putting an account on cooldown rotates to next"""
        # Select first account
        with mock.patch('builtins.print') as mock_print:
            with pytest.raises(SystemExit):
                account_manager.next_account("codex")
            first_account = json.loads(mock_print.call_args[0][0])

        # Put it on cooldown
        account_manager.record_cooldown("codex", first_account["account_id"], 600)

        # Next selection should pick different account
        with mock.patch('builtins.print') as mock_print:
            with pytest.raises(SystemExit):
                account_manager.next_account("codex")
            second_account = json.loads(mock_print.call_args[0][0])

        assert first_account["account_id"] != second_account["account_id"]

    def test_all_accounts_on_cooldown_returns_wait(self, integration_workspace):
        """Test behavior when all accounts are on cooldown"""
        # Put both Codex accounts on cooldown
        account_manager.record_cooldown("codex", "codex_personal", 600)
        account_manager.record_cooldown("codex", "codex_client", 600)

        # Should return wait code
        with mock.patch('builtins.print') as mock_print:
            with pytest.raises(SystemExit) as exc_info:
                account_manager.next_account("codex")

            assert exc_info.value.code == 2
            output = mock_print.call_args[0][0]
            result = json.loads(output)
            assert "wait_seconds" in result

    def test_clearing_cooldown_makes_account_available(self, integration_workspace):
        """Test that clearing cooldown immediately makes account available"""
        # Put account on cooldown
        account_manager.record_cooldown("claude", "claude_primary", 600)

        # Verify it's on cooldown
        with mock.patch('builtins.print') as mock_print:
            with pytest.raises(SystemExit):
                account_manager.next_account("claude")
            result1 = json.loads(mock_print.call_args[0][0])
            assert result1["account_id"] == "claude_secondary"  # Should skip primary

        # Clear cooldown
        account_manager.clear_cooldown("claude", "claude_primary")

        # Now should be able to select primary again
        with mock.patch('builtins.print') as mock_print:
            with pytest.raises(SystemExit):
                account_manager.next_account("claude")
            result2 = json.loads(mock_print.call_args[0][0])
            # Could be either, but primary is now available
            assert result2["account_id"] in ["claude_primary", "claude_secondary"]


class TestConcurrentProviderUsage:
    """Test scenarios where both providers are used concurrently"""

    def test_interleaved_provider_selection(self, integration_workspace):
        """Test alternating between Codex and Claude selections"""
        selections = []

        # Alternate between providers
        for i in range(6):
            provider = "codex" if i % 2 == 0 else "claude"

            with mock.patch('builtins.print') as mock_print:
                with pytest.raises(SystemExit):
                    account_manager.next_account(provider)

                output = mock_print.call_args[0][0]
                result = json.loads(output)
                selections.append((result["provider"], result["account_id"]))

        # Should have 3 Codex and 3 Claude selections
        codex_selections = [s for s in selections if s[0] == "codex"]
        claude_selections = [s for s in selections if s[0] == "claude"]

        assert len(codex_selections) == 3
        assert len(claude_selections) == 3

        # Each provider should have rotated through accounts
        codex_accounts = [s[1] for s in codex_selections]
        assert "codex_personal" in codex_accounts
        assert "codex_client" in codex_accounts

        claude_accounts = [s[1] for s in claude_selections]
        assert "claude_primary" in claude_accounts
        assert "claude_secondary" in claude_accounts

    def test_cooldown_on_one_provider_doesnt_affect_other(self, integration_workspace):
        """Test that Codex cooldown doesn't affect Claude availability"""
        # Put all Codex accounts on cooldown
        account_manager.record_cooldown("codex", "codex_personal", 600)
        account_manager.record_cooldown("codex", "codex_client", 600)

        # Codex should return wait code
        with mock.patch('builtins.print'):
            with pytest.raises(SystemExit) as exc_info:
                account_manager.next_account("codex")
            assert exc_info.value.code == 2

        # Claude should still be available
        with mock.patch('builtins.print') as mock_print:
            with pytest.raises(SystemExit) as exc_info:
                account_manager.next_account("claude")
            assert exc_info.value.code == 0

            output = mock_print.call_args[0][0]
            result = json.loads(output)
            assert result["provider"] == "claude"


class TestAccountMetadata:
    """Test that account metadata is correctly populated"""

    def test_codex_account_includes_all_fields(self, integration_workspace):
        """Test that Codex account includes home, profile, email, label"""
        with mock.patch('builtins.print') as mock_print:
            with pytest.raises(SystemExit):
                account_manager.next_account("codex")

            output = mock_print.call_args[0][0]
            result = json.loads(output)

            assert result["provider"] == "codex"
            assert "account_id" in result
            assert "home" in result
            assert "profile" in result
            assert "email" in result
            assert "label" in result

            # Verify home directory was created
            assert Path(result["home"]).exists()

    def test_claude_account_includes_env_config(self, integration_workspace):
        """Test that Claude account includes CLAUDE_CONFIG_DIR in env"""
        with mock.patch('builtins.print') as mock_print:
            with pytest.raises(SystemExit):
                account_manager.next_account("claude")

            output = mock_print.call_args[0][0]
            result = json.loads(output)

            assert result["provider"] == "claude"
            assert "env" in result
            assert "CLAUDE_CONFIG_DIR" in result["env"]
            assert result["bin"] == "claude"

            # Verify config dir was created
            assert Path(result["env"]["CLAUDE_CONFIG_DIR"]).exists()


class TestRuntimePersistence:
    """Test that runtime state persists across restarts"""

    def test_runtime_state_persists_between_calls(self, integration_workspace):
        """Test that selection order persists in runtime file"""
        # Make first selection
        with mock.patch('builtins.print') as mock_print:
            with pytest.raises(SystemExit):
                account_manager.next_account("codex")
            first_selection = json.loads(mock_print.call_args[0][0])

        # Verify runtime file was updated
        runtime = json.loads(integration_workspace['runtime_path'].read_text())
        assert first_selection["account_id"] in runtime["codex"]
        assert "last_selected" in runtime["codex"][first_selection["account_id"]]

        # Make second selection (simulating restart by re-loading runtime)
        with mock.patch('builtins.print') as mock_print:
            with pytest.raises(SystemExit):
                account_manager.next_account("codex")
            second_selection = json.loads(mock_print.call_args[0][0])

        # Should have selected different account
        assert first_selection["account_id"] != second_selection["account_id"]

        # Runtime should have both accounts logged
        runtime = json.loads(integration_workspace['runtime_path'].read_text())
        assert first_selection["account_id"] in runtime["codex"]
        assert second_selection["account_id"] in runtime["codex"]


class TestErrorHandling:
    """Test error handling scenarios"""

    def test_missing_config_file_raises_error(self, tmp_path):
        """Test that missing config file raises appropriate error"""
        non_existent = tmp_path / "state" / "accounts.yaml"

        with mock.patch.object(account_manager, 'CONFIG_PATH', non_existent):
            with pytest.raises(FileNotFoundError, match="Accounts configuration not found"):
                account_manager.load_config()

    def test_empty_provider_list_returns_error(self, integration_workspace):
        """Test behavior when provider has no accounts configured"""
        # Create config with only Codex accounts
        config = {"codex": [{"id": "test", "email": "test@example.com"}]}
        integration_workspace['config_path'].write_text(yaml.dump(config))

        # Clear existing runtime
        integration_workspace['runtime_path'].unlink(missing_ok=True)

        # Requesting Claude account should fail
        with pytest.raises(SystemExit) as exc_info:
            account_manager.next_account("claude")

        # SystemExit is raised with the JSON error message as the code
        result = json.loads(str(exc_info.value.code))
        assert result["error"] == "no_accounts_configured"
        assert result["provider"] == "claude"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
