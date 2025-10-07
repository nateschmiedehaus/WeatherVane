.PHONY: bootstrap api web worker model simulator format lint test migrate

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
	pytest apps tests
	npm test --prefix apps/web || true

migrate:
	env database_url=$${DATABASE_URL} alembic upgrade head
