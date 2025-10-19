# Context7 Logistics Status API

- **Base URL:** `https://context7.com/api/v1`
- **Endpoint:** `/logistics/status`
- **Method:** `GET`
- **Authentication:** `CONTEXT7_API_KEY` header
- **Query Parameters:**
  - `tenant_id` (string) – WeatherVane tenant identifier.
  - `start_date` (ISO date, optional)
  - `end_date` (ISO date, optional)
- **Response Fields:**
  - `tenant_id` (string)
  - `report_date` (ISO date)
  - `fulfillment_capacity` (float) – percent capacity available.
  - `backlog_orders` (integer)
  - `carrier_alerts` (array[object]) – each with `carrier`, `status`, `eta_delay_days`.
  - `staffing_level` (float) – staffing percentage vs plan.
  - `notes` (string, optional)
- **Use Cases:** capture fulfilment constraints and carrier delays for supply-aware modelling.
