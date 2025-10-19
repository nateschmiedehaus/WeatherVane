.PHONY: bootstrap api web worker model demo-ml simulator format lint test migrate smoke-context smoke-pipeline export-observability check-secrets clean-metrics mcp-build mcp-register mcp-run mcp-auto mcp-autopilot-feed mcp-autopilot-reservations mcp-autopilot-budget mcp-autopilot-summary

ifneq ($(strip $(mcp-autopilot)),)
export MCP_AUTOPILOT_COUNT := $(strip $(mcp-autopilot))
ifeq ($(strip $(MAKECMDGOALS)),)
.DEFAULT_GOAL := mcp-autopilot
endif
endif

CODEX_HOME ?= $(shell pwd)/.codex
CODEX_ORCHESTRATOR_PROFILE ?= weathervane_orchestrator
WVO_CAPABILITY ?= high
CODEX_AUTOPILOT_MODEL ?= gpt-5-codex
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
	pip install --upgrade pip
	pip install -r $(PYTHON_REQUIREMENTS) || true
	npm install --prefix apps/web || true

api:
	uvicorn apps.api.main:app --reload

web:
	npm run dev --prefix apps/web

worker:
	python -m apps.worker.run

model:
	python -m apps.model.train

demo-ml:
	PYTHONPATH=. python scripts/minimal_ml_demo.py --tenant $(DEMO_TENANT) $(if $(DEMO_PLAN),--plan $(DEMO_PLAN),) $(if $(DEMO_YEARS),--years $(DEMO_YEARS),--days $(DEMO_DAYS)) --output $(DEMO_OUTPUT) $(if $(DEMO_GEO_LAT),--geo $(DEMO_GEO_LAT) $(DEMO_GEO_LON),) --product $(DEMO_PRODUCT) --category $(DEMO_CATEGORY) $(if $(DEMO_SEED_WEATHER_SHOCK),--seed-weather-shock,)

.PHONY: demo-plan
demo-plan:
	PYTHONPATH=. python scripts/plan_brand_demo.py --tenant $(DEMO_TENANT) --lake-root $(DEMO_LAKE_ROOT) --output $(DEMO_PLAN_OUTPUT) --pretty

simulator:
	python -m apps.simulator.run

format:
	black apps shared
	npm run format --prefix apps/web || true

lint:
	ruff check apps shared --select E,F --ignore E501
	npm run lint --prefix apps/web || true

test:
	PYTHONPATH=.deps:. pytest apps tests
	npm test --prefix apps/web || true
	python -m shared.observability.metrics --base-dir tmp/metrics

migrate:
	env database_url=$${DATABASE_URL} alembic upgrade head

smoke-context:
	PYTHONPATH=.deps:. python apps/worker/run.py demo-tenant --start 2024-01-01 --end 2024-01-07

smoke-pipeline:
	PYTHONPATH=.deps:. python apps/worker/run.py demo-tenant --smoke-test

export-observability:
	PYTHONPATH=.deps:. python apps/worker/maintenance/export_observability.py storage/metadata/state observability/latest

publish-observability:
	PYTHONPATH=.deps:. python apps/worker/maintenance/publish_observability.py analytics.telemetry retention geocoding --dry-run

check-secrets:
	PYTHONPATH=.deps:. python apps/worker/maintenance/secrets.py

clean-metrics:
	python -m shared.observability.metrics --base-dir tmp/metrics

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
	@pkill -9 -f "tools/wvo_mcp/scripts/autopilot.sh" 2>/dev/null || true
	@sleep 1
	@echo "✅ Cleanup complete"

.PHONY: mcp-autopilot
mcp-autopilot: mcp-autopilot-cleanup mcp-register
	@echo "🔁 Restarting MCP worker via scripts/restart_mcp.sh..."
	@./scripts/restart_mcp.sh
	@echo "⏳ Waiting for worker to warm up..."
	@sleep 5
	@echo "🚀 Starting WeatherVane Autopilot..."
	@echo "📝 Log file: /tmp/wvo_autopilot.log"
	@echo "🖥️  tmux multi-pane layout available (set WVO_AUTOPILOT_TMUX=0 to disable)."
	@echo "👀 Streaming log (Ctrl+C to stop autopilot)..."
	@echo "📡 Activity feed viewer attaches automatically (set WVO_AUTOPILOT_SHOW_FEED=0 to disable)."
	@echo ""
	@( \
		set -euo pipefail; \
		LOG_PATH=/tmp/wvo_autopilot.log; \
		: > "$$LOG_PATH"; \
		USE_TMUX=0; \
		if command -v tmux >/dev/null 2>&1 && [ "${WVO_AUTOPILOT_TMUX:-1}" = "1" ]; then \
			USE_TMUX=1; \
		fi; \
		if [ "$$USE_TMUX" -eq 1 ] && [ ! -t 1 ]; then \
			USE_TMUX=0; \
		fi; \
		AUTOPILOT_INTERACTIVE=$${WVO_AUTOPILOT_INTERACTIVE:-1}; \
		AGENTS_VALUE=$${AGENTS:-$${WVO_AUTOPILOT_AGENTS:-$${MCP_AUTOPILOT_COUNT:-}}}; \
		if [ "$$AUTOPILOT_INTERACTIVE" = "1" ] && [ -z "$$AGENTS_VALUE" ]; then \
			printf 'How many Codex agents should participate? [default: 3]: '; read AGENTS_VALUE; \
		fi; \
		AGENTS_VALUE=$${AGENTS_VALUE:-3}; \
		if ! printf '%s' "$$AGENTS_VALUE" | grep -Eq '^[0-9]+$$'; then AGENTS_VALUE=3; fi; \
		if [ "$$AGENTS_VALUE" -le 0 ]; then AGENTS_VALUE=1; fi; \
		echo "⚙️  Codex agents: $$AGENTS_VALUE"; \
		export AGENTS="$$AGENTS_VALUE"; \
		export WVO_AUTOPILOT_AGENTS="$$AGENTS_VALUE"; \
		export WVO_CODEX_WORKERS="$$AGENTS_VALUE"; \
		export CODEX_HOME="$(CODEX_HOME)"; \
		export CODEX_PROFILE_NAME="$(CODEX_ORCHESTRATOR_PROFILE)"; \
		export WVO_CAPABILITY="$(WVO_CAPABILITY)"; \
		export CODEX_AUTOPILOT_MODEL="$(CODEX_AUTOPILOT_MODEL)"; \
		export CODEX_AUTOPILOT_REASONING="$(CODEX_AUTOPILOT_REASONING)"; \
		export BASE_INSTRUCTIONS="$(BASE_INSTRUCTIONS)"; \
		export WVO_DEFAULT_PROVIDER=codex; \
		export WVO_AUTOPILOT_ENTRY="$(shell pwd)/$(WVO_MCP_ENTRY)"; \
		export MCP_AUTOPILOT_COUNT="$(MCP_AUTOPILOT_COUNT)"; \
		export WVO_AUTOPILOT_INTERACTIVE="$$AUTOPILOT_INTERACTIVE"; \
		export WVO_AUTOPILOT_SHOW_FEED="$${WVO_AUTOPILOT_SHOW_FEED:-1}"; \
		export WVO_AUTOPILOT_TMUX_FEED="$${WVO_AUTOPILOT_TMUX_FEED:-1}"; \
		export WVO_AUTOPILOT_FEED_TAIL="$${WVO_AUTOPILOT_FEED_TAIL:-25}"; \
		export WVO_AUTOPILOT_AGENT_REFRESH="$${WVO_AUTOPILOT_AGENT_REFRESH:-2}"; \
		export LOG_FILE="$$LOG_PATH"; \
		export WVO_AUTOPILOT_STREAM=1; \
		if [ "$$USE_TMUX" -eq 1 ]; then \
			tools/wvo_mcp/scripts/autopilot_tmux.sh; \
			AUTOPILOT_EXIT=$$?; \
		else \
			tail -n +1 -f "$$LOG_PATH" & \
			TAIL_PID=$$!; \
			FEED_VIEWER_PID=""; \
			cleanup_sidecars() { \
				kill $$TAIL_PID 2>/dev/null || true; \
				wait $$TAIL_PID 2>/dev/null || true; \
				if [ -n "$$FEED_VIEWER_PID" ]; then \
					kill $$FEED_VIEWER_PID 2>/dev/null || true; \
					wait $$FEED_VIEWER_PID 2>/dev/null || true; \
					FEED_VIEWER_PID=""; \
				fi; \
			}; \
			trap cleanup_sidecars EXIT; \
			if [ "$${WVO_AUTOPILOT_SHOW_FEED:-1}" = "1" ]; then \
				if command -v python >/dev/null 2>&1; then \
					PYTHONUNBUFFERED=1 python tools/wvo_mcp/scripts/activity_feed.py --mode feed --follow --tail "$${WVO_AUTOPILOT_FEED_TAIL:-25}" & \
					FEED_VIEWER_PID=$$!; \
					echo "📡 Activity feed streaming (PID=$$FEED_VIEWER_PID)"; \
				else \
					echo "ℹ️ Python not found; skipping activity feed viewer."; \
				fi; \
			fi; \
			tools/wvo_mcp/scripts/autopilot.sh & \
			AUTOPILOT_PID=$$!; \
			interrupt_run() { \
				echo ""; \
				echo "🛑 Stopping autopilot and cleaning up workers..."; \
				kill $$AUTOPILOT_PID 2>/dev/null || true; \
				pkill -P $$AUTOPILOT_PID 2>/dev/null || true; \
				pkill -f "tools/wvo_mcp/dist/index.js" 2>/dev/null || true; \
				wait $$AUTOPILOT_PID 2>/dev/null || true; \
				echo "✅ Cleanup complete."; \
				exit 130; \
			}; \
			trap interrupt_run INT TERM; \
			wait $$AUTOPILOT_PID; \
			AUTOPILOT_EXIT=$$?; \
			trap - EXIT; \
			cleanup_sidecars; \
		fi; \
		if command -v python >/dev/null 2>&1; then \
			echo ""; \
			echo "📋 Autopilot session summary:"; \
			python tools/wvo_mcp/scripts/activity_feed.py --mode summary --output "$(shell pwd)/state/autopilot_sessions.jsonl" || true; \
			echo "🗂  Summary archive: state/autopilot_sessions.jsonl"; \
		else \
			echo "ℹ️ Python not available; skipping summary."; \
		fi; \
		exit $$AUTOPILOT_EXIT; \
	)

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
