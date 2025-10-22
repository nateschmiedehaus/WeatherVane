# WeatherVane Shopify App

Minimal OAuth + Admin API bridge that exchanges a tenant's offline token and stores it for WeatherVane ingestion. The app does **not** ship any UI – it simply proves the connection, registers the `APP_UNINSTALLED` webhook, and exposes helper endpoints you can call to verify data access.

## Features
- OAuth handshake requesting read scopes WeatherVane needs (`orders`, `products`, `inventory`, `customers`, `discounts`, `price_rules`) plus `write_metafields` for optional tag pushes.
- File-backed session storage (`storage/sessions.json`) holding both offline and online tokens.
- Offline tokens duplicated to `storage/tenants/<shop>.json` (and optionally POSTed to `WEATHERVANE_TOKEN_WEBHOOK_URL`) so the worker/control plane can ingest them automatically.
- `/api/orders/sample` route (guarded by Shopify session) for quick smoke checks inside the admin.
- `/internal/offline/export/:resource` helper (resources: `orders`, `products`, `customers`, `inventory_levels`, `price_rules`, `discount_codes` – the last requires `?price_rule_id=`) that replays the offline token server-to-server for WeatherVane ingestion.
- Automatic webhook registration that cleans up sessions when the merchant uninstalls the app.

## Prerequisites
- Node.js 20+ (WeatherVane repo pins `>=24.10.0` in the root `package.json`).
- Shopify Partner account and a development store for testing.
- Shopify CLI if you want to run `shopify app dev` alongside this app (optional but recommended).

## Setup
1. **Install dependencies**
   ```bash
   cd apps/shopify_app
   npm install
   ```
2. **Create the app in Partners**
   - Partner Dashboard → Apps → Create app → Custom app.
   - Copy the generated **Client ID** and **Client secret**.
   - Update `shopify.app.toml`:
     - Fill in `client_id`.
     - Replace `dev_store_url` with your development store.
     - When you know the deployed host, update `application_url`, webhook `uri`, and `auth.redirect_urls`.
3. **Configure environment variables**
   - Copy `.env.example` to `.env`.
   - Fill in `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, and (optionally) adjust `SHOPIFY_SCOPES`.
   - Set `SHOPIFY_APP_URL` to the public URL Shopify should reach (for local dev use the Shopify CLI tunnel, e.g. `https://<random>.ngrok.app`).
   - Optional: set `WEATHERVANE_TOKEN_STORE_PATH` (defaults to `storage/tenants`), `WEATHERVANE_TOKEN_WEBHOOK_URL` for automatic credential handoff, and tweak `EXPORT_MAX_RECORDS` if you want larger exports.
4. **Run the app**
   ```bash
   npm run dev
   ```
   Use `shopify app dev --path . --config default` if you want the CLI to manage tunnels.
5. **Install in the store**
   Visit `https://<store>.myshopify.com/admin/oauth/install?client_id=<client_id>&scope=...&redirect_uri=<callback>` or follow the CLI prompt. After install completes, `storage/sessions.json` will contain the offline token.

## WeatherVane Integration
- Point the worker to the stored credentials by updating the WeatherVane secrets (e.g. Vault or `.env`) with:
  - `SHOPIFY_SHOP_DOMAIN=<store>.myshopify.com`
  - `SHOPIFY_ACCESS_TOKEN=<offline_access_token>` (found in `storage/sessions.json`)
  - Optional refresh parameters if you enable OAuth refresh (`client_id`, `client_secret`, `refresh_token`).
- Offline tokens persist under `storage/tenants/<shop>.json`. Point your secret sync (or WeatherVane worker) at that path, or set `WEATHERVANE_TOKEN_WEBHOOK_URL` to push credentials to your control plane automatically after install.
- `GET /internal/offline/export/orders?shop=<store>.myshopify.com&limit=500&updated_at_min=2024-01-01T00:00:00Z` streams JSON for the requested resource (capped by `EXPORT_MAX_RECORDS`). For `discount_codes`, include `&price_rule_id=<id>` to scope the request.
- Once verified, you can delete `storage/sessions.json` from disk after copying the credential into your secret store; the tenant credential file remains until you rotate it.

## Deploying
- Build with `npm run build`; the compiled output lands in `dist`.
- Run the server in production with `npm start` (ensure `PORT`, `SHOPIFY_APP_URL`, and secrets are set).
- Update `shopify.app.toml` with your production domain and re-run `shopify app deploy` if you use the CLI to manage metadata.

## Housekeeping
- The repository ignores `storage/sessions.json` and `storage/tenants/*.json`; keep them out of version control.
- Rotate the access token per tenant policy and re-run the OAuth flow if Shopify revokes the credential.
- Check server logs (`LOG_LEVEL=debug`) for hook registration or API failures.
