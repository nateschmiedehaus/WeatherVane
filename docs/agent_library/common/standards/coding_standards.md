# Coding Standards

Consistent coding style improves readability, maintainability, and reduces bugs.

---

## TypeScript

### Naming Conventions

**Classes**: `PascalCase`
```typescript
class WeatherDataFetcher { }
class UserAuthenticationService { }
```

**Functions & Methods**: `camelCase`
```typescript
function calculateDiscount() { }
async function fetchWeatherData() { }
```

**Constants**: `UPPER_SNAKE_CASE`
```typescript
const MAX_RETRY_ATTEMPTS = 3;
const API_BASE_URL = 'https://api.example.com';
```

**Interfaces & Types**: `PascalCase`
```typescript
interface UserProfile { }
type ApiResponse = { };
```

**Private Properties**: prefix with `_` (optional but recommended)
```typescript
class Foo {
  private _cache: Map<string, any>;
  private _apiKey: string;
}
```

**Files**: `snake_case.ts` or `kebab-case.ts` (prefer kebab)
```
weather-data-fetcher.ts
user-authentication-service.ts
```

---

### File Structure

```typescript
// File: src/weather/data-fetcher.ts

// 1. Imports (grouped: node, external, internal)
import { EventEmitter } from 'node:events';
import axios from 'axios';
import { logInfo, logError } from '../telemetry/logger.js';

// 2. Types & interfaces
export interface WeatherDataConfig {
  apiKey: string;
  baseUrl: string;
  maxRetries: number;
}

export interface WeatherData {
  temperature: number;
  humidity: number;
  timestamp: Date;
}

// 3. Constants
const DEFAULT_TIMEOUT_MS = 5000;
const RETRY_DELAY_MS = 1000;

// 4. Class or functions
export class WeatherDataFetcher extends EventEmitter {
  // Private fields first
  private readonly config: WeatherDataConfig;
  private _cache: Map<string, WeatherData>;

  // Constructor
  constructor(config: WeatherDataConfig) {
    super();
    this.config = config;
    this._cache = new Map();
  }

  // Public methods
  async fetchWeatherData(location: string): Promise<WeatherData> {
    // Implementation
  }

  // Private methods last
  private validateLocation(location: string): boolean {
    return location.length > 0;
  }
}
```

---

### Async/Await

**Prefer** `async/await` over callbacks:

❌ **Bad**:
```typescript
fetchData((error, data) => {
  if (error) {
    handleError(error);
  } else {
    processData(data);
  }
});
```

✅ **Good**:
```typescript
try {
  const data = await fetchData();
  processData(data);
} catch (error) {
  handleError(error);
}
```

**Always handle errors** with try/catch:

❌ **Bad**:
```typescript
async function fetchWeather() {
  const data = await api.get('/weather'); // Unhandled rejection!
  return data;
}
```

✅ **Good**:
```typescript
async function fetchWeather(): Promise<WeatherData> {
  try {
    const data = await api.get('/weather');
    return data;
  } catch (error) {
    logError('Failed to fetch weather data', { error });
    throw new Error('Weather data unavailable');
  }
}
```

**Use Promise.all()** for parallel operations:

❌ **Bad** (sequential, slow):
```typescript
const user = await fetchUser(id);
const orders = await fetchOrders(id);
const profile = await fetchProfile(id);
```

✅ **Good** (parallel, fast):
```typescript
const [user, orders, profile] = await Promise.all([
  fetchUser(id),
  fetchOrders(id),
  fetchProfile(id)
]);
```

---

### Type Safety

**Always use explicit types** for function parameters and returns:

❌ **Bad**:
```typescript
function calculate(data) {
  return data.value * 2;
}
```

✅ **Good**:
```typescript
function calculate(data: { value: number }): number {
  return data.value * 2;
}
```

**Avoid `any`** - use `unknown` if type is truly unknown:

❌ **Bad**:
```typescript
function processData(data: any) {
  return data.value; // No type safety
}
```

✅ **Good**:
```typescript
function processData(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'value' in data) {
    return String((data as { value: unknown }).value);
  }
  throw new Error('Invalid data format');
}
```

**Use strict null checks**:
```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true
  }
}
```

---

### Error Handling

**Create custom error classes** for domain-specific errors:

```typescript
export class WeatherDataError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'WeatherDataError';
  }
}

// Usage:
throw new WeatherDataError(
  'API rate limit exceeded',
  'RATE_LIMIT',
  true // retryable
);
```

**Include context** in errors:

❌ **Bad**:
```typescript
throw new Error('Failed');
```

✅ **Good**:
```typescript
throw new WeatherDataError(
  `Failed to fetch weather data for location: ${location}`,
  'FETCH_FAILED',
  true
);
```

---

## Python

### Style

Follow **PEP 8** strictly:
- 4 spaces for indentation (no tabs)
- Max line length: 88 characters (Black formatter default)
- 2 blank lines between top-level definitions
- 1 blank line between methods

### Type Hints

**Required** for all public functions:

❌ **Bad**:
```python
def calculate_score(data, weights):
    return sum(data[k] * weights[k] for k in weights)
```

✅ **Good**:
```python
def calculate_score(
    data: dict[str, float],
    weights: dict[str, float]
) -> float:
    return sum(data[k] * weights[k] for k in weights)
```

### Docstrings

**Required** for all public functions and classes:

```python
def calculate_score(
    data: pd.DataFrame,
    weights: dict[str, float]
) -> float:
    """Calculate weighted score from data.

    Args:
        data: Input dataframe with features as columns
        weights: Feature weights dictionary (must sum to 1.0)

    Returns:
        Weighted score in range [0, 1]

    Raises:
        ValueError: If weights don't sum to 1.0
        KeyError: If data is missing required features

    Example:
        >>> data = pd.DataFrame({'feature_a': [0.5], 'feature_b': [0.7]})
        >>> weights = {'feature_a': 0.3, 'feature_b': 0.7}
        >>> calculate_score(data, weights)
        0.64
    """
    if not np.isclose(sum(weights.values()), 1.0):
        raise ValueError("Weights must sum to 1.0")

    return float((data[list(weights.keys())] * pd.Series(weights)).sum().sum())
```

### Naming Conventions

**Functions & Variables**: `snake_case`
```python
def fetch_weather_data():
    current_temperature = 72.5
```

**Classes**: `PascalCase`
```python
class WeatherDataFetcher:
    pass
```

**Constants**: `UPPER_SNAKE_CASE`
```python
MAX_RETRY_ATTEMPTS = 3
API_BASE_URL = 'https://api.example.com'
```

**Private**: prefix with `_`
```python
class Foo:
    def __init__(self):
        self._cache = {}

    def _validate(self):
        pass
```

---

## General Best Practices

### Don't Repeat Yourself (DRY)

❌ **Bad**:
```typescript
function processUserOrder(order: Order) {
  if (order.status === 'pending' && order.total > 100) {
    applyDiscount(order);
  }
}

function processAdminOrder(order: Order) {
  if (order.status === 'pending' && order.total > 100) {
    applyDiscount(order);
  }
}
```

✅ **Good**:
```typescript
function shouldApplyDiscount(order: Order): boolean {
  return order.status === 'pending' && order.total > 100;
}

function processOrder(order: Order) {
  if (shouldApplyDiscount(order)) {
    applyDiscount(order);
  }
}
```

### Keep Functions Small

**Target**: <50 lines per function
**Max**: 100 lines (refactor if larger)

**Single Responsibility**: Each function should do ONE thing well

### Avoid Deep Nesting

**Max nesting**: 3 levels

❌ **Bad**:
```typescript
if (user) {
  if (user.isActive) {
    if (user.hasPermission('admin')) {
      if (user.lastLogin > cutoffDate) {
        // Too deep!
      }
    }
  }
}
```

✅ **Good**:
```typescript
if (!user || !user.isActive) return;
if (!user.hasPermission('admin')) return;
if (user.lastLogin <= cutoffDate) return;

// Main logic here (no nesting)
```

### Use Meaningful Names

❌ **Bad**: `x`, `tmp`, `data`, `obj`, `arr`
✅ **Good**: `userId`, `weatherData`, `orderList`, `activeUsers`

---

## Code Review Checklist

Before requesting review:
- [ ] All functions have type annotations (TS/Python)
- [ ] No `any` types (TypeScript)
- [ ] All public functions documented
- [ ] Naming follows conventions
- [ ] No deep nesting (max 3 levels)
- [ ] Functions are small (<100 lines)
- [ ] Error handling present
- [ ] No magic numbers (use named constants)
- [ ] Imports organized (node → external → internal)

---

## Tools

**TypeScript**:
- ESLint: `npm run lint`
- Prettier: `npm run format`
- Type check: `npm run typecheck`

**Python**:
- Black: `black .`
- isort: `isort .`
- mypy: `mypy src/`
- flake8: `flake8 src/`

**Pre-commit hooks**: Automatically run formatters/linters
```bash
# Install
npm install -g husky
npx husky install

# Add hooks
npx husky add .husky/pre-commit "npm run lint && npm run typecheck"
```

---

## References

- [TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)
- [PEP 8 - Python Style Guide](https://peps.python.org/pep-0008/)
- [Clean Code by Robert C. Martin](https://www.oreilly.com/library/view/clean-code-a/9780136083238/)

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
