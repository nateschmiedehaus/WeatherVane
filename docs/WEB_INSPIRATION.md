# Web Inspiration Pipeline

The web inspiration feature lets the orchestrator and MCP agents capture reference material from award-winning websites automatically.

## Enable

Set the environment variable before running the autopilot:

```bash
export WVO_ENABLE_WEB_INSPIRATION=1
```

When enabled, `tools/wvo_mcp/scripts/autopilot.sh` ensures that Playwright is installed and the Chromium runtime is available. A failure to install is logged with clear instructions.

## Workflow

1. **Trigger** – Design/UX tasks (keywords: `design`, `ui`, `ux`, `layout`, etc.) automatically request inspiration via `WebInspirationManager`.
2. **Fetch** – The MCP tool `web_inspiration_capture` captures:
   - A screenshot (`state/web_inspiration/<task-id>/screenshot.png`)
   - A sanitized HTML snapshot (`state/web_inspiration/<task-id>/snapshot.html`)
   - Metadata (`metadata.json`)
3. **Reuse** – Subsequent requests for the same task return cached artifacts instantly.
4. **Context** – A context entry is recorded so agents can reference the assets in prompts and critics can enforce their usage.
5. **Telemetry** – Metrics are reported through `OperationsManager` (`webInspiration` block) and written to `state/telemetry/operations.jsonl`.

## MCP Tool

`web_inspiration_capture` is available to all MCP clients. Parameters:

| Field     | Type   | Notes                                                        |
|-----------|--------|--------------------------------------------------------------|
| `url`     | string | Must match the allow-list domains                            |
| `taskId`  | string | Optional; enables caching per task                           |
| `viewport`| object | Optional `{ width, height }`, default `1920 x 1080`          |
| `timeoutMs` | number | Optional navigation timeout, default `10000` ms            |

Returns a success payload with screenshot path, HTML path, and metadata. Errors include actionable guidance (e.g., install steps when Playwright is missing).

### Inspect Cached Assets

`web_inspiration_status` lists existing inspiration artifacts. Optional parameters:

| Field | Type | Notes |
|-------|------|-------|
| `taskId` | string | Filter to a specific task ID |
| `limit` | number | Maximum results to return (default 20, max 100) |

The response includes relative paths, timestamps, and size data so agents can quickly reference or audit captured inspiration.

## Allow List

Default domains:

- `awwwards.com`
- `dribbble.com`
- `behance.net`
- `cssnectar.com`
- `siteinspire.com`

Override via `WVO_WEB_INSPIRATION_DOMAINS=domain1,domain2`.

### Source Configuration

Agents can tailor inspiration sources by editing `tools/wvo_mcp/config/web_inspiration_sources.yaml`. Each category defines:

- `id`: category key stored in metadata/telemetry
- `keywords`: terms that should trigger this category
- `sources`: curated URLs to sample (only use domains that comply with policy)
- `fallback`: optional flag; used when no keyword matches

Changes are detected automatically on the next inspiration fetch—no restart required. This lets the MCP adapt to new verticals (e.g., hardware, motion design, scientific dashboards) without manual code changes.

## Maintenance

- Artifacts live under `state/web_inspiration/`.
- The autopilot cleans stale assets (>7 days) once per day while the feature is enabled.
- Disable the feature by unsetting `WVO_ENABLE_WEB_INSPIRATION` or setting it to `0`.

## Troubleshooting

- **Playwright install fails**: run `npm install --prefix tools/wvo_mcp playwright` and `npx --yes --prefix tools/wvo_mcp playwright install chromium --with-deps`.
- **Domains blocked**: update `WVO_WEB_INSPIRATION_DOMAINS`.
- **No assets captured**: check logs for deny-list messages or timeouts. The system fails fast after 10 seconds to protect throughput.

## Performance Guardrails

- At most one fetch per task unless assets are missing.
- Hard 10-second timeout on page load.
- HTML snapshots truncated to 500 KB to keep disk usage in check.
- Telemetry tracks fetch counts, success rate, cache hits, average size, and duration.
