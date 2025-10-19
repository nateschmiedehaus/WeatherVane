# Google Analytics Data API

- **Base URL:** `https://analyticsdata.googleapis.com`
- **Endpoint:** `/v1beta/properties/{property}:runReport`
- **Method:** `POST`
- **Authentication:** Google OAuth 2.0 (service account or user credentials with Analytics Data scope).
- **Request Body:**
  - `metrics` (array[object]) – e.g., `{ "name": "sessions" }`, `{ "name": "totalUsers" }`.
  - `dimensions` (array[object]) – e.g., `{ "name": "date" }`, `{ "name": "sessionDefaultChannelGroup" }`.
  - `dateRanges` (array[object]) – e.g., `{ "startDate": "2024-01-01", "endDate": "2024-01-31" }`.
  - Optional filters, orderBys, offset, limit, keepEmptyRows.
- **Response Fields:**
  - `dimensionHeaders`, `metricHeaders` – header metadata.
  - `rows[]` – each row with `dimensionValues[]` and `metricValues[]`.
  - `totals[]`, `maximums[]`, `minimums[]`, `rowCount`.
- **Use Cases:** ingest sessions, bounce, and funnel conversion metrics for owned digital channels.
