# Provider Staging & Smoke Tests

We support staging integrations for new LLM providers without wiring them into
the live autopilot loop by default.

## Current Providers

| Provider ID      | Family     | Status     | Enable Flag                                | Rationale                                     |
|------------------|------------|------------|---------------------------------------------|-----------------------------------------------|
| `codex`          | OpenAI     | production | n/a (always enabled)                        | Tier A baseline for all product work          |
| `claude_code`    | Anthropic  | production | n/a (always enabled)                        | Tier A+ (higher context, higher quality)      |
| `claude_opus`    | Anthropic  | staging    | `WVO_ENABLE_PROVIDER_CLAUDE_OPUS=1`         | Tier A+ experimental (expensive)              |
| `claude_sonnet`  | Anthropic  | staging    | `WVO_ENABLE_PROVIDER_CLAUDE_SONNET=1`       | Tier A+ standard                              |
| `claude_haiku`   | Anthropic  | staging    | `WVO_ENABLE_PROVIDER_CLAUDE_HAIKU=1`        | Tier B (cheaper, smaller context)             |
| `glm_latest`     | GLM        | staging    | `WVO_ENABLE_PROVIDER_GLM=1`                 | Tier B (solid fallback, cheaper than Codex)   |
| `gemini_pro`     | Google     | staging    | `WVO_ENABLE_PROVIDER_GEMINI_PRO=1`          | Tier C (acceptable, watch quality regressions)|
| `gemini_flash`   | Google     | staging    | `WVO_ENABLE_PROVIDER_GEMINI_FLASH=1`        | Tier C-/D (fast/cheap, limited fidelity)      |

All staging providers require the corresponding API key/environment variables
to be present. Without the environment flag the provider is ignored by the
autopilot.

> **Note:** These definitions track each vendor’s _monthly plan_ lineup, not a
> fixed API build. When you enable a provider, the registry always selects the
> latest model tier available under that plan (e.g. GLM Plus, Gemini 1.5 Pro).

## Smoke Testing Providers

Run the staged provider smoke tests without touching the live automation:

```bash
cd tools/wvo_mcp
npm run providers:smoke            # runs smoke tests for enabled + production providers
npm run providers:smoke -- --include-staging  # include staging providers
npm run providers:smoke -- --provider claude_opus --include-staging
```

The account-registration wizard can invoke these smoke tests automatically for
any provider you configure, giving immediate confirmation that credentials are
valid before you return to the autopilot loop.

The smoke test validates required environment variables and, when possible,
runs a lightweight command to ensure the CLI/SDK is present. Failures are
reported with actionable guidance so you can iterate on credentials before
enabling a provider globally.

## Enabling a Provider for Experiments

1. Export the feature flag for the provider you want to test, e.g.
   `export WVO_ENABLE_PROVIDER_GEMINI_PRO=1`.
2. Set the required API keys (`GEMINI_API_KEY`, `GLM_API_KEY`,
   `ANTHROPIC_API_KEY`, etc.).
3. Run `npm run providers:smoke -- --provider gemini_pro --include-staging` to
   confirm the environment is ready.
4. Launch targeted experiments (e.g. via a one-off script) rather than the
   autopilot—production workflows continue to default to Codex unless explicitly
   reconfigured.

When you are done experimenting, unset the environment flag or restart the
session so the provider is no longer considered.
