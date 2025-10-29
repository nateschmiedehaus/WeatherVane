#!/usr/bin/env python3
"""
Create Enhanced Synthetic Evaluation Corpus

Generates diverse synthetic tasks with DETAILED, SPECIFIC descriptions
for objective similarity evaluation.

Usage:
    python3 create_enhanced_corpus.py <workspace_root>
"""

import argparse
import json
import sys
from pathlib import Path
from datetime import datetime, timezone

# Add quality_graph scripts to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'tools' / 'wvo_mcp' / 'scripts' / 'quality_graph'))

from embeddings import compute_task_embedding


# Enhanced synthetic tasks with RICH, SPECIFIC details
ENHANCED_TASKS = [
    # API/Backend tasks
    {
        'task_id': 'IMP-API-01',
        'title': 'Add GET /api/v1/users endpoint with cursor-based pagination',
        'description': '''Implement REST API endpoint for listing users with cursor-based pagination (not offset/limit).

Technical requirements:
- Endpoint: GET /api/v1/users?cursor=<id>&limit=50
- Return fields: id, email, display_name, created_at, role
- Default limit: 50, max limit: 100
- Sort by: id ASC (stable ordering for cursor)
- Response includes next_cursor for pagination
- Filter support: ?role=admin,user&status=active
- Return 400 for invalid cursor, 401 for unauthenticated

Implementation approach:
- Use Prisma ORM with cursor pagination
- Add index on (id, created_at) for performance
- Implement CursorPaginationDTO with Zod validation
- Unit tests: pagination, filtering, edge cases (empty result, last page)
- OpenAPI spec in docs/api.yaml

Acceptance criteria:
- Paginate through 10,000 users in <2s total
- No duplicate users across pages
- Works with concurrent updates (stable cursor)''',
        'files_touched': ['src/api/users/list.ts', 'src/api/users/list.test.ts', 'src/dto/pagination.ts', 'docs/api.yaml'],
    },
    {
        'task_id': 'IMP-API-02',
        'title': 'Implement JWT access/refresh token authentication with Redis',
        'description': '''Add JWT-based authentication with access tokens (15min TTL) and refresh tokens (7 day TTL).

Technical approach:
- Access token: JWT with user_id, role, issued_at (HS256 signature)
- Refresh token: Opaque UUID stored in Redis with user_id mapping
- Middleware: validateAccessToken() extracts claims, attaches to req.user
- Endpoint: POST /api/v1/auth/refresh (exchange refresh for new access token)
- Redis key pattern: refresh_token:{uuid} -> {user_id, expires_at}
- Token rotation: Issue new refresh token on each use (invalidate old)

Security requirements:
- Access token in Authorization: Bearer header
- Refresh token in httpOnly secure cookie
- Rate limit: 10 refresh/minute per IP
- Reject tokens after user logout (blacklist in Redis)
- Audit log: token issued, refreshed, revoked events

Error handling:
- 401: Token expired, invalid signature, malformed
- 403: User deactivated, role changed, token blacklisted
- Include WWW-Authenticate header with error details

Tests:
- Valid token flow
- Expired token rejection
- Refresh token rotation
- Concurrent refresh handling (only one succeeds)''',
        'files_touched': ['src/middleware/auth.ts', 'src/auth/tokens.ts', 'src/auth/tokens.test.ts', 'src/redis/client.ts'],
    },
    {
        'task_id': 'CRIT-API-01',
        'title': 'Fix SQL injection vulnerability in search endpoint',
        'description': '''CRITICAL: GET /api/v1/products/search?q=<query> is vulnerable to SQL injection.

Vulnerability details:
- Endpoint: GET /api/v1/products/search?q=foo
- Current code: db.query(`SELECT * FROM products WHERE name LIKE '%${req.query.q}%'`)
- Attack vector: ?q='; DROP TABLE products; --
- Confirmed exploitable in production (no damage yet)

Fix approach:
- Replace with parameterized query: db.query('SELECT * FROM products WHERE name LIKE ?', [`%${query}%`])
- Use Prisma raw query with $1 placeholders
- Add input validation: alphanumeric + spaces only (reject special chars)
- Escape wildcards: replace % and _ in user input
- Add rate limiting: 100 searches/minute per IP

Additional security:
- Audit all other endpoints for SQL injection (grep for string concatenation in queries)
- Add SAST check in CI: semgrep rule for SQL injection patterns
- Add database user with read-only permissions for search queries

Tests:
- Test injection attempts return 400 Bad Request
- Test escaped wildcards don't match unintended results
- Test rate limiting blocks excessive requests''',
        'files_touched': ['src/api/products/search.ts', 'src/api/products/search.test.ts', 'src/db/validation.ts'],
    },

    # Database tasks
    {
        'task_id': 'IMP-DB-01',
        'title': 'Add Postgres migration for user_preferences JSONB column',
        'description': '''Create migration to add user preferences as flexible JSONB column.

Schema change:
- Table: users
- New column: preferences JSONB DEFAULT '{}'::jsonb NOT NULL
- Add GIN index: CREATE INDEX idx_users_preferences_gin ON users USING GIN (preferences)
- Example data: {"theme": "dark", "language": "en-US", "timezone": "America/Los_Angeles", "notifications": {"email": true, "push": false}}

Migration file structure:
- up.sql: ALTER TABLE users ADD COLUMN preferences JSONB DEFAULT '{}'::jsonb NOT NULL; CREATE INDEX ...
- down.sql: DROP INDEX idx_users_preferences_gin; ALTER TABLE users DROP COLUMN preferences;
- Estimated time: <100ms on 1M rows (column default doesn't rewrite table)

Application code changes:
- Update User model with preferences: Record<string, any>
- Add preference validation schema (max 50KB, valid JSON)
- Add endpoint: PATCH /api/v1/users/:id/preferences (merge with existing prefs)
- Query optimization: WHERE preferences @> '{"theme": "dark"}' uses GIN index

Rollback plan:
- Run down.sql to remove column
- No data loss (preferences are optional settings)''',
        'files_touched': ['migrations/20251029_add_user_preferences.sql', 'src/models/user.ts', 'src/api/users/preferences.ts'],
    },
    {
        'task_id': 'CRIT-DB-01',
        'title': 'Fix N+1 query causing 2000+ database roundtrips on orders page',
        'description': '''Orders list page loads in 8 seconds due to N+1 query problem (2000 queries for 100 orders).

Current problem:
- Query 1: SELECT * FROM orders LIMIT 100 (1 query)
- Loop: For each order, SELECT * FROM customers WHERE id = order.customer_id (100 queries)
- Loop: For each order, SELECT * FROM order_items WHERE order_id = order.id (100 queries)
- Loop: For each item, SELECT * FROM products WHERE id = item.product_id (2000 queries)
- Total: 2201 queries, 8 seconds page load

Solution approach:
- Single query with JOINs and aggregation:
  ```sql
  SELECT
    o.id, o.total, o.status, o.created_at,
    c.id as customer_id, c.name as customer_name, c.email,
    jsonb_agg(jsonb_build_object(
      'product_id', p.id,
      'product_name', p.name,
      'quantity', oi.quantity,
      'price', oi.price
    )) as items
  FROM orders o
  JOIN customers c ON o.customer_id = c.id
  JOIN order_items oi ON oi.order_id = o.id
  JOIN products p ON oi.product_id = p.id
  GROUP BY o.id, c.id
  ORDER BY o.created_at DESC
  LIMIT 100
  ```
- Add indexes: customers(id), order_items(order_id), order_items(product_id)
- Use Prisma include: order.include({customer: true, items: {include: {product: true}}})

Performance improvement:
- Before: 2201 queries, 8000ms
- After: 1 query, 120ms (66x faster)

Verification:
- Enable query logging
- Load page, verify single query executed
- Load test: 100 concurrent requests, p95 < 300ms''',
        'files_touched': ['src/api/orders/list.ts', 'migrations/20251029_add_order_indexes.sql', 'src/api/orders/list.test.ts'],
    },

    # UI/Frontend tasks
    {
        'task_id': 'IMP-UI-01',
        'title': 'Build responsive navigation with mobile hamburger menu (Material UI)',
        'description': '''Create responsive navigation component using Material-UI with mobile-first design.

Component requirements:
- Desktop (>900px): Horizontal nav bar with logo, links, user menu
- Mobile (<900px): Hamburger icon, slide-out drawer with links
- Support nested dropdowns (Account > Profile, Settings, Logout)
- Active link highlighting (match current route)
- Keyboard navigation: Tab through links, Enter to activate, Escape to close drawer

Technical implementation:
- Material-UI AppBar + Drawer components
- React Router useLocation for active link detection
- Animated transitions: slide drawer from left (300ms ease-out)
- Prevent body scroll when drawer open (CSS: overflow: hidden)
- Focus trap in drawer (focus cycles through links)

Accessibility (WCAG AA):
- Hamburger button: aria-label="Open navigation menu", aria-expanded
- Drawer: role="navigation", aria-labelledby="nav-title"
- Links: Descriptive text (not "Click here")
- Focus visible indicator (2px outline)
- Color contrast ratio >4.5:1 (text on background)

Responsive breakpoints:
- Mobile: <600px (stacked links, larger tap targets 48px)
- Tablet: 600-900px (compact nav, smaller text)
- Desktop: >900px (full horizontal layout)

Tests:
- Renders correctly at all breakpoints (visual regression)
- Keyboard navigation works (tab order, enter, escape)
- Active link highlights current page
- Drawer opens/closes with animation''',
        'files_touched': ['src/components/Navigation.tsx', 'src/components/Navigation.test.tsx', 'src/styles/navigation.css', 'src/components/NavDrawer.tsx'],
    },
    {
        'task_id': 'IMP-UI-02',
        'title': 'Implement dark mode with CSS custom properties and system preference detection',
        'description': '''Add dark/light theme support with smooth transitions and persistent preference.

Theme implementation:
- CSS custom properties in :root for colors:
  ```css
  :root {
    --bg-primary: #ffffff;
    --text-primary: #000000;
    --border: #e0e0e0;
  }
  :root[data-theme="dark"] {
    --bg-primary: #121212;
    --text-primary: #ffffff;
    --border: #333333;
  }
  ```
- All components use: background-color: var(--bg-primary)
- Smooth transition: transition: background-color 0.3s, color 0.3s

User preference flow:
1. On first visit: Detect system preference (prefers-color-scheme: dark)
2. User toggles theme: Save to localStorage (theme: "dark" | "light" | "auto")
3. On subsequent visits: Load from localStorage, fall back to system preference

Theme toggle UI:
- Header button with icon (sun/moon)
- Three states: Light, Dark, Auto (follows system)
- Tooltip: "Light mode", "Dark mode", "Auto (currently dark)"
- Smooth icon transition (fade + rotate)

Edge cases:
- System preference changes while app open → update if user has "auto"
- Multiple tabs → sync theme across tabs (localStorage change event)
- Print mode → force light theme (CSS: @media print)

Tests:
- Toggle changes theme immediately
- Theme persists after page reload
- System preference respected when "auto"
- All components render correctly in both themes''',
        'files_touched': ['src/theme/ThemeProvider.tsx', 'src/theme/theme.css', 'src/components/ThemeToggle.tsx', 'src/hooks/useTheme.ts'],
    },
    {
        'task_id': 'CRIT-UI-01',
        'title': 'Fix React form losing data on validation error (state management bug)',
        'description': '''Contact form clears all fields when server returns validation error, losing user's work.

Bug details:
- User fills out 10-field contact form (takes 5 minutes)
- Submit fails with "Email already registered" error
- Form state resets to empty, all data lost
- Users complaining: "I had to re-enter everything!"

Root cause:
- Form component calls setFormData({}) on any error response
- Should preserve form data, only show error message
- Current code: `onError: () => setFormData(initialFormData)` ❌

Fix approach:
1. Remove setFormData({}) from error handler
2. Add auto-save to localStorage every 2 seconds:
   - Key: `form_draft_contact_${Date.now()}`
   - Value: JSON.stringify(formData)
   - Clear localStorage on successful submit
3. On page load: Restore draft if present (show "Restore previous draft?" prompt)
4. Show inline field errors (don't clear valid fields):
   - Server returns: {errors: {email: "Already registered", phone: "Invalid format"}}
   - Only highlight email and phone fields, preserve other data

Additional improvements:
- Add "Save draft" button (manual save to localStorage)
- Show "*Unsaved changes" indicator
- Warn before leaving page: beforeunload event if form has data

Tests:
- Submit with validation error preserves form data
- Auto-save writes to localStorage every 2s
- Draft restored on page reload
- Draft cleared after successful submit
- beforeunload warns when form has unsaved data''',
        'files_touched': ['src/components/ContactForm.tsx', 'src/hooks/useFormPersistence.ts', 'src/components/ContactForm.test.tsx'],
    },

    # Testing tasks
    {
        'task_id': 'IMP-TEST-01',
        'title': 'Add Playwright E2E tests for complete user registration flow',
        'description': '''Create comprehensive end-to-end tests covering user registration with Playwright.

Test scenarios:
1. Happy path:
   - Navigate to /register
   - Fill form: email, password (8+ chars), confirm password, accept terms
   - Submit form
   - Verify "Check your email" message
   - Open email (use Mailhog test SMTP server)
   - Click verification link
   - Verify redirect to /login
   - Login with new credentials
   - Verify dashboard loads

2. Validation errors:
   - Test weak password (< 8 chars): Shows "Password must be 8+ characters"
   - Test password mismatch: Shows "Passwords do not match"
   - Test existing email: Shows "Email already registered"
   - Test invalid email format: Shows "Invalid email address"
   - Test missing required fields: All fields highlighted

3. Email verification edge cases:
   - Expired link (24h): Shows "Link expired, resend verification"
   - Already verified: Redirect to login with "Already verified" message
   - Invalid token: Shows "Invalid verification link"

4. Concurrency:
   - Two users register with same email simultaneously
   - Only one succeeds, other gets "Email already registered"

Test fixtures:
- users.fixture.ts: Generate random test users
- smtp.fixture.ts: Mailhog client for reading verification emails
- Cleanup: Delete test users after each test

Page objects:
- RegisterPage: fill(), submit(), getError()
- LoginPage: login()
- EmailInbox: getVerificationEmail(), clickLink()

Assertions:
- Form validation messages appear/disappear correctly
- Network requests succeed (check status 200/400)
- Email contains correct verification link
- User can login after verification
- User data visible on dashboard''',
        'files_touched': ['e2e/registration.spec.ts', 'e2e/fixtures/users.ts', 'e2e/fixtures/smtp.ts', 'e2e/pages/RegisterPage.ts'],
    },
    {
        'task_id': 'IMP-TEST-02',
        'title': 'Increase payment processing unit test coverage to 95% (focus edge cases)',
        'description': '''Expand test coverage for payment module from current 60% to 95%, focusing on error scenarios.

Current gaps (from coverage report):
- PaymentProcessor.processCharge(): 45% covered (missing error paths)
- RefundManager.partialRefund(): 20% covered (no edge cases tested)
- CurrencyConverter.convert(): 0% covered (NO TESTS!)

Test scenarios to add:

1. Payment failures:
   - Card declined (insufficient funds): Verify error code CARD_DECLINED
   - Card expired: Verify error code EXPIRED_CARD
   - Invalid CVV: Verify error code INVALID_CVV
   - Network timeout (5s): Verify retry logic (3 attempts with exponential backoff)
   - Gateway error 500: Verify fallback to secondary payment provider

2. Partial refunds:
   - Refund $50 of $100 charge: Verify remaining balance $50
   - Multiple partial refunds totaling original amount: Verify full refund
   - Refund exceeds original amount: Throw error "Refund exceeds charge amount"
   - Refund already-refunded charge: Throw error "Charge already refunded"

3. Currency conversion:
   - USD to EUR: Verify exchange rate within 1% of current rate (use ECB API)
   - Unsupported currency (XYZ): Throw error "Currency XYZ not supported"
   - Conversion with rounding: $10.999 USD → €10.00 (round to 2 decimals)
   - Same currency (USD to USD): Return original amount (no conversion)

4. Concurrency:
   - Process 100 payments simultaneously: All succeed or fail independently (no race conditions)
   - Refund same charge twice concurrently: Only one succeeds (use database transaction)

Test utilities:
- Mock Stripe API responses (use nock or MSW)
- Test fixtures: createTestCharge(), createTestRefund()
- Assertions: toHaveBeenCalledWith(expectedParams), toThrow(ExpectedError)

Performance:
- All tests complete in <5s (use mocks, no real API calls)
- Parallel test execution (Jest --maxWorkers=4)''',
        'files_touched': ['src/payment/processor.test.ts', 'src/payment/refunds.test.ts', 'src/payment/currency.test.ts', 'src/payment/__mocks__/stripe.ts'],
    },

    # Observability tasks
    {
        'task_id': 'IMP-OBS-01',
        'title': 'Instrument API layer with OpenTelemetry distributed tracing to Jaeger',
        'description': '''Add OpenTelemetry tracing to capture request flows through API → database → external services.

Instrumentation approach:
- Use @opentelemetry/sdk-node for auto-instrumentation
- Export traces to Jaeger (localhost:14268) via OTLP
- Capture spans for: HTTP requests, database queries, Redis operations, external API calls

Span structure:
- Root span: http.server (entire request/response cycle)
  - Attributes: http.method, http.url, http.status_code, http.user_agent
- Child spans:
  - db.query (for each SQL query): db.statement, db.table, db.duration_ms
  - redis.operation (get/set/del): redis.key, redis.ttl
  - http.client (external API calls): http.url, http.method, http.status_code

Custom spans:
- Add manual spans for business logic: tracer.startSpan('process_order')
- Add span events: span.addEvent('validation_failed', {reason: 'invalid_email'})
- Add span links: Link payment span to order span (trace causality)

Performance:
- Sampling: 10% of requests in production (100% in dev)
- Batch export: Buffer 100 spans, flush every 5s
- Low overhead: <5ms per request (confirmed with benchmark)

Configuration:
- Environment variables: OTEL_EXPORTER_JAEGER_ENDPOINT, OTEL_SERVICE_NAME=api-server
- Graceful degradation: If Jaeger unavailable, log warning and continue

Verification:
- Generate test traffic
- Open Jaeger UI (http://localhost:16686)
- Search for traces, verify complete request flow visible
- Verify spans show correct duration, attributes, errors

Error tracking:
- Failed requests: span.setStatus(SpanStatusCode.ERROR)
- Exception details: span.recordException(error)
- Error rate alert: If >5% requests have error status, alert''',
        'files_touched': ['src/tracing/tracer.ts', 'src/middleware/tracing.ts', 'src/config/otel.ts', 'docker-compose.yml'],
    },
    {
        'task_id': 'IMP-OBS-02',
        'title': 'Build Grafana dashboard for application health with Prometheus metrics',
        'description': '''Create Grafana dashboard showing key application health metrics from Prometheus.

Dashboard layout (4 panels):

Panel 1: Request Rate (top left)
- Metric: rate(http_requests_total[5m])
- Chart: Line graph, last 1 hour
- Color: Blue
- Show: Requests per second by endpoint
- Alert: If rate drops >50% from baseline, warn (service degradation)

Panel 2: Error Rate (top right)
- Metric: sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))
- Chart: Line graph with threshold line at 5%
- Color: Red when >5%, yellow 1-5%, green <1%
- Alert: If error rate >5% for 5 minutes, critical alert (page on-call)

Panel 3: Response Time (bottom left)
- Metric: histogram_quantile(0.95, http_request_duration_seconds_bucket)
- Chart: Line graph showing p50, p95, p99
- Show: Latency in milliseconds
- Alert: If p95 >500ms for 10 minutes, warn (performance degradation)

Panel 4: Database Connections (bottom right)
- Metric: db_connections_active, db_connections_max
- Chart: Gauge showing current/max ratio
- Color: Green <70%, yellow 70-90%, red >90%
- Alert: If connections >90% of max, critical (risk of connection exhaustion)

Additional metrics to collect:
- http_requests_total{method, endpoint, status}: Counter
- http_request_duration_seconds: Histogram (buckets: 0.01, 0.05, 0.1, 0.5, 1, 5)
- db_connections_active, db_connections_max: Gauge
- redis_operations_total{operation}: Counter

Prometheus exporter:
- Use prom-client library
- Expose /metrics endpoint (port 9090)
- Update every 15s (scrape interval)

Dashboard features:
- Time range selector (last 1h, 6h, 24h, 7d)
- Refresh: Auto-refresh every 30s
- Variables: $environment (dev, staging, prod), $endpoint (filter by endpoint)

SLO tracking:
- SLO: 99.9% uptime, p95 latency <500ms, error rate <1%
- Dashboard shows current vs SLO (green if meeting, red if violating)''',
        'files_touched': ['src/metrics/prometheus.ts', 'src/metrics/collectors.ts', 'grafana/dashboard.json', 'docker-compose.yml'],
    },
    {
        'task_id': 'CRIT-OBS-01',
        'title': 'Fix memory leak in background job processor (25GB heap growth over 24h)',
        'description': '''Worker process memory grows from 500MB to 25GB over 24 hours, crashing with OOM error.

Symptoms:
- Worker starts: 500MB heap
- After 24h: 25GB heap (50x growth!)
- Eventually crashes: "JavaScript heap out of memory"
- Requires manual restart every day

Investigation steps:
1. Take heap snapshots: node --expose-gc --max-old-space-size=2048 worker.js
2. Capture snapshots: Every hour for 24 hours
3. Analyze with Chrome DevTools Memory Profiler
4. Compare snapshots: Identify growing objects

Findings (from heap analysis):
- Retained size: 23GB in Array of Job objects
- Retaining path: jobQueue → processedJobs → Job[]
- Root cause: processedJobs.push(job) on every job completion, never cleared
- Jobs accumulate: 1000 jobs/hour * 24 hours = 24,000 jobs * 1MB each = 24GB

Fix:
1. Remove processedJobs array (not needed, jobs logged to database)
2. Alternative: Limit array size with LRU cache (keep last 1000 jobs only)
3. Add memory monitoring: Log heap size every minute, alert if >2GB

Verification approach:
- Run worker for 48 hours with fix
- Monitor heap size: Should stay flat at ~500MB
- Load test: Process 100,000 jobs, verify no memory growth

Additional improvements:
- Add job.cleanup() method to release resources (close file handles, clear buffers)
- Use WeakMap for temporary job metadata (auto garbage collected)
- Set maxJobRetention: 1000 (after 1000 jobs, clear oldest)

Memory profile comparison:
- Before: 500MB → 25GB over 24h (linear growth)
- After: 500MB → 520MB over 48h (stable)

Tests:
- Process 10,000 jobs in test, verify heap <1GB
- Check no memory leaks with --expose-gc and manual GC after each job''',
        'files_touched': ['src/workers/job-processor.ts', 'src/workers/cleanup.ts', 'src/workers/memory-monitor.ts', 'src/workers/job-processor.test.ts'],
    },

    # Refactoring tasks
    {
        'task_id': 'REFACTOR-01',
        'title': 'Extract email/phone/password validators into shared @company/validators package',
        'description': '''Validation logic duplicated across 15 files. Extract into reusable shared package.

Current duplication:
- Email validation: Regex /^[^@]+@[^@]+\\.[^@]+$/ appears in 8 files
- Phone validation: Regex /^\\+?[1-9]\\d{1,14}$/ appears in 6 files (E.164 format)
- Password validation: "8+ chars, uppercase, lowercase, number" in 12 files
- Each has slightly different implementation (inconsistent!)

New package structure:
- Package: @company/validators
- Exports: validateEmail(), validatePhone(), validatePassword(), validateURL()
- TypeScript with type guards: (input: string) => input is ValidEmail
- Zod integration: emailSchema, phoneSchema, passwordSchema

Validation rules (standardized):

1. Email:
   - Format: RFC 5322 compliant (use validator.js library)
   - Max length: 254 characters
   - Disallow disposable domains (tempmail.com, guerrillamail.com)
   - Return: {valid: boolean, error?: string}

2. Phone:
   - Format: E.164 international format (+1234567890)
   - Use libphonenumber-js for validation
   - Auto-format: Convert "(555) 123-4567" → "+15551234567"
   - Country code required

3. Password:
   - Length: 8-128 characters
   - Requirements: 1 uppercase, 1 lowercase, 1 number, 1 special char (!@#$%^&*)
   - Reject common passwords (check against top 10k list)
   - Return strength score: weak/medium/strong

4. URL:
   - Valid HTTP/HTTPS URL
   - No localhost or private IPs in production
   - Max length: 2048 characters

Migration plan:
1. Publish @company/validators package to private npm registry
2. Update 15 files to import from package: import {validateEmail} from '@company/validators'
3. Remove local validation functions
4. Update tests to use shared validators

Benefits:
- Single source of truth (no inconsistencies)
- Easier to update validation rules (change once, affects all services)
- Comprehensive tests in one place (100% coverage)
- TypeScript types shared across services

Tests:
- Valid inputs return true
- Invalid inputs return false with descriptive errors
- Edge cases: empty string, null, undefined, very long input
- Locale-specific formats (phone numbers from different countries)''',
        'files_touched': ['packages/validators/src/email.ts', 'packages/validators/src/phone.ts', 'packages/validators/src/password.ts', 'packages/validators/tests/email.test.ts'],
    },
    {
        'task_id': 'REFACTOR-02',
        'title': 'Migrate callback-based file upload to async/await with streaming',
        'description': '''File upload module uses nested callbacks (callback hell), hard to maintain and error-prone.

Current code structure (callback pyramid):
```javascript
upload.parseMultipart(req, (err, files) => {
  if (err) return res.status(400).send(err);

  validateFiles(files, (err, validFiles) => {
    if (err) return res.status(400).send(err);

    storage.uploadToS3(validFiles, (err, urls) => {
      if (err) return res.status(500).send(err);

      db.saveFileRecords(urls, (err, records) => {
        if (err) return res.status(500).send(err);

        res.json(records); // Success nested 4 levels deep!
      });
    });
  });
});
```

Problems:
- 4 levels of nesting (hard to read)
- Error handling duplicated at each level
- Can't use try/catch (must check err at each callback)
- Can't use Promise.all for parallel operations

Refactored approach (async/await):
```javascript
async function handleUpload(req, res) {
  try {
    const files = await parseMultipart(req);
    const validFiles = await validateFiles(files);
    const urls = await uploadToS3(validFiles);
    const records = await saveFileRecords(urls);

    res.json(records);
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({error: error.message});
    } else {
      res.status(500).json({error: 'Upload failed'});
    }
  }
}
```

Streaming improvements:
- Use streams to avoid loading entire file into memory
- parseMultipart: Use busboy with streams (process as bytes arrive)
- uploadToS3: Pipe directly to S3 (no intermediate buffer)
- Memory usage: 50MB → 5MB for 100MB file upload

Error handling improvements:
- Single try/catch block (centralized error handling)
- Typed errors: ValidationError, StorageError, DatabaseError
- Proper cleanup on error: Delete uploaded files, rollback database

Progress tracking:
- Add upload progress events: req.on('progress', (percent) => sendSSE(percent))
- Client receives real-time upload progress
- Cancel upload: req.on('close', () => cleanup())

Performance:
- Parallel validation: Use Promise.all to validate multiple files
- Before: Validate serially (10s for 10 files)
- After: Validate in parallel (2s for 10 files)

Tests:
- Upload single file: Success
- Upload multiple files: All succeed
- Upload with validation error: Reject early, no S3 upload
- Upload with S3 error: Cleanup temp files
- Large file upload: Memory usage stays <10MB
- Cancel upload: Cleanup occurs, no orphaned files''',
        'files_touched': ['src/upload/file-handler.ts', 'src/upload/streaming.ts', 'src/upload/file-handler.test.ts', 'src/upload/progress.ts'],
    },

    # Documentation tasks
    {
        'task_id': 'DOC-01',
        'title': 'Write comprehensive production deployment guide with blue-green strategy',
        'description': '''Create step-by-step deployment documentation for production environment with zero-downtime blue-green deployments.

Document structure:

1. Prerequisites:
   - AWS account with EC2, RDS, S3, Route53 access
   - Kubernetes cluster (EKS) with kubectl configured
   - Docker registry access (ECR)
   - Terraform v1.5+ for infrastructure
   - Required secrets in AWS Secrets Manager

2. Pre-deployment checklist:
   - Run test suite: npm test (must be 100% passing)
   - Run security scan: npm audit (0 high/critical vulnerabilities)
   - Build Docker image: docker build -t api:v1.2.3 .
   - Push to registry: docker push ecr.../api:v1.2.3
   - Database migrations ready: Review migrations/*.sql
   - Feature flags configured: Check LaunchDarkly dashboard

3. Blue-green deployment steps:

   Step 1: Deploy to GREEN environment (staging)
   - Update Kubernetes deployment: kubectl set image deployment/api-green api=api:v1.2.3
   - Wait for rollout: kubectl rollout status deployment/api-green (5 min timeout)
   - Run smoke tests: curl https://api-green.company.com/health
   - Verify metrics: Check Grafana dashboard (request rate, error rate, latency)

   Step 2: Run database migrations (if needed)
   - Migrations run from Kubernetes job: kubectl apply -f k8s/migrate-job.yaml
   - Forward-compatible only (old code still works): ADD COLUMN (not DROP COLUMN)
   - Verify migration success: Check job logs, query database

   Step 3: Traffic switch (blue → green)
   - Update Route53 weighted routing: 0% blue, 100% green
   - Monitor error rates: Watch for spike in errors (rollback trigger)
   - Gradual rollout: 10% → 50% → 100% over 30 minutes
   - Rollback criteria: Error rate >5% OR p95 latency >500ms OR manual abort

   Step 4: Verify production traffic
   - Check logs: kubectl logs -f deployment/api-green (look for errors)
   - Check metrics: Request rate matches expected (no traffic loss)
   - Check APM: Verify traces in Datadog show expected flow
   - User testing: QA team tests critical flows in production

   Step 5: Decommission BLUE environment
   - Scale down old deployment: kubectl scale deployment/api-blue --replicas=0
   - Keep for 24h as rollback option
   - After 24h: Delete blue deployment

4. Rollback procedure:
   - Immediate rollback: kubectl set image deployment/api-green api=api:v1.2.2 (previous version)
   - Or traffic switch: Route53 100% to blue (old version still running)
   - Investigate issues: Check logs, metrics, error reports
   - Fix forward: Deploy hotfix to green, switch traffic back

5. Post-deployment:
   - Update release notes: docs/CHANGELOG.md
   - Notify team: Slack message to #deployments channel
   - Monitor for 1 hour: Watch metrics, error logs, user reports
   - Tag release: git tag v1.2.3 && git push --tags

6. Troubleshooting common issues:
   - Issue: Deployment stuck in "Progressing" state
     - Cause: Image pull error (invalid tag)
     - Fix: Verify image exists: docker pull ecr.../api:v1.2.3

   - Issue: Pods crashing (CrashLoopBackOff)
     - Cause: Missing environment variable or secret
     - Fix: Check pod logs: kubectl logs api-green-xxxx

   - Issue: High error rate after deployment
     - Cause: Breaking change in API, clients sending old format
     - Fix: Rollback immediately, implement backward compatibility

Appendices:
- A: Environment variables reference (50+ vars with descriptions)
- B: Kubernetes resource definitions (deployment.yaml, service.yaml)
- C: Monitoring runbooks (what to do when alerts fire)
- D: Database migration best practices''',
        'files_touched': ['docs/deployment.md', 'docs/troubleshooting.md', 'docs/runbooks.md', 'k8s/deployment.yaml'],
    },
    {
        'task_id': 'DOC-02',
        'title': 'Generate OpenAPI 3.1 specification with request/response examples',
        'description': '''Create comprehensive OpenAPI specification for all REST API endpoints with rich examples.

OpenAPI file structure (openapi.yaml):

```yaml
openapi: 3.1.0
info:
  title: Company API
  version: 1.2.3
  description: REST API for company platform
  contact:
    email: api-team@company.com
servers:
  - url: https://api.company.com/v1
    description: Production
  - url: https://api-staging.company.com/v1
    description: Staging
```

Authentication:
- Security scheme: Bearer JWT token
- Header: Authorization: Bearer <token>
- Token obtained from POST /auth/login
- Include security requirement on all protected endpoints

Endpoint documentation (30 endpoints total):

Example: GET /users
```yaml
/users:
  get:
    summary: List users with pagination
    operationId: listUsers
    tags: [Users]
    parameters:
      - name: cursor
        in: query
        schema: {type: string}
        description: Pagination cursor from previous response
      - name: limit
        in: query
        schema: {type: integer, minimum: 1, maximum: 100, default: 50}
      - name: role
        in: query
        schema: {type: string, enum: [admin, user, guest]}
    responses:
      '200':
        description: Successful response
        content:
          application/json:
            schema:
              type: object
              properties:
                users:
                  type: array
                  items: {$ref: '#/components/schemas/User'}
                next_cursor: {type: string, nullable: true}
            examples:
              page1:
                summary: First page of results
                value:
                  users: [{id: 1, email: "alice@example.com", role: "admin"}]
                  next_cursor: "eyJpZCI6MX0="
      '401': {$ref: '#/components/responses/Unauthorized'}
      '429': {$ref: '#/components/responses/RateLimited'}
```

Schemas (components/schemas):
- User: id, email, display_name, role, created_at
- Error: code, message, details
- PaginationMeta: cursor, limit, has_more

Response examples:
- Include success case (200)
- Include error cases (400, 401, 404, 500)
- Include edge cases (empty results, max limit exceeded)

Rate limiting documentation:
- Global: 1000 requests/hour per IP
- Per-endpoint: Varies (auth: 10/min, search: 100/min)
- Rate limit headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
- 429 response includes Retry-After header

Code generation:
- Generate TypeScript types: openapi-typescript openapi.yaml -o types/api.ts
- Generate client SDK: openapi-generator-cli generate -i openapi.yaml -g typescript-axios -o sdk/
- Validate spec: openapi-generator-cli validate -i openapi.yaml

Interactive documentation:
- Host Swagger UI: Serve openapi.yaml at https://api.company.com/docs
- Try it out: Allow users to make test requests directly from docs
- Authentication: Users can input their JWT token in Swagger UI

Versioning:
- API version in URL: /v1/users
- Breaking changes require new version: /v2/users
- Document deprecated endpoints: deprecated: true, description: "Use /v2/users instead"

Validation:
- Ensure all endpoints documented (compare with actual routes)
- Ensure all schemas used (no orphaned definitions)
- Ensure examples valid (match schema)''',
        'files_touched': ['docs/openapi.yaml', 'docs/api-reference.md', 'scripts/generate-docs.sh', 'docs/swagger-ui.html'],
    },

    # Performance tasks
    {
        'task_id': 'CRIT-PERF-01',
        'title': 'Optimize landing page load time from 8s to <3s (Core Web Vitals)',
        'description': '''Landing page loads in 8 seconds with 20MB of unoptimized images, failing Core Web Vitals.

Current performance (Lighthouse score):
- LCP (Largest Contentful Paint): 6.2s (target: <2.5s) ❌
- FID (First Input Delay): 180ms (target: <100ms) ❌
- CLS (Cumulative Layout Shift): 0.42 (target: <0.1) ❌
- Lighthouse score: 32/100 (Poor)

Performance bottlenecks (from DevTools):
1. Images: 20MB total, 12 images at full resolution (4000x3000px)
2. JavaScript: 2MB bundle size (React, unused libraries)
3. Fonts: 800KB custom fonts loading blocking render
4. No caching: Every visit downloads everything again

Optimization plan:

1. Image optimization:
   - Convert to WebP format (70% size reduction)
   - Serve responsive images with srcset:
     ```html
     <img
       src="hero-800w.webp"
       srcset="hero-400w.webp 400w, hero-800w.webp 800w, hero-1200w.webp 1200w"
       sizes="(max-width: 600px) 400px, (max-width: 1200px) 800px, 1200px"
       loading="lazy"
       decoding="async"
     />
     ```
   - Lazy load below-fold images (loading="lazy")
   - Add CDN caching (Cloudflare): Cache-Control: max-age=31536000, immutable
   - Expected: 20MB → 2MB (10x reduction)

2. Code splitting:
   - Split bundle by route: React.lazy(() => import('./About'))
   - Load above-fold code first (~100KB initial bundle)
   - Defer non-critical scripts: <script defer src="analytics.js">
   - Tree-shake unused code: Check webpack-bundle-analyzer
   - Expected: 2MB → 300KB initial load (6x reduction)

3. Font optimization:
   - Use font-display: swap (show fallback font immediately)
   - Preload critical fonts: <link rel="preload" as="font" href="font.woff2">
   - Subset fonts (Latin characters only): 800KB → 80KB
   - Use system fonts for body text (zero load time)

4. Caching strategy:
   - Service Worker: Cache static assets for offline use
   - HTTP headers: Cache-Control: max-age=31536000 for immutable assets
   - Use content hashing in filenames: hero-abc123.webp (cache forever)

5. Critical CSS:
   - Inline above-fold CSS in <head> (~10KB)
   - Defer non-critical CSS: <link rel="preload" as="style" href="main.css">
   - Remove unused CSS: Use PurgeCSS (50KB → 8KB)

Implementation steps:
1. Image processing: Use sharp library to generate WebP + multiple sizes
2. Update image components: Use <picture> element with WebP + JPEG fallback
3. Webpack config: Add code splitting, bundle analyzer
4. Font subsetting: Use pyftsubset to extract Latin glyphs
5. Deploy behind Cloudflare CDN with caching rules

Verification:
- Run Lighthouse in CI: Fail build if score <90
- Test on real devices: iPhone 12, Pixel 5 (3G connection)
- Measure field data: Send Core Web Vitals to analytics (real user monitoring)
- Compare before/after:
  - LCP: 6.2s → 1.8s ✅
  - FID: 180ms → 45ms ✅
  - CLS: 0.42 → 0.05 ✅
  - Lighthouse: 32 → 95 ✅''',
        'files_touched': ['src/components/ImageOptimizer.tsx', 'webpack.config.js', 'src/utils/image-optimizer.ts', 'scripts/optimize-images.sh'],
    },
    {
        'task_id': 'IMP-PERF-01',
        'title': 'Implement Redis caching layer with TTL and cache invalidation',
        'description': '''Add Redis caching for frequently accessed data (user sessions, product catalog) to reduce database load by 80%.

Caching strategy:

1. User sessions (high read frequency):
   - Key: session:{session_id}
   - Value: {user_id, role, permissions, expires_at}
   - TTL: 15 minutes (refresh on each request)
   - Invalidation: On logout or password change
   - Pattern: Read-through cache (check Redis, fallback to DB, populate cache)

2. Product catalog (read-heavy, infrequent updates):
   - Key: product:{product_id}
   - Value: {id, name, price, description, inventory, images}
   - TTL: 1 hour
   - Invalidation: On product update (PATCH /products/:id)
   - Pattern: Cache-aside (application manages cache explicitly)

3. API rate limits (write-heavy):
   - Key: ratelimit:{ip}:{endpoint}
   - Value: Request count
   - TTL: 1 minute (sliding window)
   - Increment on each request: INCR key, check if > limit

Redis client setup:
- Use ioredis library (supports Redis Cluster, pipelining)
- Connection pool: 10 connections max
- Retry strategy: Exponential backoff (1s, 2s, 4s, max 10s)
- Error handling: If Redis unavailable, fallback to database (log warning)

Cache patterns implementation:

Read-through cache:
```typescript
async function getUser(userId: string): Promise<User> {
  // Try cache first
  const cached = await redis.get(`user:${userId}`);
  if (cached) {
    return JSON.parse(cached);
  }

  // Cache miss: fetch from database
  const user = await db.users.findUnique({where: {id: userId}});

  // Populate cache with 15min TTL
  await redis.setex(`user:${userId}`, 900, JSON.stringify(user));

  return user;
}
```

Cache invalidation:
```typescript
async function updateProduct(id: string, data: UpdateData): Promise<Product> {
  // Update database
  const product = await db.products.update({where: {id}, data});

  // Invalidate cache
  await redis.del(`product:${id}`);

  // Optional: Also invalidate list caches
  await redis.del('products:list:page:*');  // Use SCAN to find keys

  return product;
}
```

Performance optimization:
- Pipeline multiple operations: redis.pipeline().get('key1').get('key2').exec()
- Use mget for bulk reads: redis.mget(['key1', 'key2', 'key3'])
- Compress large values: Use zlib to gzip JSON before storing

Monitoring:
- Cache hit rate: hits / (hits + misses), target >90%
- Eviction rate: Monitor evicted_keys metric, alert if >1000/min
- Memory usage: Alert if >80% of max memory
- Connection errors: Alert on connection failures

Cache warming:
- On application startup: Preload hot data (top 100 products)
- Scheduled job: Refresh catalog every hour
- Avoid thundering herd: Use locks (SET key NX EX 10) for cache regeneration

Tests:
- Cache hit: Verify second read from cache (faster than DB)
- Cache miss: Verify fallback to DB
- Cache invalidation: Update data, verify cache cleared
- Redis failure: Verify graceful degradation to DB
- Concurrent requests: No cache stampede (use locking)''',
        'files_touched': ['src/cache/redis-client.ts', 'src/cache/cache-strategy.ts', 'src/cache/redis-client.test.ts', 'src/middleware/rate-limit.ts'],
    },

    # Infrastructure tasks
    {
        'task_id': 'IMP-INFRA-01',
        'title': 'Set up GitHub Actions CI/CD with automated testing and blue-green deployment',
        'description': '''Automate entire software delivery pipeline: build → test → deploy to staging → deploy to production.

GitHub Actions workflow structure:

Workflow 1: ci.yml (runs on every PR)
```yaml
name: CI
on: [pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run lint  # ESLint + Prettier check
      - run: npm run typecheck  # TypeScript compiler

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env: {POSTGRES_PASSWORD: test}
      redis:
        image: redis:7
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm test -- --coverage  # Jest with coverage
      - uses: codecov/codecov-action@v3  # Upload coverage report
      - run: npm run test:e2e  # Playwright E2E tests

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm audit --audit-level=high  # Fail on high/critical vulns
      - uses: snyk/actions/node@master  # Additional security scan
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}

  build:
    runs-on: ubuntu-latest
    needs: [lint, test, security]  # Only build if all checks pass
    steps:
      - uses: actions/checkout@v3
      - run: docker build -t api:${{ github.sha }} .
      - run: docker push ecr.../api:${{ github.sha }}
```

Workflow 2: deploy-staging.yml (runs on merge to main)
```yaml
name: Deploy Staging
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to staging
        run: |
          kubectl set image deployment/api-staging api=api:${{ github.sha }}
          kubectl rollout status deployment/api-staging --timeout=5m
      - name: Run smoke tests
        run: npm run test:smoke -- --env staging
      - name: Notify Slack
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "✅ Deployed to staging: ${{ github.sha }}"
            }
```

Workflow 3: deploy-prod.yml (runs on git tag)
```yaml
name: Deploy Production
on:
  push:
    tags: ['v*']
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production  # Requires manual approval in GitHub
    steps:
      - uses: actions/checkout@v3
      - name: Blue-green deployment
        run: |
          # Deploy to green environment
          kubectl set image deployment/api-green api=api:${{ github.ref_name }}
          kubectl rollout status deployment/api-green --timeout=10m

          # Run smoke tests on green
          npm run test:smoke -- --env green

          # Traffic switch: 0% → 10% → 50% → 100%
          ./scripts/traffic-switch.sh green 10
          sleep 300  # Monitor for 5 minutes

          ./scripts/traffic-switch.sh green 50
          sleep 300

          ./scripts/traffic-switch.sh green 100

          # Scale down blue environment
          kubectl scale deployment/api-blue --replicas=0

      - name: Create GitHub Release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: ${{ github.ref }}
          release_name: Release ${{ github.ref }}
          body: |
            See CHANGELOG.md for details

      - name: Notify Slack
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "🚀 Deployed to production: ${{ github.ref_name }}"
            }
```

Secrets configuration:
- AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY: For ECR push
- KUBECONFIG: Kubernetes cluster access
- SNYK_TOKEN: Security scanning
- SLACK_WEBHOOK_URL: Notifications
- CODECOV_TOKEN: Coverage upload

Branch protection rules:
- Require status checks to pass: lint, test, security
- Require 1 approving review
- Require linear history (no merge commits)
- Require signed commits (GPG)

Deployment notifications:
- Slack: Post to #deployments channel with commit SHA, author, status
- Email: Send to on-call engineer if production deployment fails
- PagerDuty: Create incident if deployment fails (rollback required)

Rollback procedure:
- Manual rollback: Re-run deploy workflow with previous git tag
- Automatic rollback: If smoke tests fail, revert traffic to blue

Cost optimization:
- Use GitHub-hosted runners (free for public repos)
- Cache npm dependencies: actions/cache@v3 (saves 2 min per build)
- Cancel redundant runs: concurrency group (auto-cancel old PR runs)

Monitoring:
- Track deployment frequency: Target 10+ deployments/week
- Track lead time: PR opened → production, target <4 hours
- Track failure rate: Target <5% failed deployments
- Track MTTR: Mean time to recovery, target <30 minutes''',
        'files_touched': ['.github/workflows/ci.yml', '.github/workflows/deploy-staging.yml', '.github/workflows/deploy-prod.yml', 'scripts/traffic-switch.sh'],
    },
]


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments"""
    parser = argparse.ArgumentParser(
        description='Create enhanced synthetic corpus with detailed descriptions',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument(
        'workspace_root',
        type=str,
        help='Path to workspace root directory',
    )

    parser.add_argument(
        '--output',
        type=str,
        default='state/quality_graph/synthetic_corpus.jsonl',
        help='Output corpus file (default: state/quality_graph/synthetic_corpus.jsonl)',
    )

    return parser.parse_args()


def create_enhanced_corpus(workspace_root: Path, output_path: Path):
    """Create enhanced synthetic corpus"""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f'Creating enhanced synthetic corpus with {len(ENHANCED_TASKS)} tasks...')
    print()

    vectors = []

    for i, task in enumerate(ENHANCED_TASKS, 1):
        task_id = task['task_id']
        print(f'[{i}/{len(ENHANCED_TASKS)}] {task_id}: {task["title"][:60]}...')

        # Compute embedding
        metadata = {
            'title': task['title'],
            'description': task['description'],
            'files_touched': task['files_touched'],
        }

        try:
            embedding = compute_task_embedding(metadata)

            # Create vector
            vector = {
                'task_id': task_id,
                'title': task['title'],
                'description': task['description'],
                'files_touched': task['files_touched'],
                'embedding': embedding.tolist(),
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'outcome': {'status': 'success'},
                'synthetic': True,
            }

            vectors.append(vector)

        except Exception as e:
            print(f'  ERROR: {e}')
            continue

    # Write corpus
    with open(output_path, 'w', encoding='utf-8') as f:
        for vector in vectors:
            f.write(json.dumps(vector) + '\n')

    print()
    print(f'✅ Created enhanced synthetic corpus: {output_path}')
    print(f'   Vectors: {len(vectors)}')


def main() -> int:
    """Main entry point"""
    try:
        args = parse_args()

        workspace_root = Path(args.workspace_root).resolve()
        if not workspace_root.exists():
            raise ValueError(f'Workspace root does not exist: {workspace_root}')

        output_path = Path(args.output) if args.output.startswith('/') else workspace_root / args.output

        print(f'Workspace: {workspace_root}')
        print(f'Output: {output_path}')
        print()

        # Create corpus
        create_enhanced_corpus(workspace_root, output_path)

        return 0

    except KeyboardInterrupt:
        print('\nInterrupted by user', file=sys.stderr)
        return 130

    except Exception as e:
        print(f'Error: {e}', file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1


if __name__ == '__main__':
    sys.exit(main())
