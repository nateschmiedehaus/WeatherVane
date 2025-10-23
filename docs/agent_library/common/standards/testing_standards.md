# Universal Testing Standards

Every test suite MUST cover the **Essential 7** test dimensions before claiming a task complete.

---

## Essential 7 Test Dimensions

### 1. Happy Path
**What**: Core functionality works as expected with valid inputs

**Example**:
```typescript
test('calculates discount correctly for valid order', () => {
  const order = { total: 100, customerType: 'premium' };
  const discount = calculateDiscount(order);
  expect(discount).toBe(10); // 10% discount for premium
});
```

### 2. Edge Cases
**What**: Boundary conditions are handled correctly

**Examples**:
- Empty inputs
- Zero values
- Maximum values
- Single-item collections
- Exact boundary values

```typescript
test('handles zero order total', () => {
  const order = { total: 0, customerType: 'premium' };
  const discount = calculateDiscount(order);
  expect(discount).toBe(0);
});

test('handles maximum order value', () => {
  const order = { total: Number.MAX_SAFE_INTEGER, customerType: 'premium' };
  expect(() => calculateDiscount(order)).not.toThrow();
});
```

### 3. Error Handling
**What**: Failures are gracefully managed with clear error messages

**Examples**:
- Invalid inputs
- Missing required fields
- Type mismatches
- Network failures
- Timeout scenarios

```typescript
test('throws clear error for invalid customer type', () => {
  const order = { total: 100, customerType: 'unknown' };
  expect(() => calculateDiscount(order)).toThrow(
    'Invalid customer type: unknown'
  );
});

test('handles network timeout gracefully', async () => {
  const fetcher = new DataFetcher({ timeout: 100 });
  await expect(fetcher.fetch()).rejects.toThrow('Request timeout');
});
```

### 4. Integration
**What**: Components work together correctly

**Examples**:
- Database interactions
- API calls
- File I/O
- Message queues
- Third-party services

```typescript
test('saves order to database and retrieves it', async () => {
  const order = { id: 1, total: 100 };
  await orderService.save(order);

  const retrieved = await orderService.findById(1);
  expect(retrieved).toEqual(order);
});
```

### 5. Performance
**What**: Meets latency/throughput requirements

**Examples**:
- Response time <500ms
- Memory usage bounded
- CPU usage reasonable
- Handles 100+ items
- No performance regression

```typescript
test('processes 1000 orders in under 1 second', () => {
  const orders = generateOrders(1000);
  const start = performance.now();

  processOrders(orders);

  const duration = performance.now() - start;
  expect(duration).toBeLessThan(1000);
});

test('memory usage stays under 100MB', () => {
  const initialMemory = process.memoryUsage().heapUsed;

  processLargeDataset();

  const finalMemory = process.memoryUsage().heapUsed;
  const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;
  expect(memoryIncrease).toBeLessThan(100);
});
```

### 6. Security
**What**: No vulnerabilities introduced

**Examples**:
- Input validation/sanitization
- SQL injection prevention
- XSS prevention
- Authentication checks
- Authorization checks
- No secrets leaked

```typescript
test('sanitizes user input to prevent XSS', () => {
  const maliciousInput = '<script>alert("XSS")</script>';
  const sanitized = sanitizeInput(maliciousInput);
  expect(sanitized).not.toContain('<script>');
});

test('requires authentication for protected endpoints', async () => {
  const response = await request(app).get('/api/admin/users');
  expect(response.status).toBe(401);
});
```

### 7. Regression
**What**: Previous bugs don't return

**Practice**:
- Every bug fix gets a test
- Tests named after bug/ticket: `test_bug_1234`
- Test reproduces original bug (when possible)

```typescript
test('bug #1234: handles null values in weather data', () => {
  const weatherData = { temperature: null, humidity: 65 };
  expect(() => processWeather(weatherData)).not.toThrow();
});
```

---

## Test Quality Checklist

Before marking ANY task done:

- [ ] **Happy path** tested
- [ ] **Edge cases** covered (empty, zero, max)
- [ ] **Error handling** tested (invalid inputs, failures)
- [ ] **Integration** tested (if applicable)
- [ ] **Performance** verified (if applicable)
- [ ] **Security** validated (input sanitization, auth)
- [ ] **Regression** tests added (for bug fixes)
- [ ] **Unit tests**: 80%+ coverage
- [ ] **Tests are deterministic** (no flakiness)
- [ ] **Tests run fast** (<5 sec for unit, <60 sec for integration)
- [ ] **Meaningful assertions** (not just "doesn't crash")
- [ ] **Clear test names** describe what they verify

---

## Test Organization

### Naming Convention

**Test files**: `*.test.ts` or `*.spec.ts`
```
src/weather/data-fetcher.ts
src/weather/data-fetcher.test.ts
```

**Test names**: Describe behavior, not implementation
```typescript
// ❌ Bad: Implementation-focused
test('calls fetchData method');

// ✅ Good: Behavior-focused
test('retrieves weather data for valid location');
test('throws error when location is invalid');
test('caches results for 5 minutes');
```

### Test Structure (AAA Pattern)

**Arrange → Act → Assert**

```typescript
test('calculates total with tax', () => {
  // Arrange: Set up test data and dependencies
  const order = { subtotal: 100, taxRate: 0.1 };

  // Act: Execute the behavior being tested
  const total = calculateTotal(order);

  // Assert: Verify the result
  expect(total).toBe(110);
});
```

---

## Coverage Requirements

### Minimum Coverage

**Unit tests**: 80%+ line coverage
**Integration tests**: Critical paths covered
**Overall**: 70%+ combined coverage

**Run coverage**:
```bash
npm test -- --coverage
```

### What to Test

**Must test**:
- All public functions/methods
- All exported functions
- All API endpoints
- All business logic
- All error paths

**Can skip**:
- Simple getters/setters
- Type definitions
- Constants
- Third-party library wrappers (if thin)

---

## Test Types

### Unit Tests
**Scope**: Single function/class in isolation
**Speed**: <100ms per test
**Mocking**: Mock all dependencies

```typescript
test('validates email format', () => {
  expect(isValidEmail('user@example.com')).toBe(true);
  expect(isValidEmail('invalid')).toBe(false);
});
```

### Integration Tests
**Scope**: Multiple components working together
**Speed**: <5 seconds per test
**Mocking**: Mock external services only (DB, API)

```typescript
test('creates user and sends welcome email', async () => {
  const emailService = mockEmailService();
  const userService = new UserService(db, emailService);

  await userService.createUser({ email: 'user@example.com' });

  expect(emailService.send).toHaveBeenCalledWith(
    expect.objectContaining({ subject: 'Welcome!' })
  );
});
```

### End-to-End Tests
**Scope**: Full user workflow
**Speed**: <60 seconds per test
**Mocking**: No mocking (real services)

```typescript
test('user can complete checkout flow', async () => {
  await browser.goto('/products');
  await browser.click('[data-product="widget"]');
  await browser.click('[data-action="add-to-cart"]');
  await browser.click('[data-action="checkout"]');
  await browser.fill('[name="email"]', 'user@example.com');
  await browser.click('[data-action="complete-order"]');

  await expect(browser.locator('.success-message')).toBeVisible();
});
```

---

## Flakiness Prevention

**No flaky tests allowed**. If a test is flaky, it must be fixed immediately.

### Common Causes

1. **Timing issues**
   - ❌ `setTimeout()` with arbitrary delays
   - ✅ Use `await` or test framework's wait utilities

2. **Non-deterministic data**
   - ❌ `Math.random()`, `Date.now()` without mocking
   - ✅ Seed random generators, mock time

3. **Shared state**
   - ❌ Tests depend on order of execution
   - ✅ Each test is independent, clean up after

4. **External dependencies**
   - ❌ Tests call real APIs without mocking
   - ✅ Mock all external services

### Fixing Flaky Tests

```typescript
// ❌ Bad: Flaky due to timing
test('data loads eventually', async () => {
  fetchData();
  await new Promise(resolve => setTimeout(resolve, 1000));
  expect(data).toBeDefined();
});

// ✅ Good: Wait for specific condition
test('data loads eventually', async () => {
  fetchData();
  await waitFor(() => expect(data).toBeDefined(), { timeout: 5000 });
});
```

---

## Mocking Guidelines

### When to Mock

**Always mock**:
- External APIs
- Database calls (in unit tests)
- File system operations
- Network requests
- Time-dependent code (`Date.now()`)
- Random number generators

**Don't mock**:
- Internal helper functions (in unit tests)
- Simple utilities
- Type definitions

### How to Mock

**Use test framework's mocking**:

```typescript
// Jest example
import { fetchWeatherData } from './api';
jest.mock('./api');

test('handles API failure', async () => {
  (fetchWeatherData as jest.Mock).mockRejectedValue(new Error('API down'));

  await expect(processWeather()).rejects.toThrow('API down');
});
```

**Mock time**:
```typescript
import { jest } from '@jest/globals';

test('expires cache after 5 minutes', () => {
  jest.useFakeTimers();
  const cache = new Cache({ ttl: 5 * 60 * 1000 });

  cache.set('key', 'value');
  expect(cache.get('key')).toBe('value');

  jest.advanceTimersByTime(5 * 60 * 1000);
  expect(cache.get('key')).toBeUndefined();

  jest.useRealTimers();
});
```

---

## Verification Script

Use the validation script to check test quality:

```bash
bash scripts/validate_test_quality.sh path/to/test.ts
```

**Checks**:
- Coverage % (must be ≥80%)
- Essential 7 dimension coverage
- Flakiness (runs tests 10 times)
- Speed (unit tests <5 sec, integration <60 sec)
- Assertion quality (no empty tests)

---

## Test Quality Anti-Patterns

### ❌ Testing Implementation Instead of Behavior

```typescript
// Bad: Tests internal implementation
test('calls _fetchData method', () => {
  const service = new WeatherService();
  const spy = jest.spyOn(service, '_fetchData');
  service.getWeather('NYC');
  expect(spy).toHaveBeenCalled();
});

// Good: Tests behavior
test('retrieves weather data for valid location', async () => {
  const service = new WeatherService();
  const weather = await service.getWeather('NYC');
  expect(weather.temperature).toBeGreaterThan(-100);
});
```

### ❌ Meaningless Assertions

```typescript
// Bad: Just checking it doesn't crash
test('processes order', () => {
  processOrder(order);
  expect(true).toBe(true);
});

// Good: Verifies actual behavior
test('processes order and updates status', () => {
  const order = { id: 1, status: 'pending' };
  processOrder(order);
  expect(order.status).toBe('completed');
});
```

### ❌ Overly Coupled to Implementation

```typescript
// Bad: Breaks if implementation changes
test('discount calculation uses formula', () => {
  expect(calculateDiscount(100)).toBe(100 * 0.1);
});

// Good: Tests contract, not formula
test('applies 10% discount to $100 order', () => {
  expect(calculateDiscount(100)).toBe(10);
});
```

---

## Key References

- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Trophy](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications)

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
