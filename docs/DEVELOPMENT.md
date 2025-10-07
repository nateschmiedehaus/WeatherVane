# WeatherVane Developer Guide

## Prerequisites
- Python 3.11+
- Node.js 18+
- Docker + Docker Compose (optional but recommended)
- Make

## Initial Setup
```bash
cp .env.example .env
make bootstrap
```

This installs Python dependencies in editable mode and installs web dependencies under `apps/web`.

## Running Services Locally
- **API:** `make api` (runs on http://localhost:8000)
- **Web:** `make web` (Next.js dev server on http://localhost:3000)
- **Worker:** `make worker`
- **Model stub:** `make model`

Use `docker-compose up` to start Postgres plus containerised API/web/worker stacks. Source code is mounted for hot reloads.

## Testing & Linting
```bash
make lint
make test
```

These run Ruff/ESLint and Pytest/Next.js tests respectively. Formatting helper:
```bash
make format
```

## Project Layout
- `apps/api`: FastAPI app (routers, config, dependencies)
- `apps/web`: Next.js marketing + app shell
- `apps/worker`: Prefect flows and job runners
- `apps/model`: Model training entrypoints
- `apps/simulator`: Backtest/simulation utilities
- `shared/schemas`: Pydantic models shared across services
- `shared/libs`: Connector stubs, logging utilities, etc.
- `infra`: Infrastructure-as-code (Terraform/Kubernetes placeholders)
- `docker`: Container images for API and web

## Environment Variables
Update `.env` from the example with real credentials for Shopify, Meta Ads, Google Ads, and Klaviyo when wiring connectors. The API reads `CORS_ORIGINS`, `DATABASE_URL`, `LOG_LEVEL`, etc.

## Next Steps Checklist
- Implement real connector clients under `shared/libs/connectors`.
- Add persistence layer (SQLAlchemy models, Alembic migrations).
- Flesh out worker flows for ingestion, modeling, and allocation.
- Connect frontend pages to live API endpoints.
- Expand end-to-end tests and CI pipeline.

