# Good Example: API Integration with Proper Verification

**Task**: Implement weather API client for forecast data

**Verification Level Achieved**: Level 3 (Integration Testing)

---

## What Was Implemented

Weather API client with rate limiting, error handling, and retry logic.

```typescript
class WeatherAPIClient {
  async getForecast(lat: number, lon: number): Promise<ForecastData> {
    // Implementation with rate limiting, retries, error handling
  }
}
```

---

## Verification Steps Taken

### Level 1: Compilation ✅
```bash
npm run build
# Output: ✓ Built successfully, 0 errors
```

### Level 2: Smoke Testing ✅
```typescript
// weather_api_client.test.ts
describe('WeatherAPIClient', () => {
  it('parses forecast response correctly', async () => {
    const mockResponse = {
      temperature: 72,
      humidity: 65,
      conditions: 'sunny'
    };

    // Test with mocked API response
    const client = new WeatherAPIClient({ apiKey: 'test-key' });
    mockFetch(mockResponse);

    const forecast = await client.getForecast(37.7749, -122.4194);

    expect(forecast.temperature).toBe(72);
    expect(forecast.humidity).toBe(65);
    expect(forecast.conditions).toBe('sunny');
  });

  it('handles API errors gracefully', async () => {
    const client = new WeatherAPIClient({ apiKey: 'test-key' });
    mockFetchError(503, 'Service Unavailable');

    await expect(client.getForecast(37.7749, -122.4194))
      .rejects
      .toThrow('Weather API unavailable');
  });

  it('respects rate limits', async () => {
    const client = new WeatherAPIClient({
      apiKey: 'test-key',
      maxRequestsPerSecond: 2
    });

    const start = Date.now();
    await Promise.all([
      client.getForecast(37.7749, -122.4194),
      client.getForecast(40.7128, -74.0060),
      client.getForecast(41.8781, -87.6298)
    ]);
    const elapsed = Date.now() - start;

    // Should take >1000ms due to rate limiting (3 requests / 2 per second)
    expect(elapsed).toBeGreaterThan(1000);
  });
});
```

**Tests Run**: `npm test -- weather_api_client.test.ts`
```
✓ parses forecast response correctly
✓ handles API errors gracefully
✓ respects rate limits

3 passing (1.2s)
```

### Level 3: Integration Testing ✅
```bash
# Test with REAL Weather API
export WEATHER_API_KEY=<actual-api-key>
npm run test:integration -- weather_api_client.integration.test.ts
```

```typescript
// weather_api_client.integration.test.ts
describe('WeatherAPIClient - Real API', () => {
  it('fetches real forecast data', async () => {
    const client = new WeatherAPIClient({
      apiKey: process.env.WEATHER_API_KEY
    });

    // Real API call
    const forecast = await client.getForecast(37.7749, -122.4194); // SF

    // Validate structure
    expect(forecast).toHaveProperty('temperature');
    expect(forecast).toHaveProperty('humidity');
    expect(forecast).toHaveProperty('conditions');

    // Validate types
    expect(typeof forecast.temperature).toBe('number');
    expect(typeof forecast.humidity).toBe('number');
    expect(typeof forecast.conditions).toBe('string');

    // Validate reasonable values
    expect(forecast.temperature).toBeGreaterThan(-50);
    expect(forecast.temperature).toBeLessThan(150);
    expect(forecast.humidity).toBeGreaterThanOrEqual(0);
    expect(forecast.humidity).toBeLessThanOrEqual(100);
  });

  it('handles real API rate limiting', async () => {
    const client = new WeatherAPIClient({ apiKey: process.env.WEATHER_API_KEY });

    // Make rapid requests
    const requests = Array(10).fill(null).map(() =>
      client.getForecast(37.7749, -122.4194)
    );

    // Should not throw rate limit errors (internal handling works)
    await expect(Promise.all(requests)).resolves.not.toThrow();
  });
});
```

**Output**:
```
✓ fetches real forecast data (1.5s)
✓ handles real API rate limiting (8.2s)

2 passing (9.7s)
```

---

## Documentation of Verification Levels

### What Was Tested (Level 2 ✅)
- Response parsing with known data structures
- Error handling with mocked API failures
- Rate limiting logic with mocked timers
- Edge cases: missing fields, malformed data

### What Was Tested (Level 3 ✅)
- Real API calls with actual Weather API
- Actual rate limiting behavior
- Real error responses from API
- Data structure from production API

### What Was NOT Tested (Level 4 ⏳)
- Production load (100+ requests/sec)
- Long-term reliability (30-day monitoring)
- User-facing integration (UI displaying forecasts)
- Cost tracking in production

---

## Why This is Good

### Honest Verification
- Explicitly states what IS and IS NOT tested
- Achieved Level 3 (integration) before claiming complete
- Documented both smoke tests (Level 2) AND integration tests (Level 3)

### Comprehensive Testing
- Tests with mocked data (Level 2) prove logic works
- Tests with real API (Level 3) prove integration works
- Edge cases covered (errors, rate limits, malformed data)

### Clear Evidence
- Test execution logs shown
- Test names describe what's being validated
- Assertions are meaningful (not just "no errors")

### Realistic Expectations
- Level 4 explicitly marked as NOT tested
- Production load/reliability deferred to MONITOR phase
- No claims beyond what was actually validated

---

## Verification Level Mapping

| Level | Status | Evidence |
|-------|--------|----------|
| Level 1: Compilation | ✅ PASS | Build succeeds, 0 errors |
| Level 2: Smoke Testing | ✅ PASS | 3 unit tests, all passing |
| Level 3: Integration | ✅ PASS | 2 integration tests with real API |
| Level 4: Production | ⏳ MONITOR | Deferred to production monitoring |

---

## Key Takeaway

**Level 3 requires real integration testing** - not just "it compiles" or "unit tests pass", but actual API calls with real credentials proving the system works end-to-end.

This example demonstrates proper progression through verification levels with clear evidence at each stage.
