.PHONY: bootstrap api web worker model simulator format lint test migrate smoke-context smoke-pipeline export-observability check-secrets

bootstrap:
	pip install --upgrade pip
	pip install -r requirements.txt || true
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
	ruff apps shared
	npm run lint --prefix apps/web || true

test:
	PYTHONPATH=.deps:. pytest apps tests
	npm test --prefix apps/web || true

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
