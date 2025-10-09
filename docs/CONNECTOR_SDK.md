# Connector SDK Blueprint

## Goals
- Speed up onboarding of new marketing/commerce APIs without duplicating boilerplate.
- Provide a consistent runtime contract for auth, discovery, incremental sync, and telemetry.
- Allow connectors to register metadata (logos, scopes, capabilities) used by onboarding flows and harness tests.

## Deliverables
1. `shared/libs/connectors/sdk.py` – Protocols & dataclasses for manifests, secret fields, stream schemas, sync messages, and state updates.
2. `shared/libs/connectors/registry.py` – Loader for YAML/JSON manifests in `storage/metadata/connectors/`.
3. Cookie-cutter template (`make connector-skeleton provider=<slug>`) – generates module stub, fixture tests, and manifest (to be implemented).

## Connector Lifecycle
1. **Manifest discovery** – onboarding UI loads manifests via `list_manifests()` for gallery metadata.
2. **Credential validation** – `ConnectorPlugin.validate_credentials` tests secrets before persisting.
3. **Schema discovery** – `discover()` returns `StreamSchema` entries (name, keys, incremental cursor).
4. **Sync execution** – `sync()` yields `RecordMessage` and `StateMessage` events so ingest harness can stream into lake/state store.
5. **Shutdown** – `close()` releases resources (HTTP clients, drivers).

## Next Steps
- Write connector skeleton generator & update Shopify/Meta/Google connectors to implement `ConnectorPlugin`.
- Add onboarding UI that renders manifests and drives auth hand-offs.
- Capture telemetry: discovery latency, sync volume, credential failures, dedupe collisions.
