# Communication Standards

Clear communication accelerates development and prevents misunderstandings.

---

## Logging Standards

### Log Levels

Use appropriate log levels:

- **ERROR**: Something went wrong, requires investigation
- **WARN**: Something unexpected, but recoverable
- **INFO**: Normal operations, significant events
- **DEBUG**: Detailed diagnostic information
- **TRACE**: Very detailed debugging (usually disabled in production)

### Log Format

**Structure logs as JSON** for easy parsing:

```typescript
import { logInfo, logError, logWarn } from '../telemetry/logger.js';

// ✅ Good: Structured logging
logInfo('Weather data fetched successfully', {
  location: 'NYC',
  temperature: 72,
  timestamp: new Date().toISOString(),
  duration_ms: 145
});

logError('Failed to fetch weather data', {
  location: 'NYC',
  error: error.message,
  stack: error.stack,
  retryable: true
});
```

### What to Log

**DO log**:
- Request/response for API calls
- Errors and warnings
- State transitions
- Performance metrics
- Security events (auth, permissions)
- Business-critical operations

**DON'T log**:
- Secrets (passwords, tokens, API keys)
- PII (personally identifiable information) without redaction
- Large payloads (>1KB, truncate or hash)
- Excessive debug logs in production

### Log Redaction

**Always redact sensitive data**:

```typescript
function sanitizeForLog(data: any): any {
  const sanitized = { ...data };

  // Redact secrets
  const secretKeys = ['password', 'apiKey', 'token', 'secret', 'authorization'];
  for (const key of secretKeys) {
    if (key in sanitized) {
      sanitized[key] = '[REDACTED]';
    }
  }

  // Redact PII
  const piiKeys = ['email', 'phone', 'ssn', 'creditCard'];
  for (const key of piiKeys) {
    if (key in sanitized) {
      sanitized[key] = hashForLog(sanitized[key]);
    }
  }

  return sanitized;
}

function hashForLog(value: string): string {
  const hash = crypto.createHash('sha256').update(value).digest('hex');
  return hash.substring(0, 8); // First 8 chars for correlation
}

// Usage:
logInfo('User created', sanitizeForLog(userData));
```

---

## Commit Message Standards

### Format

Follow **Conventional Commits**:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type** (required):
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `refactor`: Code restructuring (no behavior change)
- `test`: Add/update tests
- `chore`: Maintenance (dependencies, build, etc.)
- `perf`: Performance improvement
- `ci`: CI/CD changes

**Scope** (optional): Component/module affected
**Subject** (required): Short description (<72 chars)
**Body** (optional): Detailed explanation
**Footer** (optional): Breaking changes, issue references

### Examples

**Simple commit**:
```
feat(weather): Add Open-Meteo API integration
```

**With body**:
```
fix(auth): Handle token expiration gracefully

Previously, expired tokens caused uncaught exceptions.
Now, we catch the error and redirect to login.

Fixes #1234
```

**Breaking change**:
```
refactor(api)!: Change weather endpoint response format

BREAKING CHANGE: Weather API now returns temperature in Celsius
instead of Fahrenheit. Update client code accordingly.

Migration guide: multiply temperature by 1.8 and add 32 to convert.
```

### What Makes a Good Commit Message

✅ **Good**:
- Clear, concise subject
- Explains WHY, not just WHAT
- References related issues/tickets
- Describes impact

❌ **Bad**:
- Vague: "updates", "fixes stuff", "wip"
- Too generic: "bug fix"
- Missing context
- No issue reference

---

## Documentation Standards

### Code Comments

**Use comments for WHY, not WHAT**:

❌ **Bad** (explains what, which is obvious):
```typescript
// Increment counter by 1
counter += 1;

// Loop through users
for (const user of users) {
```

✅ **Good** (explains why):
```typescript
// Retry up to 3 times to handle transient network failures
for (let attempt = 0; attempt < 3; attempt++) {

// Use UTC to avoid timezone issues when comparing dates
const nowUtc = new Date().toISOString();
```

### Function Documentation

**Document all public functions**:

```typescript
/**
 * Calculate discounted price for an order
 *
 * Applies tiered discounts based on order total:
 * - $0-$99: No discount
 * - $100-$499: 10% discount
 * - $500+: 15% discount
 *
 * @param order - Order to calculate discount for
 * @returns Discounted price in dollars
 * @throws {ValidationError} If order total is negative
 *
 * @example
 * const order = { total: 150, items: [...] };
 * const discounted = calculateDiscount(order);
 * // Returns: 135 (10% off $150)
 */
function calculateDiscount(order: Order): number {
  if (order.total < 0) {
    throw new ValidationError('Order total cannot be negative');
  }

  if (order.total >= 500) return order.total * 0.85;
  if (order.total >= 100) return order.total * 0.90;
  return order.total;
}
```

### README Files

**Every module/package needs a README** with:

1. **Purpose**: What does this do?
2. **Installation**: How to set it up
3. **Usage**: How to use it (with examples)
4. **API**: Key functions/classes
5. **Configuration**: Environment variables, config files
6. **Testing**: How to run tests
7. **Contributing**: How to contribute (if applicable)

**Example README structure**:

```markdown
# Weather Data Fetcher

Fetches weather data from Open-Meteo API with retry logic and caching.

## Installation

npm install @weathervane/weather-fetcher

## Usage

import { WeatherFetcher } from '@weathervane/weather-fetcher';

const fetcher = new WeatherFetcher({
  apiKey: process.env.WEATHER_API_KEY,
  cacheDir: './cache'
});

const weather = await fetcher.fetch('NYC');
console.log(weather.temperature); // 72


## Configuration

- `WEATHER_API_KEY`: Open-Meteo API key (required)
- `CACHE_TTL_MS`: Cache TTL in milliseconds (default: 300000)

## Testing

npm test

## License

MIT
```

---

## Error Messages

### User-Facing Errors

**Be clear, actionable, and helpful**:

❌ **Bad**:
```
Error: 500
Error: null reference
Error: Invalid input
```

✅ **Good**:
```
Unable to load weather data. Please check your internet connection and try again.

Invalid email format. Please enter a valid email address (e.g., user@example.com).

Your session has expired. Please log in again to continue.
```

### Developer-Facing Errors

**Include context and debugging info**:

❌ **Bad**:
```typescript
throw new Error('Failed');
```

✅ **Good**:
```typescript
throw new WeatherDataError(
  `Failed to fetch weather data for location: ${location}`,
  'FETCH_FAILED',
  {
    location,
    statusCode: response.status,
    retryable: true,
    endpoint: response.url
  }
);
```

---

## Telemetry & Metrics

### What to Track

**Operational Metrics**:
- Request rate (requests/second)
- Response time (p50, p95, p99)
- Error rate (errors/total requests)
- Resource usage (CPU, memory)

**Business Metrics**:
- Task completion rate
- User actions (signups, orders, etc.)
- Feature usage
- Conversion funnels

### How to Track

```typescript
import { recordMetric } from '../telemetry/metrics.js';

async function fetchWeatherData(location: string): Promise<WeatherData> {
  const startTime = performance.now();

  try {
    const data = await api.get(`/weather?location=${location}`);

    recordMetric('weather_fetch_duration_ms', performance.now() - startTime, {
      location,
      status: 'success'
    });

    return data;
  } catch (error) {
    recordMetric('weather_fetch_duration_ms', performance.now() - startTime, {
      location,
      status: 'error'
    });

    recordMetric('weather_fetch_error_count', 1, {
      location,
      errorType: error.name
    });

    throw error;
  }
}
```

---

## Communication Channels

### When to Use Each Channel

**Context file** (`state/context.md`):
- Strategic decisions
- Blockers affecting multiple tasks
- Important learnings
- Roadmap changes

**Task comments** (in roadmap):
- Task-specific updates
- Progress notes
- Blockers for that task only

**Logs**:
- Operational events
- Errors and warnings
- Performance metrics

**Escalation**:
- Critical issues requiring immediate attention
- Security concerns
- Stuck >30 minutes

### Context File Guidelines

**Keep it concise** (<1000 words total):
```markdown
# Current Focus
Working on T1.2.3: Weather API integration

# Decisions
- Using Open-Meteo API (free tier, good docs)
- Caching data for 5 minutes to reduce API calls

# Blockers
- Waiting for API key from stakeholder (escalated to Atlas)

# Learnings
- Open-Meteo has rate limits: 10,000 requests/day
- Need to implement retry logic for transient failures
```

---

## Escalation Protocol

### When to Escalate

**Timing**:
- **10 minutes**: Log blocker in context
- **30 minutes**: Escalate to orchestrator
- **2 hours**: Critical escalation to Director Dana

**What to Include**:
1. **Problem**: What's blocking you?
2. **Context**: What have you tried?
3. **Impact**: What's at risk?
4. **Request**: What do you need?

### Escalation Template

```markdown
## Blocker: Cannot connect to weather API

**Task**: T1.2.3 - Weather API integration
**Status**: Blocked for 25 minutes

**Problem**:
Weather API returns 401 Unauthorized despite using correct API key.

**What I tried**:
1. Verified API key in environment variables ✓
2. Tested with curl - same error ✓
3. Checked API docs - key format looks correct ✓
4. Reviewed recent changes - no changes to auth logic ✓

**Impact**:
- Blocks T1.2.3 completion
- Blocks T1.2.4 (depends on API integration)
- Affects milestone M1 timeline

**Request**:
Need help diagnosing API authentication issue. Possibly need new API key or different auth method.

**Escalating to**: Atlas
```

---

## Team Communication

### With Workers

**Clear directives**:
- Specific tasks with exit criteria
- Context for complex work
- Available for questions

**Example**:
```
Task: Implement weather data caching

Exit criteria:
- Cache stores data for 5 minutes
- Cache key includes location
- Stale data is refreshed automatically
- Tests cover cache hit/miss scenarios

Context:
We're hitting rate limits on the weather API. Caching will reduce
calls by ~80% based on typical usage patterns.

Questions? Ask in #dev-weather or tag @atlas
```

### With Atlas/Dana

**Executive-ready**:
- Concise (1-2 paragraphs max)
- High-signal (skip implementation details)
- Risk-aware (surface blockers with mitigation)

**Example**:
```
Weather API integration is 80% complete. Remaining work: error handling
and caching (estimated 2 hours).

Risk: API rate limits (10K/day) may be insufficient for production.
Mitigation: Implementing 5-minute cache (reduces calls by 80%). If
still insufficient, we can upgrade to paid tier ($49/month for 100K/day).

No blockers. On track for M1 deadline.
```

---

## References

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Commit Messages](https://gist.github.com/joshbuchea/6f47e86d2510bce28f8e7f42ae84c716)
- [Writing Good Commit Messages](https://chris.beams.io/posts/git-commit/)

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
