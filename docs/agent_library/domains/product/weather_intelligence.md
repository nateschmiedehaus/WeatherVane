# Weather Intelligence

How WeatherVane integrates, caches, and serves weather data.

---

## Overview

**Data Source**: Open-Meteo API (https://open-meteo.com)
**Rate Limit**: 10,000 requests/day (free tier)
**Caching Strategy**: 5-minute TTL to reduce API calls by ~80%
**Coverage**: Global (any latitude/longitude)

---

## API Integration

### Open-Meteo Client

**Location**: `shared/libs/connectors/weather.py`

**Features**:
- Fetch current weather by location
- 7-day forecast
- Historical data (past 90 days)
- Multiple weather variables (temp, humidity, precipitation, wind)

**Example**:
```python
from shared.libs.connectors.weather import fetch_weather_data

# Fetch current weather
weather = fetch_weather_data(
    location="40.7128,-74.0060",  # NYC (lat, lon)
    start_date="2025-10-23",
    end_date="2025-10-23"
)

# Returns:
# {
#   "temperature": 72.5,
#   "humidity": 65,
#   "precipitation": 0.0,
#   "wind_speed": 8.2,
#   "timestamp": "2025-10-23T12:00:00Z"
# }
```

---

## Weather Variables

### Core Variables

**Temperature** (`temperature_2m`):
- Unit: Celsius (convert to Fahrenheit: `F = C * 1.8 + 32`)
- Range: -50°C to 50°C (typical)
- Use: Heat-sensitive products (ice cream, AC units)

**Precipitation** (`precipitation`):
- Unit: mm per hour
- Range: 0 to 50mm (typical)
- Use: Rain gear, umbrellas, outdoor event planning

**Humidity** (`relative_humidity_2m`):
- Unit: Percentage (0-100%)
- Use: Dehumidifiers, skin care products

**Wind Speed** (`wind_speed_10m`):
- Unit: km/h
- Range: 0 to 100 km/h (typical)
- Use: Outdoor furniture, sporting goods

**Weather Code** (`weather_code`):
- Unit: WMO code (0-99)
- Codes: 0=clear, 1-3=partly cloudy, 51-55=drizzle, 61-65=rain, 71-75=snow
- Use: Categorical weather conditions

---

## Geocoding

**Problem**: Users provide city names ("New York"), need lat/lon for API

**Solution**: Geocoding service

### Implementation

**Location**: `shared/libs/geography/mapper.py`

**Service**: Nominatim (OpenStreetMap)

**Example**:
```python
from shared.libs.geography.mapper import geocode_location

coords = geocode_location("New York, NY")
# Returns: {"latitude": 40.7128, "longitude": -74.0060}
```

**Caching**: City → coords cached in database to avoid repeated lookups

---

## Caching Strategy

### Why Cache?

**Problem**: 10,000 requests/day limit
**Solution**: 5-minute cache reduces calls by 80%

**Math**:
- Without cache: 100 users × 10 requests/hour × 24 hours = 24,000 requests/day ❌
- With cache: 100 users × 2 requests/hour × 24 hours = 4,800 requests/day ✅

### Cache Implementation

**Location**: `shared/libs/caching/weather_cache.py` (to be created)

**Strategy**:
```python
class WeatherCache:
    def __init__(self, ttl_seconds=300):  # 5 minutes
        self.cache = {}
        self.ttl_seconds = ttl_seconds

    def get(self, location: str, date: str) -> Optional[dict]:
        key = f"{location}:{date}"
        cached = self.cache.get(key)

        if cached and not self.is_expired(cached):
            return cached['data']

        return None

    def set(self, location: str, date: str, data: dict):
        key = f"{location}:{date}"
        self.cache[key] = {
            'data': data,
            'timestamp': datetime.now()
        }

    def is_expired(self, cached: dict) -> bool:
        age = (datetime.now() - cached['timestamp']).total_seconds()
        return age > self.ttl_seconds
```

---

## Weather-Business Correlation

### Correlation Analysis

**Goal**: Identify which weather variables correlate with sales/ROAS

**Method**: Pearson correlation coefficient

**Example Results**:
```
Temperature vs Ice Cream Sales: r = 0.72 (strong positive)
Precipitation vs Umbrella Sales: r = 0.65 (strong positive)
Wind Speed vs Outdoor Furniture: r = -0.45 (moderate negative)
```

**Threshold**: |r| > 0.3 considered meaningful

**Validation**: See `scripts/validate_weather_correlations.py`

---

## Weather Constraints

**Feature**: Adjust ad budget based on weather forecasts

### Example Constraints

**Heat Wave Strategy** (Ice Cream Shop):
```yaml
constraint:
  name: "Heat Wave Boost"
  condition: "temperature > 85°F"
  action: "increase_budget"
  amount: "20%"
  channels: ["google_ads", "meta_ads"]
```

**Rain Strategy** (Rain Gear Retailer):
```yaml
constraint:
  name: "Rain Forecast Boost"
  condition: "precipitation_probability > 70%"
  action: "increase_budget"
  amount: "30%"
  channels: ["google_ads"]
  lead_time: "24 hours"  # Boost ads day before rain
```

**Wind Strategy** (Outdoor Furniture):
```yaml
constraint:
  name: "High Wind Reduction"
  condition: "wind_speed > 40 km/h"
  action: "decrease_budget"
  amount: "15%"
  channels: ["meta_ads"]
```

See [Weather-Responsive Constraints](/docs/WEATHER_RESPONSIVE_CONSTRAINTS.md)

---

## Data Quality

### Validation Checks

**Before using weather data**:

1. **Range checks**:
   ```python
   assert -50 <= temperature <= 50, "Temperature out of range"
   assert 0 <= humidity <= 100, "Humidity out of range"
   assert 0 <= precipitation <= 1000, "Precipitation out of range"
   ```

2. **Completeness checks**:
   ```python
   required_fields = ['temperature', 'humidity', 'precipitation']
   assert all(field in weather_data for field in required_fields)
   ```

3. **Freshness checks**:
   ```python
   data_age = datetime.now() - weather_data['timestamp']
   assert data_age < timedelta(hours=24), "Weather data too old"
   ```

See [Data Quality Standards](/docs/agent_library/domains/ml/data_quality.md)

---

## Weather Coverage Validation

### 90-Day Coverage Requirement

**Goal**: Ensure weather data available for past 90 days (for model training)

**Validation Script**: `scripts/validate_90day_coverage.py`

**Check**:
```python
def validate_coverage(location: str, days: int = 90):
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)

    missing_dates = []
    current = start_date

    while current <= end_date:
        weather = fetch_weather_data(location, current, current)
        if not weather:
            missing_dates.append(current)
        current += timedelta(days=1)

    coverage = (days - len(missing_dates)) / days
    assert coverage >= 0.95, f"Coverage {coverage:.1%} below 95%"

    return coverage
```

See [Weather Coverage Baseline](/docs/WEATHER_CONSTRAINTS_TECHNICAL_SUMMARY.md)

---

## MMM Integration

### Weather Features in Model

**Feature Engineering**: `shared/feature_store/feature_builder.py`

**Weather features**:
1. **Direct**: `temperature`, `precipitation`, `humidity`
2. **Lagged**: `temperature_lag_1d`, `temperature_lag_7d`
3. **Rolling**: `temperature_rolling_7d_mean`, `precipitation_rolling_7d_sum`
4. **Categorical**: `is_rainy` (precipitation > 2mm), `is_hot` (temp > 85°F)

**Join to sales data**:
```python
def join_weather_features(sales_df, weather_df):
    # Join on date and location
    merged = sales_df.merge(
        weather_df,
        on=['date', 'location'],
        how='left'
    )

    # Create derived features
    merged['is_hot'] = merged['temperature'] > 29.4  # 85°F in Celsius
    merged['is_rainy'] = merged['precipitation'] > 2.0

    return merged
```

**Model coefficients** show impact:
```
temperature → +2.3% ROAS per 1°C increase
precipitation → -1.8% ROAS per 1mm increase
```

See [Weather MMM Validation](/docs/WEATHER_MMM_VALIDATION.md)

---

## API Rate Limiting

### Staying Within Limits

**Free tier**: 10,000 requests/day

**Strategies**:
1. **Cache** (5-minute TTL) → 80% reduction
2. **Batch requests** (single API call for multiple dates)
3. **Lazy loading** (only fetch when needed)
4. **Prefetch** (overnight job for next day's forecasts)

**Monitoring**:
```python
class RateLimitMonitor:
    def __init__(self, daily_limit=10000):
        self.daily_limit = daily_limit
        self.requests_today = 0
        self.last_reset = datetime.now().date()

    def check_limit(self):
        # Reset counter at midnight
        if datetime.now().date() > self.last_reset:
            self.requests_today = 0
            self.last_reset = datetime.now().date()

        if self.requests_today >= self.daily_limit:
            raise RateLimitError("Daily API limit exceeded")

    def record_request(self):
        self.check_limit()
        self.requests_today += 1
```

---

## Upgrade Path

**If rate limits are hit**:

1. **Paid tier**: $49/month for 100,000 requests/day
2. **Alternative APIs**: WeatherAPI.com, Tomorrow.io
3. **Local caching**: Store historical data in database
4. **Reduce polling**: Increase cache TTL to 10-15 minutes

---

## Testing

### Unit Tests

**Location**: `tests/test_weather_integration.py`

**Test cases**:
- Fetch current weather (happy path)
- Handle API timeout (error handling)
- Handle invalid location (edge case)
- Cache hit (performance)
- Cache miss (integration)
- Rate limit enforcement (security)

### Integration Tests

**Validate**:
- End-to-end weather fetch → cache → model
- Geocoding → weather fetch
- Weather features → MMM prediction

---

## References

- [Open-Meteo API Docs](https://open-meteo.com/en/docs)
- [Weather Coverage Validation](/scripts/validate_90day_coverage.py)
- [Weather Correlation Analysis](/scripts/validate_weather_correlations.py)
- [Weather-Responsive Constraints](/docs/WEATHER_RESPONSIVE_CONSTRAINTS.md)

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
