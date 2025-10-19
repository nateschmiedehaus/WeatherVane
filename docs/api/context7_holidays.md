# Context7 Holiday Calendar API

- **Base URL:** `https://context7.com/api/v3`
- **Endpoint:** `/publicholidays/{year}/{country}`
- **Method:** `GET`
- **Path Parameters:**
  - `year` – four-digit year (e.g., `2025`)
  - `country` – ISO 3166-1 alpha-2 country code (e.g., `US`)
- **Query Parameters (optional):**
  - `region` – ISO 3166-2 subdivision code for sub-national holidays
- **Response Fields:**
  - `date` (ISO date) – calendar date of the holiday
  - `localName` (string) – localized holiday name
  - `name` (string) – English holiday name
  - `countryCode` (string) – ISO country code
  - `fixed` (boolean) – `true` if the holiday occurs on the same date each year
  - `global` (boolean) – `true` if observed nationwide
  - `counties` (array[string], optional) – list of subdivision codes where observed
  - `launchYear` (integer, optional) – first year the holiday was registered
- **Use Cases:** feature calendar enrichment for demand forecasting and causal controls.
