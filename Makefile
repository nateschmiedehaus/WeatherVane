.PHONY: bootstrap bootstrap-offline api web worker model demo-ml simulator format lint test test-py migrate smoke-context smoke-pipeline export-observability check-secrets security clean-metrics mcp-build mcp-register mcp-run mcp-auto mcp-autopilot-feed mcp-autopilot-reservations mcp-autopilot-budget mcp-autopilot-summary autopilot

NUMERIC_AGENT_GOALS := 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16

CLI_AGENT_GOAL :=
ifneq ($(filter mcp-autopilot,$(MAKECMDGOALS)),)
CLI_AGENT_GOAL := $(firstword $(filter $(NUMERIC_AGENT_GOALS),$(MAKECMDGOALS)))
endif
ifneq ($(filter autopilot,$(MAKECMDGOALS)),)
CLI_AGENT_GOAL := $(firstword $(filter $(NUMERIC_AGENT_GOALS),$(MAKECMDGOALS)))
endif

AGENT_OVERRIDE :=
ifneq ($(strip $(mcp-autopilot)),)
AGENT_OVERRIDE := $(strip $(mcp-autopilot))
else ifneq ($(strip $(autopilot)),)
AGENT_OVERRIDE := $(strip $(autopilot))
else ifneq ($(strip ${make-autopilot}),)
AGENT_OVERRIDE := $(strip ${make-autopilot})
else ifneq ($(strip $(CLI_AGENT_GOAL)),)
AGENT_OVERRIDE := $(strip $(CLI_AGENT_GOAL))
endif

ifneq ($(strip $(AGENT_OVERRIDE)),)
export MCP_AUTOPILOT_COUNT := $(strip $(AGENT_OVERRIDE))
export WVO_CODEX_WORKERS := $(strip $(AGENT_OVERRIDE))
export WVO_WORKER_COUNT := $(strip $(AGENT_OVERRIDE))
export WVO_AUTOPILOT_AGENTS := $(strip $(AGENT_OVERRIDE))
export AGENTS := $(strip $(AGENT_OVERRIDE))
endif

ifeq ($(strip $(MAKECMDGOALS)),)
.DEFAULT_GOAL := autopilot
endif

.PHONY: $(NUMERIC_AGENT_GOALS)
$(NUMERIC_AGENT_GOALS):
	@:

ifneq ($(strip $(WORKERS)),)
export WVO_CODEX_WORKERS := $(strip $(WORKERS))
export MCP_AUTOPILOT_COUNT := $(strip $(WORKERS))
export WVO_WORKER_COUNT := $(strip $(WORKERS))
endif

ifneq ($(strip $(ACCOUNT_SETUP)),)
export WVO_AUTOPILOT_ACCOUNT_SETUP := 1
endif

export WVO_AUTOPILOT_ONCE ?= 0
export WVO_AUTOPILOT_ALLOW_OFFLINE_FALLBACK ?= 0
export STOP_ON_BLOCKER ?= 0
export WVO_AUTOPILOT_STREAM ?= 0

PYTHON_BIN ?= $(shell ./scripts/python_toolchain.sh)
PYTHON_ENV = PYTHONPATH=.deps:. $(PYTHON_BIN)

CODEX_HOME ?= $(shell pwd)/.codex
CODEX_ORCHESTRATOR_PROFILE ?= weathervane_orchestrator
WVO_CAPABILITY ?= high
CODEX_AUTOPILOT_MODEL ?= codex-5-high
CODEX_AUTOPILOT_REASONING ?= auto
BASE_INSTRUCTIONS ?= $(shell pwd)/docs/wvo_prompt.md
CONFIGURE_CODEX_PROFILE = python tools/wvo_mcp/scripts/configure_codex_profile.py
WVO_MCP_ENTRY ?= tools/wvo_mcp/dist/index.js

DEMO_TENANT ?= demo-ml-tenant
DEMO_DAYS ?= 14
DEMO_OUTPUT ?= tmp/demo_ml
DEMO_SEED_WEATHER_SHOCK ?=
DEMO_YEARS ?=
DEMO_GEO_LAT ?=
DEMO_GEO_LON ?=
DEMO_PRODUCT ?= demo-product
DEMO_CATEGORY ?= demo-category
DEMO_PLAN ?=
DEMO_LAKE_ROOT ?= storage/lake/raw
DEMO_PLAN_OUTPUT ?= tmp/demo_plan.json

UNAME_S := $(shell uname -s 2>/dev/null)
UNAME_M := $(shell uname -m 2>/dev/null)

ifeq ($(UNAME_S),Darwin)
  ifeq ($(UNAME_M),arm64)
    PYTHON_REQUIREMENTS := requirements/apple-silicon.lock
  else
    PYTHON_REQUIREMENTS := requirements.txt
  endif
else
  PYTHON_REQUIREMENTS := requirements.txt
endif

bootstrap:
	$(PYTHON_BIN) -m pip install --upgrade pip
	$(PYTHON_BIN) -m pip install -r $(PYTHON_REQUIREMENTS) || true
	npm install --prefix apps/web || true

bootstrap-offline:
	@[ -d .wheels ] || (echo ".wheels cache missing; run 'pip download -r $(PYTHON_REQUIREMENTS) -d .wheels' on a networked host." && exit 1)
	$(PYTHON_BIN) -m pip install --no-index --find-links .wheels -r $(PYTHON_REQUIREMENTS)
	npm install --prefer-offline --prefix apps/web || true

api:
	uvicorn apps.api.main:app --reload

web:
	npm run dev --prefix apps/web

worker:
	$(PYTHON_BIN) -m apps.worker.run

model:
	$(PYTHON_BIN) -m apps.model.train

demo-ml:
	PYTHONPATH=. $(PYTHON_BIN) scripts/minimal_ml_demo.py --tenant $(DEMO_TENANT) $(if $(DEMO_PLAN),--plan $(DEMO_PLAN),) $(if $(DEMO_YEARS),--years $(DEMO_YEARS),--days $(DEMO_DAYS)) --output $(DEMO_OUTPUT) $(if $(DEMO_GEO_LAT),--geo $(DEMO_GEO_LAT) $(DEMO_GEO_LON),) --product $(DEMO_PRODUCT) --category $(DEMO_CATEGORY) $(if $(DEMO_SEED_WEATHER_SHOCK),--seed-weather-shock,)

.PHONY: demo-plan
demo-plan:
	PYTHONPATH=. $(PYTHON_BIN) scripts/plan_brand_demo.py --tenant $(DEMO_TENANT) --lake-root $(DEMO_LAKE_ROOT) --output $(DEMO_PLAN_OUTPUT) --pretty

simulator:
	$(PYTHON_BIN) -m apps.simulator.run

format:
	black apps shared
	npm run format --prefix apps/web || true

lint:
	ruff check apps shared --select E,F --ignore E501
	npm run lint --prefix apps/web || true

typecheck:
	npm --prefix apps/web run typecheck
	npm --prefix tools/wvo_mcp run typecheck

security:
	$(PYTHON_BIN) tools/security/run_security_checks.py

test:
	$(PYTHON_ENV) -m pytest apps tests
	npm test --prefix apps/web || true
	$(PYTHON_BIN) -m shared.observability.metrics --base-dir tmp/metrics

test-py:
	$(PYTHON_ENV) -m pytest apps tests

migrate:
	env database_url=$${DATABASE_URL} alembic upgrade head

smoke-context:
	$(PYTHON_ENV) apps/worker/run.py demo-tenant --start 2024-01-01 --end 2024-01-07

smoke-pipeline:
	$(PYTHON_ENV) apps/worker/run.py demo-tenant --smoke-test

export-observability:
	$(PYTHON_ENV) apps/worker/maintenance/export_observability.py storage/metadata/state observability/latest

publish-observability:
	$(PYTHON_ENV) apps/worker/maintenance/publish_observability.py analytics.telemetry retention geocoding --dry-run

check-secrets:
	$(PYTHON_ENV) apps/worker/maintenance/secrets.py

clean-metrics:
	$(PYTHON_BIN) -m shared.observability.metrics --base-dir tmp/metrics

# Unified Multi-Provider Autopilot
# Usage: make autopilot AGENTS=5
autopilot: mcp-build
	@echo "🚀 Starting Unified Multi-Provider Autopilot"
	@echo "  Agents: $(AGENTS)"
	@echo ""
	@bash tools/wvo_mcp/scripts/autopilot_unified.sh --agents $(AGENTS)

mcp-build:
	npm install --prefix tools/wvo_mcp
	node tools/wvo_mcp/scripts/ensure-sqlite-build.mjs
	npm run build --prefix tools/wvo_mcp

mcp-register: mcp-build
	mkdir -p $(CODEX_HOME)
	if command -v codex >/dev/null 2>&1; then \
		CODEX_HOME=$(CODEX_HOME) codex mcp add weathervane -- env WVO_CAPABILITY=high node $(WVO_MCP_ENTRY) --workspace $(shell pwd); \
	else \
		echo "codex CLI not found; skipping MCP registration (offline fallback)."; \
	fi

mcp-run:
	CODEX_HOME=$(CODEX_HOME) node $(WVO_MCP_ENTRY) --workspace $(shell pwd)

mcp-auto: mcp-build mcp-register
	CODEX_HOME=$(CODEX_HOME) $(CONFIGURE_CODEX_PROFILE) $(CODEX_HOME)/config.toml $(CODEX_ORCHESTRATOR_PROFILE) $(shell pwd) $(BASE_INSTRUCTIONS) --model $(CODEX_AUTOPILOT_MODEL) --sandbox danger-full-access --ask-for-approval never --reasoning $(CODEX_AUTOPILOT_REASONING)
	CODEX_HOME=$(CODEX_HOME) CODEX_PROFILE=$(WVO_CAPABILITY) WVO_DEFAULT_PROVIDER=codex codex session --profile $(CODEX_ORCHESTRATOR_PROFILE)
.PHONY: mcp-autopilot-cleanup
mcp-autopilot-cleanup:
	@echo "🧹 Cleaning up stale autopilot processes..."
	@pkill -9 -f "claude.*whoami" 2>/dev/null || true
	@pkill -9 -f "codex exec.*weathervane_orchestrator" 2>/dev/null || true
	@pkill -9 -f "tools/wvo_mcp/dist/worker/worker_entry.js" 2>/dev/null || true
	@pkill -9 -f "dist/index-claude.js.*weathervane" 2>/dev/null || true
	@pkill -9 -f "tools/wvo_mcp/scripts/autopilot_unified.sh" 2>/dev/null || true
	@sleep 1
	@echo "✅ Cleanup complete"

.PHONY: mcp-autopilot
mcp-autopilot:
	@echo "⚠️  Legacy alias: use 'make autopilot' going forward."
	@$(MAKE) autopilot AGENTS=$(AGENTS)

.PHONY: mcp-autopilot-feed
mcp-autopilot-feed:
	@python tools/wvo_mcp/scripts/activity_feed.py --mode feed --follow

.PHONY: mcp-autopilot-reservations
mcp-autopilot-reservations:
	@python tools/wvo_mcp/scripts/activity_feed.py --mode reservations

.PHONY: mcp-autopilot-reservations-release
mcp-autopilot-reservations-release:
	@python tools/wvo_mcp/scripts/activity_feed.py --mode release $(if $(FILE),--file $(FILE),) $(if $(STALE_MINUTES),--stale-minutes $(STALE_MINUTES),)

.PHONY: mcp-autopilot-budget
mcp-autopilot-budget:
	@python tools/wvo_mcp/scripts/activity_feed.py --mode budget

.PHONY: mcp-autopilot-summary
mcp-autopilot-summary:
	@python tools/wvo_mcp/scripts/activity_feed.py --mode summary
