# Context7 Access Notes

> ⚠️ Do not commit real keys or copy this document outside the secure repo.

| Item          | Value / Location                                   |
| ------------- | --------------------------------------------------- |
| MCP URL       | `https://mcp.context7.com/mcp`                      |
| REST API URL  | `https://context7.com/api/v1`                       |
| API key alias | `CONTEXT7_API_KEY` (store in 1Password & GitHub)    |

## Storage

- **Primary vault**: 1Password → WeatherVane → “Context7 API Key”.
- **GitHub Actions**: add the same value as repo secret `CONTEXT7_API_KEY`.
- **Local dev**: export `CONTEXT7_API_KEY` before running `scripts/refresh_api_docs.sh` or MCP clients.

## Usage checklist

1. Codex MCP (`~/.codex/config.toml`):
   ```toml
   [mcp_servers.context7]
   command = "npx"
   args = ["-y", "@upstash/context7-mcp", "--api-key", "${CONTEXT7_API_KEY}"]
   ```
2. Claude Code:
   ```bash
   claude mcp add --transport http context7 \
     https://mcp.context7.com/mcp \
     --header "CONTEXT7_API_KEY: $CONTEXT7_API_KEY"
   ```

Update this doc if URLs or secret names change. Never paste the raw key into git.

## Operational reminders

- Treat client API keys and OAuth secrets the same way: store them in tenant-specific vaults (1Password), inject via sealed env vars, never check them into git.
- Rotate the Context7 key on the same cadence as production keys; update 1Password and GitHub secrets together.
