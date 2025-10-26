# WeatherVane — Agent Handbook

## Rapid Orientation (read this first)
- **Start every loop** by calling the MCP tools `plan_next` (use `minimal=true`) and `autopilot_status`. The status response now includes consensus staffing insights and token health (fed by `state/analytics/orchestration_metrics.json`). If either tool fails, pause and run `./tools/wvo_mcp/scripts/restart_mcp.sh`.
- **🚨 ALWAYS FINISH TASKS COMPLETELY - NO FOLLOW-UPS.** When you start a task with Spec→Plan→Think→Implement→Verify→Review→PR→Monitor protocol, you MUST complete ALL stages in the current session. No partial completion, no "will fix later", no deferring to follow-up sessions. Build must pass (0 errors), all tests pass, all acceptance criteria met, documentation complete. See CLAUDE.md for full policy.
- **Respect the consensus engine.** When critical or failed-quorum decisions appear, the autopilot will open follow-up tasks assigned to Atlas or Director Dana. Use them to progress escalations instead of bypassing review.
- **Keep the test critic honest.** Run `bash tools/wvo_mcp/scripts/run_integrity_tests.sh` (the TestsCritic command) to execute backend pytest, web checks, and MCP vitest in one batch. Tag failures with the batch step when reporting.
- **Mind the token budget.** Context is trimmed automatically by `TokenEfficiencyManager` when it grows past ~1000 words; it writes backups under `state/backups/context/`. Keep `state/context.md` concise to avoid churn.
- **Log decisions as you go.** Update `state/context.md` and run `state_save` before breaks so the autopilot and Atlas receive current briefings.

### Mandatory Spec→Plan→…→Monitor Loop (Codex edition)
The Claude council policy applies verbatim to Codex. For every task:

**CRITICAL: Integration-First Development Protocol**

⚠️ **BEFORE implementing ANY feature, you MUST check for existing systems** ⚠️

**Search → Integrate → Verify** (not "Build → Integrate → Fix"):

**Step 1: SEARCH** (5-10 minutes, mandatory):
```bash
# Search for similar functionality
grep -r "keyword" src/
glob "**/*keyword*.ts"

# Examples:
grep -r "model" src/        # Find model-related systems
grep -r "registry" src/     # Find registry patterns
grep -r "discovery" src/    # Find discovery services
```

**Questions to answer**:
- Does this system already exist?
- Are there similar patterns to follow?
- What types/interfaces are defined?
- What's the standard approach in this codebase?

**Step 2: INTEGRATE** (not implement from scratch):
- ✅ Use existing systems, extend them if needed
- ✅ Follow established patterns
- ✅ Reference shared types/interfaces
- ❌ Don't duplicate functionality
- ❌ Don't create custom patterns

**Step 3: VERIFY** integration points:
- All integrations tested
- No duplicate functionality
- Follows codebase patterns
- Uses shared utilities

**Red Flags** (stop and escalate):
- Hardcoding values that come from existing systems
- Creating duplicate interfaces/types
- Not using shared utilities (logger, config, etc.)
- Inventing new patterns instead of following existing ones

**Real Example**: ComplexityRouter initially hardcoded model names instead of using ModelRegistry/ModelDiscoveryService. Fixed by searching for "model", "registry", "discovery" → found existing systems → integrated with them.

**🚨 CRITICAL: Programmatic Integration Verification**

**Problem**: Code can CALL a system without USING its output (integration theater). Manual checklists are high-token and not scalable.

**Solution**: Create automated verification scripts (see CLAUDE.md for full protocol).

**MANDATORY for EVERY integration:**

1. **Create verification script**: `scripts/verify_<system>_integration.sh`
   - Use grep to check integration points
   - Exit 0 on success, 1 on failure
   - See `scripts/verify_complexity_router_integration.sh` for example

2. **Write integration tests**: `src/__tests__/<system>_integration.test.ts`
   - Verify output is USED, not just passed
   - Mock fallback to prove integration works

3. **Run in REVIEW stage**:
   ```bash
   bash scripts/verify_<system>_integration.sh
   # Must exit 0 before claiming integration complete
   ```

**Example verification script structure**:
```bash
#!/usr/bin/env bash
set -e
FAILURES=0

# Check system is called
if ! grep -q "systemX.process" src/caller.ts; then
  echo "❌ SystemX not called"
  FAILURES=$((FAILURES + 1))
fi

# Check output is used
if ! grep -q "input.systemXOutput" src/consumer.ts; then
  echo "❌ Consumer doesn't use output"
  FAILURES=$((FAILURES + 1))
fi

[ $FAILURES -eq 0 ] && echo "✅ Integration verified" || exit 1
```

**Benefits**: Low-token, automated, self-documenting, naturally evolving.

See CLAUDE.md § "Programmatic Integration Verification" for complete protocol.

**The protocol can loop multiple times - fix issues at the appropriate stage:**
```
Spec → Plan → Think → Implement → Verify → Review → PR → Monitor
  ↑      ↑      ↑        ↑           ↓
  └──────┴──────┴────────┴───────────┘
     Issues found? Loop back to appropriate stage
```

1. **Spec** – Restate the goal, enumerate acceptance criteria, cite relevant files/docs, list constraints (perf, security, compatibility). Record this in `state/context.md` or the task journal.
2. **Plan** – Break work into concrete diffs/commands/tests. Identify owners/files and log the plan hash (when required) so Supervisor can enforce plan deltas.
3. **Think (adversarial)** – Challenge the plan. Capture unknowns, risks, spike ideas, and edge cases. Skip only when the change truly fits in one trivial diff.
4. **Implement** – Write the code/docs/tests. Update prompts/scripts concurrently; no "docs later." Keep diffs minimal and logged.
5. **Verify** – Run the full suite:
   - `npm run build --prefix tools/wvo_mcp`
   - `node tools/oss_autopilot/scripts/run_vitest.mjs --run --scope=autopilot` (plus `--scope=web` when touching UI)
   - `bash tools/wvo_mcp/scripts/run_integrity_tests.sh` for consolidated testing when changes affect API/worker/shared libs.
   Fix failures before moving on. If failures found → back to IMPLEMENT.
6. **Review** – Self-review against the rubric (readability, maintainability, perf/security, executive quality). Capture notes and ensure Critical agent checks (secret/auth) are satisfied. If issues found:
   - Minor fixes → back to IMPLEMENT
   - Design issues → back to THINK or PLAN
   - Requirement gaps → back to SPEC
7. **PR** – Stage/describe the change (even if local). Update `state/autopilot_execution.md` with Spec→Monitor evidence and mention regenerated artifacts (e.g., Atlas) when applicable. Only proceed after REVIEW passes.
8. **Monitor** – Re-run `./autopilot_status` (and other monitors if relevant) to prove the system is healthy post-change. Log the timestamp in the execution log. Only proceed after PR complete.

**Zero tolerance items:**
- No skipping stages, no "follow-up needed," no leaving failing tests/builds.
- Every acceptance criterion must be met before declaring success.
- Protocol can loop multiple times - fix issues at the appropriate stage.
- Only stop mid-protocol for a critical blocker that demands human approval.

### Autonomous Modularization Review Policy

**🎯 Files exceeding length thresholds trigger AUTOMATIC modularization:**

**Thresholds:**
- File > 500 lines → Mandatory modularization
- Function > 100 lines → Mandatory refactoring
- Class > 300 lines → Mandatory breakdown

**When threshold exceeded:**
1. Pause current work immediately
2. Document violation (file, lines, reason)
3. Create modularization spec (follow Spec→Monitor)
4. Execute full protocol for modularization
5. Resume original work ONLY after modularization complete

**No exceptions** - "works fine" / "too busy" / "later" are NOT acceptable.

Large files = hard to understand/test/modify. Phase 3 lesson: StateGraph hit 648 lines because we didn't modularize earlier. Prevention is cheaper than remediation.

See CLAUDE.md for complete policy details.

### 🚨 MANDATORY: ZERO GAPS POLICY 🚨

**If REVIEW identifies ANY gaps, missing functionality, or placeholder implementations:**

❌ **NEVER say:** "Ship it with known gaps documented"
❌ **NEVER say:** "This can be addressed in Phase 7"
❌ **NEVER say:** "TODO: implement later"
❌ **NEVER say:** "This is non-blocking"

✅ **ALWAYS:** Fix ALL gaps immediately before claiming task complete

**What counts as a "gap":**
- Placeholder values (e.g., `tokens: 0`, `cost: 0` when real data exists)
- Missing integrations (e.g., "needs to wire with X" when X exists)
- Incomplete features (e.g., dashboard has `byTaskType` but not `byEpic` when tags support both)
- "TODO" comments in production code
- Features mentioned in SPEC but not implemented
- Test coverage gaps for critical paths

**Process when gaps found:**
1. Document ALL gaps with specific file:line references
2. Loop back to IMPLEMENT and fix every gap
3. Re-run VERIFY (build, tests, runtime)
4. REVIEW again - must find ZERO gaps
5. Only proceed to PR/MONITOR when gaps == 0

**This is non-negotiable. Deferred gaps become technical debt.**

## 0. Mission and Constraints
- **Mission:** Implement WeatherVane, a multi-tenant, weather-intelligent ads allocator that recommends or pushes platform-safe budgets by product category × geo × channel.
- **Guardrails:**
  - Assume ad inventories can be empty, messy, or abundant; surface graceful fallbacks for each case.
  - Respect ad-platform learning phases; enforce ramp limits, change windows, and guardrails.
  - Automation is opt-in: Manual, Assist (approval), or Autopilot modes must be supported at every step.
  - UX copy must stay truthful—no guarantees of performance.
  - Consensus escalations and token-efficiency edits must be treated as production operations—never disable these safety nets without explicit approval.
- **Non-goals (v1):** Generating creative assets, modifying tracking pixels, building custom attribution beyond available platform/shop data.

## 1. System Overview
```
apps/
  web/        # Next.js (TypeScript) experience layer
  api/        # FastAPI (Python) control plane
  worker/     # Prefect/Celery job runners for ingestion, features, modeling, allocation, pushes
  model/      # Training pipelines, validation, ONNX export
  simulator/  # Backtests, scenario engine
infra/
  terraform/  # IaC definitions
  k8s/        # Deployment manifests (if applicable)
shared/
  schemas/    # Pydantic + Zod contracts, OpenAPI docs
  libs/       # Connector SDKs, geo clustering, ad tagging utilities
  feature_store/ # Cached weather & promo features
storage/
  lake/       # Parquet/Delta analytics store
  metadata/   # Postgres metadata, RBAC, approvals, audit logs
```

**Services**
- **Ingestion Service:** Shopify, Klaviyo, Meta Ads, Google Ads, weather/AQI/pollen connectors, webhooks, backfills.
- **Feature Store:** Weather climatology cache, anomaly builder, regime clustering, promo/holiday calendars.
- **Model Service:** Baseline+weather GAM, MMM with adstock+saturation, heterogeneity learners, drift monitors.
- **Allocator:** Robust optimization over profit curves, scenario sampling, ramp policies, guardrail enforcement.
- **Push Service:** Budget writes with dry-run diffs, approval workflow, rollback, audit logging.
- **UI/API:** Plan, Stories, Catalog & Tags, Automations, Experiments, Diagnostics.
- **Observability:** Metrics, tracing, rate-limit dashboards, data-quality checks.

### Autopilot & MCP Workflow
- **Tools to hit every loop:** `plan_next`, `autopilot_status`, `state_metrics`, `critics_run`.
- **Consensus pipeline:** Critical or failed-quorum decisions in `state/analytics/orchestration_metrics.json` will auto-create follow-up tasks. Use Atlas/Dana routing to close them and keep autopilot unblocked.
- **Telemetry inputs:** `autopilot_status` combines audit cadence, staffing recommendation, and consensus trend; reference it before rebalancing agents or editing guardrails.
- **Token efficiency:** `TokenEfficiencyManager` trims `state/context.md` when token pressure is critical and archives backups in `state/backups/context/`. Review those backups before restoring context detail.
- **Testing contract:** Always use `bash tools/wvo_mcp/scripts/run_integrity_tests.sh` instead of ad-hoc `make test` so the batch critic reflects the real CI workflow.

## 2. Runtime Stack
- **Backend:** Python 3.11+, FastAPI, Polars, DuckDB, LightGBM, statsmodels/pyGAM, cvxpy, ONNX Runtime.
- **Workers:** Prefect (preferred) or Celery + Redis; APScheduler for cron triggers.
- **Frontend:** Next.js 14, React 18, TanStack Query, Maplibre GL, Framer Motion (with prefers-reduced-motion support).
- **Storage:** Postgres 15 (metadata), S3/GCS-compatible object store for Parquet/Delta, Redis/KeyDB for caching.
- **Auth:** OAuth to partner APIs; magic-link or SSO (OIDC) for app users.
- **Infra:** Dockerized services; Terraform for cloud; local `docker compose` for dev.

### Key Environment Variables
```
APP_ENV=dev|staging|prod
BASE_URL=https://app.weathervane.example
DATABASE_URL=postgres://...
OBJECT_STORE_URL=s3://weathervane-lake/...
JWT_SECRET=...

# Connector credentials
SHOPIFY_API_KEY=...
KLAVIYO_API_KEY=...
META_APP_ID=...
META_APP_SECRET=...
GOOGLEADS_DEVELOPER_TOKEN=...
GOOGLEADS_OAUTH_CLIENT_ID=...
GOOGLEADS_OAUTH_CLIENT_SECRET=...

WEATHER_PROVIDER=open-meteo
AIR_QUALITY_PROVIDER=openaq
FF_AUTOPUSH_DEFAULT=false
FF_HOURLY_MODE=false
FF_EXPERIMENTS=true
```

## 3. Data Contracts
### Postgres (Control Plane)
- `tenant(id, name, region, created_at)`
- `connection(id, tenant_id, provider, scopes, status, last_sync_at, settings_json)`
- `product_dim(tenant_id, product_id, title, category, tags_json, price, image_url, archived, metafield_version)`
- `ad_asset_dim(tenant_id, channel, asset_id, asset_type, name, text_snippet, image_hash, landing_url, product_ids[], created_at, archived)`
- `ad_group_dim(tenant_id, channel, group_id, name, targeting_json, product_categories[], weather_tags[], status, intent_tags[])`
- `campaign_dim(tenant_id, channel, campaign_id, name, objective, budget_type, shared_budget_id)`
- `ad_tag(tenant_id, tag_id, scope ENUM('product','category','weather','season','intent','creative_style'), value, description)`
- `ad_asset_tag(tenant_id, asset_id, tag_id)`
- `guardrail_policy(tenant_id, max_daily_budget_delta_pct, min_daily_spend, roas_floor, cpa_ceiling, change_windows_json, autopilot_mode ENUM('manual','assist','autopilot'))`
- `plan_reco(tenant_id, plan_id, plan_date, geo_group_id, category, channel, reco_spend, expected_rev_low, expected_rev_mid, expected_rev_high, expected_roas_low, expected_roas_mid, expected_roas_high, rationale_json)`
- `approval(plan_id, status ENUM('draft','pending','approved','rejected'), approver_user_id, requested_at, decided_at, note)`
- `audit_log(id, tenant_id, actor_type, actor_id, action, payload_json, created_at)`

### Lakehouse (Parquet/Delta)
- `orders_fact(tenant_id, order_id, order_dt, product_id, price, qty, discount, tax, returns_flag, net_revenue, ship_postcode, ship_city, ship_region, ship_country, currency)`
- `ads_fact(tenant_id, channel, date, campaign_id, ad_group_id, ad_id, geo_cell, spend, impressions, clicks, conversions, revenue_attrib, roas_platform)`
- `promo_fact(tenant_id, date, promo_type, discount_pct, klaviyo_sends, klaviyo_opens, utm_campaigns[])`
- `inventory_snapshot(tenant_id, date, product_id, on_hand_qty, safety_stock)`
- `weather_daily(geo_cell, date, temp_max_c, temp_min_c, precip_mm, snow_cm, humidity_pct, wind_kph, uv_index, aqi, pollen_index, storm_flag, pressure_hpa, dew_point_c)`
- `climatology(geo_cell, day_of_year, temp_max_norm, temp_min_norm, precip_norm, humidity_norm)`
- `geo_map(tenant_id, geo_cell, dma_code, city, region, country, meta_geo_ids[], google_geo_ids[])`
- `feature_matrix(tenant_id, date, geo_group_id, category, engineered_features_json)`
- `model_artifacts(tenant_id, category, geo_group_id, channel, version, onnx_uri, metrics_json)`

### Tag Taxonomy
- Weather: Rain, Snow, Heat, Cold, Humidity, Wind, UV, AQI, Pollen, Storm.
- Season: Spring, Summer, Fall, Winter.
- Intent: Prospecting, Remarketing, Cross-sell, Loyalty.
- Creative Style: Static, Video, UGC, Lifestyle, Product Closeup, Offer-led.

## 4. Ad Inventory Normalisation & Tagging
1. **Ingest** campaigns/ad sets/ad assets via Meta Marketing API and Google Ads API.
2. **Normalise** fields into `campaign_dim`, `ad_group_dim`, `ad_asset_dim`.
3. **Auto-tag** using:
   - NLP on copy/UTMs for product/category/weather cues.
   - Image embeddings (CLIP/SigLIP) for umbrellas, jackets, sunscreen, etc.
   - Weather keywords ("storm", "heatwave", "allergy").
4. **Human review UI** to accept/adjust tags; changes sync back to Shopify metafields when relevant.
5. **Ad-Kit Generator** when inventory is missing: output structured recommendations (targeting, budgets, creative brief) and, if write access exists, create paused draft campaigns/ad sets.

## 5. Geography & Grouping Logic
- **Canonical geo cell:** geohash-5 (≈5 km) for weather joins.
- **Grouping layers:**
  1. Climate archetypes (Köppen-Geiger class per cell).
  2. Dynamic weather regimes (7–14 day anomalies clustered with DTW).
  3. Demand signatures (learned elasticity vectors per category).
- **Ad-platform mapping:** each `geo_group_id` stores a bounded list of targetable Meta (city/zip/market) and Google (location criterion) IDs.
- **Explore ring:** maintain pooled budget for underserved high-headroom geos; keep within platform-safe change thresholds.

## 6. Modeling Pipeline
### Targets
- `baseline_sales`: expected sales with promo/season/holiday and zero paid media.
- `incremental_media_sales`: lift attributable to media after controlling for weather/promo factors.

### Models
- **Baseline + Weather:** GAM with thin-plate splines (trend, DoW, holidays, promo signals, weather anomalies/leads/lags) and partial pooling across category × geo group.
- **Media (MMM):** Adstock + Hill saturation transforms per channel; monotone constraints; doubly-robust meta-learner for bias reduction; calibrate to lift tests when available.
- **Elasticity heterogeneity:** meta-learner that lets weather regime and promo state modulate media ROAS.

### Feature Funnel
1. Stage 0 (locked): trend, DoW, holidays, promo flags (discount %, email/SMS send), temp/precip anomalies, precip flag.
2. Stage 1 (candidates): heat index, wind chill, wet bulb, humidity, wind gust, UV, AQI, pollen, storm flag, snow depth; leads/lags −2…+3; windowed counts (e.g., days >90°F in last 7).
3. Stage 2 (screening): time-aware resamples, stability selection, drop collinear variants.
4. Stage 3 (model ladder): GLM/GAM → monotone GBM → hierarchical Bayesian if data-rich; pick simplest within 1-SE of best error.
5. Stage 4 (hyperparameter tuning): multi-fidelity Bayesian optimisation (Hyperband) on adstock half-lives (2–21 days) and saturation curvature.
6. Stage 5 (prune/export): grouped SHAP/permutation importance for interpretability; export ONNX for serving.
7. Stage 6 (continual learning): nightly warm starts, weekly/biweekly full retrains, drift alerts on weather elasticities.

### Validation
- Rolling-origin CV (weekly steps) with blocked folds.
- Holdout 6–8 weeks for backtest; simulate allocator vs observed spend.
- Report wMAPE/MASE, incremental ROAS calibration error, stability of weather elasticities.

## 7. Budget Allocation & Push
- **Profit curves:** Build concave incremental profit functions per (category × geo group × channel × day) cell from model outputs and margin data.
- **Objective:** Maximise expected profit over horizon H (default 7 days) under total budget, min/max, smoothness (|Δ spend| ≤ threshold), ROAS/CPA guardrails, platform learning constraints.
- **Robustness:** Sample forecast scenarios (mean/p10/p90); add CVaR penalty to damp aggressive bets.
- **Solver:** Projected gradient on piecewise-linear approximation or convex programme via cvxpy; runtime < 5 s for ≈5k cells.
- **Ramp policy:** cap day-over-day changes (5–20%), respect change windows, batch pushes to comply with Meta/Google learning rules.
- **Push modes:**
  - Manual: never write; user exports CSV.
  - Assist: generate plan, require approval, push on approval.
  - Autopilot: push automatically within guardrails; escalate exceptions.
- **Audit:** Every write logs before/after, rationale, actor.

## 8. Ad Implementation Ladder
- **L0 Read-only:** deliver plan + specs; no pushes.
- **L1 Draft structures:** create paused campaigns/ad sets with targeting/budget schedule and attach Ad-Kit briefs.
- **L2 Asset mapping:** auto-map existing assets to weather groups; freeze ineligible ones.
- **L3 Fully managed:** (future) auto-populate product feeds and creatives with approvals.

**Ad-Kit brief JSON contract**
```
{
  "campaign_objective": "Sales",
  "adset_targeting": {"geo_group": "RAIN_COOL_PNW", "age": "broad", "placements": "auto"},
  "budget": {"daily": 500, "schedule": ["Thu","Fri","Sat"]},
  "creative_brief": {
    "angles": ["Storm-ready shell", "Dry without bulk"],
    "visuals": ["Rain beading", "Close-up waterproof zipper"],
    "cta": ["Shop rain jackets"],
    "landing": "/collections/rain-jackets?utm_campaign=wv_rain_opportunity",
    "specs": ["1x1 image", "9:16 short video"]
  },
  "expected": {
    "revenue_range": [4000, 6000],
    "roas_range": [4.0, 6.0],
    "assumptions": ["CTR ≥ 1.2%", "CVR ≥ 2.5%"]
  }
}
```

## 9. Automations, Approvals, Guardrails
- **Guardrail policy flags:** max daily delta %, min spend, ROAS/CPA thresholds, change windows (e.g., avoid big edits during Meta learning), do-not-touch campaign IDs, inventory sensitivity.
- **Approval flow:** plan `draft` → request approval → approver sees diffs, rationale, expected ranges → approve (push) or reject (capture reason, re-optimise with new bounds).
- **Notifications:** email/Slack with top changes, weather drivers, and automation status.

## 10. UX Contracts
- **Plan screen:** tabular + map view; 7-day rolling horizon; cells show spend change, expected ROAS band, weather glyph; "what-if" sliders.
- **Stories:** top opportunities, underserved geos, promo × weather synergies.
- **Catalog & Tags:** tree of collections, auto-suggested tags with evidence; edits write back to Shopify metafields.
- **Automations:** toggles for automation level, guardrails, ingestion status, alert routing.
- **Experiments:** simple geo-split templates; results feed MMM calibration.
- **Diagnostics:** model metrics, drift charts, feature importances.

**Aesthetics:**
- Animated isobars/wind fields with CPU-friendly UV mapping; particle rain/snow scaled to anomaly intensity.
- Colors: neutral base, diverging anomaly palette; WCAG AA.
- Motion disabled when `prefers-reduced-motion` is true.
- Accessible: keyboard-first, ARIA labels, high-contrast text.

## 11. Job Graph
1. **Daily @ 02:00 local:** ingest orders/ads/promos; update weather forecasts; recompute anomalies & regimes; refresh feature matrix; warm-start model fit; run allocator; generate plan; trigger approvals/push; write audits; update metrics.
2. **Intra-day (optional):** pacing/forecast deviation checks; reallocate remaining spend within ramp limits.
3. **Monthly:** full retrain, recalibrate with lift tests, refresh geo clustering.

## 12. Security & Compliance
- OAuth with least-privilege scopes; secrets vaulted, rotated.
- Aggregate geo only; no individual PII stored; support data deletion/export per tenant.
- Region pinning (e.g., EU-only storage) configurable per tenant.
- SOC2 controls: audit logs, change management, access reviews.

## 13. Testing & Acceptance
- Connectors: backfill 12 months, idempotent re-runs, rate-limit safe.
- Tagging: ≥85% precision on curated validation set; Shopify metafield writeback verified.
- Models: reproducible rolling-origin CV; backtest uplift simulation passes acceptance thresholds.
- Allocator: meets guardrails; returns plan in <5s for 5k cells; respects scenario CVaR bounds.
- Push service: dry-run diffs correct; approvals gate writes; rollback on partial failure; audit entries complete.
- UI: loads plan <2s with cached data; responsive; keyboard navigation works; motion respects preferences.

## 14. Deliverable Checklist (v1)
- [ ] Shopify/Klaviyo/Meta/Google/Weather connectors with read (and optional write) scopes.
- [ ] Lakehouse + Postgres schemas deployed; migrations scripted.
- [ ] Weather feature cache, anomalies, regime clustering.
- [ ] Catalog & ad tagging UI + auto-tagging service + metafield round-trip.
- [ ] Baseline+weather models, MMM, heterogeneity learner, ONNX exporter.
- [ ] Allocator with scenario sampling, ramp, guardrails.
- [ ] Plan, Stories, Catalog, Automations, Experiments, Diagnostics pages.
- [ ] Approval workflow, audit logging, notification hooks.
- [ ] Push service with manual/assist/autopilot modes, rollback, diffing.
- [ ] Backtest simulator + reporting.
- [ ] Observability stack (metrics, logging, rate-limit dashboards).
- [ ] Compliance: data export/delete endpoints, secrets vault, access logs.

## 15. Known Risks & Mitigations
- **Sparse data:** pool by category × geo group; rely on priors; trigger explore budgets carefully.
- **Inventory outages:** integrate inventory snapshots; throttle spend when OOS risk rises.
- **Promo dominance:** promo features allowed to override weather; communicate clearly in UI.
- **Platform API failures:** retry with exponential backoff; pause pushes on repeated errors; notify user.
- **User overrides:** capture manual edits; re-optimise with updated constraints; track in audit log.

## 16. References (surface to users where relevant)
- Meta learning phase guidance.
- Google Smart Bidding learning limits and overdelivery rules.
- Shopify Admin API (orders, products, metafields, webhooks).
- Klaviyo Campaign/Event APIs.
- Open-Meteo & OpenAQ data docs.

## 17. Proof-of-Concept Suite (Automated Diagnostic)

> **Purpose**
> This PoC suite is the conversion engine: it proves WeatherVane’s value using a brand’s own history without touching live budgets. Once connectors are authorized (read-only), the system auto-generates a truthful, data-backed report of past missed weather opportunities, with counterfactual spend simulations grounded in the causal models.

### 17.1 Inputs
- Shopify orders, products, categories, net revenue, returns, geo.
- Meta & Google Ads performance (spend, conversions, geo splits).
- Klaviyo promos (campaigns, discount intensity).
- Weather/AQI/pollen hindcasts + forecasts from shared cache.
- Optional: inventory snapshots, store locations.

### 17.2 Workflow
1. **Ingest & align** 12–24 months of history; join weather anomalies/regimes; infer promo calendar.
2. **Detect weather elasticity** for each category × region controlling for promos/media.
3. **Audit media responsiveness** (overspend vs underspend relative to weather-driven demand).
4. **Simulate counterfactuals** using MMM + weather models with archived forecasts (same total spend, WeatherVane allocation).
5. **Rank opportunities** by incremental profit and confidence.
6. **Render report** (interactive dashboard + PDF + CSV export) with narratives and methodology appendix.

### 17.3 Report Structure
- Executive summary with estimated historical incremental profit (same spend).
- Top missed opportunities table (date range, geo, category, weather event, actual vs optimal spend, missed revenue, confidence).
- Spend vs weather heatmaps; forecast vs realized overlays (proof of predictability).
- Seasonal playbook + recurring regimes per region.
- ROAS stability analysis (noise reduction when controlling for weather).
- Methodology appendix with data sources, model hashes, confidence intervals.

### 17.4 Automated Narratives
Rotating story templates pick the most compelling, statistically supported themes:
- Storm-missed opportunity, heatwave goldmine, quiet-season smart spend, underserved region, promo×weather synergy, stability case, risk mitigation, seasonal transition.

### 17.5 Truth & Compliance
- Uses only knowable, archived forecasts (hindcasts) at the time of decision.
- Shows median ± confidence intervals; no future guarantees.
- Highlights when weather impact is negligible (integrity first).
- Audit-ready: every figure references underlying dataset + model version.

### 17.6 Engineering Notes
```
poc/
  ingest.py
  model_fit.py
  simulate.py
  report_generator.py
  templates/
    executive_summary.md
    story_heatwave.md
    story_storm.md
    story_promo_weather.md
```
- Trigger flag: `run_poc=True` post-connection.
- Outputs stored at `poc_reports/{tenant_id}` with retention policy.
- Average runtime < 15 minutes per brand (parallel per category/region).
- Notifies user via in-app + email when ready.

### 17.7 Future Enhancements
- Live replay animation, anonymous benchmarking, public API for CRM embedding.

## 18. Recommended Free Stack & Operating Posture

### 18.0 Quick CLI Install Macro
Run once in a network-enabled environment to grab all Python dependencies (runtime, dev, MMM optional):

```
python -m pip install --upgrade pip && \
python -m pip install \
  fastapi \
  "uvicorn[standard]" \
  "pydantic>=2.7" \
  sqlalchemy \
  asyncpg \
  alembic \
  polars \
  duckdb \
  httpx \
  python-dotenv \
  pandas \
  numpy \
  jsonschema \
  pyyaml \
  tenacity \
  scikit-learn \
  lightgbm \
  statsmodels \
  onnxruntime \
  pygam \
  scipy \
  cvxpy \
  redis \
  loguru \
  pyarrow \
  pgeocode \
  geohash2 \
  typing-extensions \
  black \
  ruff \
  pytest \
  pytest-asyncio \
  prefect && \
python -m pip install "packaging<24.3" && \
python -m pip install lightweight-mmm
```

If `lightweight-mmm` is unavailable (network/platform), rerun the last line later; everything else stays intact.

### 18.1 Default Operating Mode
- Boot in **Read-Only Plan & Proof**: ingest, model, simulate missed opportunities, export reports.
- Platform pushes disabled until tenant opts into **Assist** (approval-gated) or **Autopilot** (guardrails enforced).
- Automated PoC report demonstrates value without touching live budgets.

### 18.2 Weather & Environmental Data (OSS / $0)
- **Open-Meteo** for forecast + historical; use anomaly features vs climatology to avoid provider bias.
- **ERA5 (Copernicus)** for climatology; cache only geohashes relevant to tenant geos.
- **OpenAQ** and Open-Meteo pollen endpoints for AQ/allergy signals; optional NOAA HRRR nowcast for short-range pacing.

### 18.3 Commerce & Marketing APIs
- Shopify Admin API (orders/products/metafields/webhooks), Klaviyo (campaigns/sends), Meta Marketing API, Google Ads API.
- Start with read scopes only; write scopes optional per tenant when pushes are enabled.

### 18.4 Modeling Toolchain
- Baseline + weather: **pyGAM** or **statsmodels GAM** plus LightGBM with monotonic constraints when needed.
- MMM: **Robyn** (Meta) or **LightweightMMM** (Google) for Bayesian flavour; **DoWhy/EconML** for causal sanity checks.
- Export models to **ONNX** for inference (quantize to INT8 for CPU efficiency).

### 18.5 Optimization & Simulation
- **cvxpy** (or piecewise-linear LP via scipy/pulp) for concave profit allocation with CVaR risk and ramp constraints.
- Scenario sampling from forecast quantiles baked into allocator.

### 18.6 Data & Feature Engineering
- **DuckDB** + **Polars** over **Parquet** (optionally delta-rs for ACID/time-travel).
- Redis optional; most workloads fit in-process.

### 18.7 Serving & Scheduling
- **FastAPI** service layer, **Prefect OSS** (or Dagster OSS) for orchestration, single small VM/container footprint.

### 18.8 Frontend & Visualization
- **Next.js + React + Tailwind + shadcn/ui** for UI scaffolding; **MapLibre GL** with cached OSM tiles; **ECharts** (Apache-2) for charts; **Framer Motion** respecting `prefers-reduced-motion`.

### 18.9 Tagging & Asset Intelligence
- **sentence-transformers** (MiniLM) for copy embeddings; **CLIP/SigLIP** checkpoints for lightweight image heuristics; round-trip tags via Shopify metafields and internal tables.

### 18.10 Security, Compliance, Operations
- Postgres control plane with tenant-scoped RBAC, approvals, audit log.
- OAuth least-privilege; aggregated geo only; immutable audit entries for every proposed/pushed change.
- Optional upgrades: conformal prediction bands (MAPIE), cvxpylayers for future differentiable ops, delta-rs for auditors.
