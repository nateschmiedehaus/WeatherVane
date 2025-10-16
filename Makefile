.PHONY: bootstrap api web worker model simulator format lint test migrate smoke-context smoke-pipeline export-observability check-secrets clean-metrics mcp-build mcp-register mcp-run mcp-auto

CODEX_HOME ?= $(shell pwd)/.codex
CODEX_ORCHESTRATOR_PROFILE ?= weathervane_orchestrator
WVO_CAPABILITY ?= high
CODEX_AUTOPILOT_MODEL ?= gpt-5-codex
CODEX_AUTOPILOT_REASONING ?= auto
BASE_INSTRUCTIONS ?= $(shell pwd)/docs/wvo_prompt.md
CONFIGURE_CODEX_PROFILE = python tools/wvo_mcp/scripts/configure_codex_profile.py
WVO_MCP_ENTRY ?= tools/wvo_mcp/dist/index.js

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
	CODEX_HOME=$(CODEX_HOME) codex mcp add weathervane -- node $(WVO_MCP_ENTRY) --workspace $(shell pwd)

mcp-run:
	CODEX_HOME=$(CODEX_HOME) node $(WVO_MCP_ENTRY) --workspace $(shell pwd)

mcp-auto: mcp-build mcp-register
	CODEX_HOME=$(CODEX_HOME) $(CONFIGURE_CODEX_PROFILE) $(CODEX_HOME)/config.toml $(CODEX_ORCHESTRATOR_PROFILE) $(shell pwd) $(BASE_INSTRUCTIONS) --model $(CODEX_AUTOPILOT_MODEL) --sandbox danger-full-access --ask-for-approval never --reasoning $(CODEX_AUTOPILOT_REASONING)
	CODEX_HOME=$(CODEX_HOME) CODEX_PROFILE=$(WVO_CAPABILITY) WVO_DEFAULT_PROVIDER=codex codex session --profile $(CODEX_ORCHESTRATOR_PROFILE)
.PHONY: mcp-autopilot
mcp-autopilot: mcp-register
	CODEX_HOME=$(CODEX_HOME) CODEX_PROFILE_NAME=$(CODEX_ORCHESTRATOR_PROFILE) WVO_CAPABILITY=$(WVO_CAPABILITY) CODEX_AUTOPILOT_MODEL=$(CODEX_AUTOPILOT_MODEL) CODEX_AUTOPILOT_REASONING=$(CODEX_AUTOPILOT_REASONING) BASE_INSTRUCTIONS=$(BASE_INSTRUCTIONS) WVO_DEFAULT_PROVIDER=codex WVO_AUTOPILOT_ENTRY=$(shell pwd)/$(WVO_MCP_ENTRY) LOG_FILE=/tmp/wvo_autopilot.log tools/wvo_mcp/scripts/autopilot.sh
