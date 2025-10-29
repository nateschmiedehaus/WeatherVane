# Manual Similarity Evaluation

**Task:** IMP-ADV-01.3 - Manual Similarity Evaluation
**Evaluator:** nathanielschmiedehaus (product owner)
**Date:** 2025-10-29

## Instructions

For each query task, review the top-5 similar tasks and mark whether each is **relevant**.

**Relevance Criteria:**
- **Relevant (Yes):** Same domain/feature, reusable approach, useful context
- **Not Relevant (No):** Unrelated domain, no useful connection

**How to evaluate:**
1. Read the query task title/description
2. For each of the 5 similar tasks:
   - Read its title/description
   - Decide: Would this task provide useful context for planning/implementing the query task?
   - Mark `[x]` for Yes or `[ ]` for No

**Example:**
```
1. **PERF-TEST-5** (score: 0.92)
   - Description: Measure API latency
   - Relevant? [x] Yes [ ] No
```

---

## Query 1: IMP-API-01

**Title:** Add GET /api/users endpoint with pagination

**Description:** Implement REST API endpoint to list users with pagination support (limit, offset). Return user ID, email, name. Include unit tests and API documentation.

**Files:** src/api/users.ts, src/api/users.test.ts, docs/api.md

### Top-5 Similar Tasks

1. **IMP-DB-01** (score: 0.732)
   - Title: Add database migration for user preferences table
   - Description: Create migration to add user_preferences table with columns: user_id (FK), theme, language, timezone. Include rollback script.
   - Files: migrations/001_add_user_preferences.sql
   - Relevant? [ ] Yes [x] No

2. **IMP-API-02** (score: 0.720)
   - Title: Implement JWT authentication middleware
   - Description: Add JWT token validation middleware for protected routes. Verify token signature, check expiration, extract user claims. Handle auth errors gracefully.
   - Files: src/middleware/auth.ts, src/middleware/auth.test.ts
   - Relevant? [x] Yes [ ] No

3. **CRIT-DB-01** (score: 0.689)
   - Title: Optimize slow query on orders table (N+1 problem)
   - Description: Orders list endpoint causing 500+ queries per request. Replace with single JOIN query. Add database index on customer_id.
   - Files: src/db/orders.ts, migrations/002_add_orders_index.sql
   - Relevant? [ ] Yes [x] No

4. **REFACTOR-02** (score: 0.666)
   - Title: Migrate legacy callback-based code to async/await
   - Description: Modernize callback pyramid in file upload module. Convert to promises with async/await. Improve error handling and readability.
   - Files: src/upload/file-handler.ts, src/upload/file-handler.test.ts
   - Relevant? [ ] Yes [x] No

5. **IMP-TEST-01** (score: 0.659)
   - Title: Add end-to-end tests for user registration flow
   - Description: Create Playwright tests covering registration: form validation, email verification, login after signup. Test happy path and error cases.
   - Files: e2e/registration.spec.ts, e2e/fixtures/users.ts
   - Relevant? [ ] Yes [x] No

---

## Query 2: IMP-API-02

**Title:** Implement JWT authentication middleware

**Description:** Add JWT token validation middleware for protected routes. Verify token signature, check expiration, extract user claims. Handle auth errors gracefully.

**Files:** src/middleware/auth.ts, src/middleware/auth.test.ts

### Top-5 Similar Tasks

1. **IMP-TEST-02** (score: 0.901)
   - Title: Increase unit test coverage for payment processing
   - Description: Add tests for payment edge cases: declined cards, network timeouts, partial refunds, currency conversion. Target 90% coverage.
   - Files: src/payment/processor.test.ts, src/payment/refunds.test.ts
   - Relevant? [ ] Yes [x] No

2. **IMP-OBS-02** (score: 0.877)
   - Title: Create dashboard for application health metrics
   - Description: Build metrics dashboard showing request rate, error rate, p95 latency, database connections. Add alerting for SLO violations.
   - Files: src/metrics/dashboard.tsx, src/metrics/collectors.ts
   - Relevant? [ ] Yes [x] No

3. **CRIT-OBS-01** (score: 0.804)
   - Title: Fix memory leak in background job processor
   - Description: Worker process memory growing unbounded. Profile with heap snapshots, identify leak source, add proper cleanup in job handlers.
   - Files: src/workers/job-processor.ts, src/workers/cleanup.ts
   - Relevant? [ ] Yes [x] No

4. **IMP-DB-01** (score: 0.791)
   - Title: Add database migration for user preferences table
   - Description: Create migration to add user_preferences table with columns: user_id (FK), theme, language, timezone. Include rollback script.
   - Files: migrations/001_add_user_preferences.sql
   - Relevant? [ ] Yes [x] No

5. **DOC-02** (score: 0.781)
   - Title: Create API reference documentation
   - Description: Generate OpenAPI/Swagger docs for all REST endpoints. Include request/response schemas, authentication, rate limits, examples.
   - Files: docs/api-reference.md, openapi.yaml
   - Relevant? [x] Yes [ ] No

---

## Query 3: CRIT-API-01

**Title:** Fix authentication bypass vulnerability in login endpoint

**Description:** Critical security issue: login endpoint accepts null password and grants access. Add password validation, rate limiting, and audit logging.

**Files:** src/auth/login.ts, src/auth/login.test.ts

### Top-5 Similar Tasks

1. **IMP-INFRA-01** (score: 0.818)
   - Title: Set up CI/CD pipeline with GitHub Actions
   - Description: Automate build, test, deploy workflow. Run tests on PR, deploy to staging on merge, production on tag. Add deployment notifications.
   - Files: .github/workflows/ci.yml, .github/workflows/deploy.yml
   - Relevant? [ ] Yes [x] No

2. **IMP-TEST-01** (score: 0.808)
   - Title: Add end-to-end tests for user registration flow
   - Description: Create Playwright tests covering registration: form validation, email verification, login after signup. Test happy path and error cases.
   - Files: e2e/registration.spec.ts, e2e/fixtures/users.ts
   - Relevant? [x] Yes [ ] No

3. **CRIT-OBS-01** (score: 0.798)
   - Title: Fix memory leak in background job processor
   - Description: Worker process memory growing unbounded. Profile with heap snapshots, identify leak source, add proper cleanup in job handlers.
   - Files: src/workers/job-processor.ts, src/workers/cleanup.ts
   - Relevant? [ ] Yes [x] No

4. **CRIT-PERF-01** (score: 0.788)
   - Title: Optimize image loading causing slow page load
   - Description: Landing page loads 20MB of unoptimized images. Add lazy loading, WebP format, responsive srcset, CDN caching. Target <3s LCP.
   - Files: src/components/ImageGallery.tsx, src/utils/image-optimizer.ts
   - Relevant? [ ] Yes [x] No

5. **REFACTOR-02** (score: 0.786)
   - Title: Migrate legacy callback-based code to async/await
   - Description: Modernize callback pyramid in file upload module. Convert to promises with async/await. Improve error handling and readability.
   - Files: src/upload/file-handler.ts, src/upload/file-handler.test.ts
   - Relevant? [ ] Yes [x] No

---

## Query 4: IMP-DB-01

**Title:** Add database migration for user preferences table

**Description:** Create migration to add user_preferences table with columns: user_id (FK), theme, language, timezone. Include rollback script.

**Files:** migrations/001_add_user_preferences.sql

### Top-5 Similar Tasks

1. **CRIT-OBS-01** (score: 0.831)
   - Title: Fix memory leak in background job processor
   - Description: Worker process memory growing unbounded. Profile with heap snapshots, identify leak source, add proper cleanup in job handlers.
   - Files: src/workers/job-processor.ts, src/workers/cleanup.ts
   - Relevant? [ ] Yes [x] No

2. **DOC-02** (score: 0.825)
   - Title: Create API reference documentation
   - Description: Generate OpenAPI/Swagger docs for all REST endpoints. Include request/response schemas, authentication, rate limits, examples.
   - Files: docs/api-reference.md, openapi.yaml
   - Relevant? [ ] Yes [x] No

3. **IMP-API-02** (score: 0.791)
   - Title: Implement JWT authentication middleware
   - Description: Add JWT token validation middleware for protected routes. Verify token signature, check expiration, extract user claims. Handle auth errors gracefully.
   - Files: src/middleware/auth.ts, src/middleware/auth.test.ts
   - Relevant? [ ] Yes [x] No

4. **CRIT-API-01** (score: 0.776)
   - Title: Fix authentication bypass vulnerability in login endpoint
   - Description: Critical security issue: login endpoint accepts null password and grants access. Add password validation, rate limiting, and audit logging.
   - Files: src/auth/login.ts, src/auth/login.test.ts
   - Relevant? [ ] Yes [x] No

5. **IMP-OBS-02** (score: 0.743)
   - Title: Create dashboard for application health metrics
   - Description: Build metrics dashboard showing request rate, error rate, p95 latency, database connections. Add alerting for SLO violations.
   - Files: src/metrics/dashboard.tsx, src/metrics/collectors.ts
   - Relevant? [ ] Yes [x] No

---

## Query 5: CRIT-DB-01

**Title:** Optimize slow query on orders table (N+1 problem)

**Description:** Orders list endpoint causing 500+ queries per request. Replace with single JOIN query. Add database index on customer_id.

**Files:** src/db/orders.ts, migrations/002_add_orders_index.sql

### Top-5 Similar Tasks

1. **IMP-UI-02** (score: 0.851)
   - Title: Add dark mode theme support
   - Description: Implement dark/light theme toggle with CSS variables. Persist theme preference in localStorage. Respect system preference (prefers-color-scheme).
   - Files: src/theme/ThemeProvider.tsx, src/styles/themes.css
   - Relevant? [ ] Yes [x] No

2. **DOC-02** (score: 0.825)
   - Title: Create API reference documentation
   - Description: Generate OpenAPI/Swagger docs for all REST endpoints. Include request/response schemas, authentication, rate limits, examples.
   - Files: docs/api-reference.md, openapi.yaml
   - Relevant? [ ] Yes [x] No

3. **CRIT-OBS-01** (score: 0.800)
   - Title: Fix memory leak in background job processor
   - Description: Worker process memory growing unbounded. Profile with heap snapshots, identify leak source, add proper cleanup in job handlers.
   - Files: src/workers/job-processor.ts, src/workers/cleanup.ts
   - Relevant? [ ] Yes [x] No

4. **IMP-INFRA-01** (score: 0.791)
   - Title: Set up CI/CD pipeline with GitHub Actions
   - Description: Automate build, test, deploy workflow. Run tests on PR, deploy to staging on merge, production on tag. Add deployment notifications.
   - Files: .github/workflows/ci.yml, .github/workflows/deploy.yml
   - Relevant? [ ] Yes [x] No

5. **CRIT-API-01** (score: 0.778)
   - Title: Fix authentication bypass vulnerability in login endpoint
   - Description: Critical security issue: login endpoint accepts null password and grants access. Add password validation, rate limiting, and audit logging.
   - Files: src/auth/login.ts, src/auth/login.test.ts
   - Relevant? [ ] Yes [x] No

---

## Query 6: IMP-UI-01

**Title:** Build responsive navigation menu component

**Description:** Create navigation component with mobile hamburger menu. Support nested menu items, active link highlighting, accessibility (ARIA labels, keyboard nav).

**Files:** src/components/Navigation.tsx, src/components/Navigation.test.tsx, src/styles/navigation.css

### Top-5 Similar Tasks

1. **CRIT-API-01** (score: 0.768)
   - Title: Fix authentication bypass vulnerability in login endpoint
   - Description: Critical security issue: login endpoint accepts null password and grants access. Add password validation, rate limiting, and audit logging.
   - Files: src/auth/login.ts, src/auth/login.test.ts
   - Relevant? [ ] Yes [x] No

2. **IMP-TEST-01** (score: 0.753)
   - Title: Add end-to-end tests for user registration flow
   - Description: Create Playwright tests covering registration: form validation, email verification, login after signup. Test happy path and error cases.
   - Files: e2e/registration.spec.ts, e2e/fixtures/users.ts
   - Relevant? [ ] Yes [x] No

3. **CRIT-OBS-01** (score: 0.731)
   - Title: Fix memory leak in background job processor
   - Description: Worker process memory growing unbounded. Profile with heap snapshots, identify leak source, add proper cleanup in job handlers.
   - Files: src/workers/job-processor.ts, src/workers/cleanup.ts
   - Relevant? [ ] Yes [x] No

4. **REFACTOR-01** (score: 0.718)
   - Title: Extract validation logic into reusable validators
   - Description: Validation code duplicated across 10+ files. Extract email, phone, password validators into shared utility. Add comprehensive tests.
   - Files: src/utils/validators.ts, src/utils/validators.test.ts
   - Relevant? [ ] Yes [x] No

5. **IMP-DB-01** (score: 0.718)
   - Title: Add database migration for user preferences table
   - Description: Create migration to add user_preferences table with columns: user_id (FK), theme, language, timezone. Include rollback script.
   - Files: migrations/001_add_user_preferences.sql
   - Relevant? [ ] Yes [x] No

---

## Query 7: IMP-UI-02

**Title:** Add dark mode theme support

**Description:** Implement dark/light theme toggle with CSS variables. Persist theme preference in localStorage. Respect system preference (prefers-color-scheme).

**Files:** src/theme/ThemeProvider.tsx, src/styles/themes.css

### Top-5 Similar Tasks

1. **CRIT-DB-01** (score: 0.851)
   - Title: Optimize slow query on orders table (N+1 problem)
   - Description: Orders list endpoint causing 500+ queries per request. Replace with single JOIN query. Add database index on customer_id.
   - Files: src/db/orders.ts, migrations/002_add_orders_index.sql
   - Relevant? [ ] Yes [x] No

2. **DOC-02** (score: 0.806)
   - Title: Create API reference documentation
   - Description: Generate OpenAPI/Swagger docs for all REST endpoints. Include request/response schemas, authentication, rate limits, examples.
   - Files: docs/api-reference.md, openapi.yaml
   - Relevant? [ ] Yes [x] No

3. **IMP-PERF-01** (score: 0.791)
   - Title: Add Redis caching for frequently accessed data
   - Description: Cache user sessions, product catalog in Redis. Implement cache invalidation on updates. Add cache hit/miss metrics.
   - Files: src/cache/redis-client.ts, src/cache/cache-strategy.ts
   - Relevant? [ ] Yes [x] No

4. **CRIT-OBS-01** (score: 0.783)
   - Title: Fix memory leak in background job processor
   - Description: Worker process memory growing unbounded. Profile with heap snapshots, identify leak source, add proper cleanup in job handlers.
   - Files: src/workers/job-processor.ts, src/workers/cleanup.ts
   - Relevant? [ ] Yes [x] No

5. **REFACTOR-01** (score: 0.781)
   - Title: Extract validation logic into reusable validators
   - Description: Validation code duplicated across 10+ files. Extract email, phone, password validators into shared utility. Add comprehensive tests.
   - Files: src/utils/validators.ts, src/utils/validators.test.ts
   - Relevant? [ ] Yes [x] No

---

## Query 8: CRIT-UI-01

**Title:** Fix form submission bug causing data loss

**Description:** Users losing form data on validation error. Preserve form state on error, add auto-save to localStorage, show error messages inline.

**Files:** src/components/ContactForm.tsx, src/hooks/useFormPersistence.ts

### Top-5 Similar Tasks

1. **REFACTOR-02** (score: 0.816)
   - Title: Migrate legacy callback-based code to async/await
   - Description: Modernize callback pyramid in file upload module. Convert to promises with async/await. Improve error handling and readability.
   - Files: src/upload/file-handler.ts, src/upload/file-handler.test.ts
   - Relevant? [ ] Yes [x] No

2. **IMP-OBS-02** (score: 0.808)
   - Title: Create dashboard for application health metrics
   - Description: Build metrics dashboard showing request rate, error rate, p95 latency, database connections. Add alerting for SLO violations.
   - Files: src/metrics/dashboard.tsx, src/metrics/collectors.ts
   - Relevant? [ ] Yes [x] No

3. **IMP-TEST-01** (score: 0.799)
   - Title: Add end-to-end tests for user registration flow
   - Description: Create Playwright tests covering registration: form validation, email verification, login after signup. Test happy path and error cases.
   - Files: e2e/registration.spec.ts, e2e/fixtures/users.ts
   - Relevant? [x] Yes [ ] No

4. **CRIT-OBS-01** (score: 0.790)
   - Title: Fix memory leak in background job processor
   - Description: Worker process memory growing unbounded. Profile with heap snapshots, identify leak source, add proper cleanup in job handlers.
   - Files: src/workers/job-processor.ts, src/workers/cleanup.ts
   - Relevant? [ ] Yes [x] No

5. **CRIT-PERF-01** (score: 0.788)
   - Title: Optimize image loading causing slow page load
   - Description: Landing page loads 20MB of unoptimized images. Add lazy loading, WebP format, responsive srcset, CDN caching. Target <3s LCP.
   - Files: src/components/ImageGallery.tsx, src/utils/image-optimizer.ts
   - Relevant? [ ] Yes [x] No

---

## Query 9: IMP-TEST-01

**Title:** Add end-to-end tests for user registration flow

**Description:** Create Playwright tests covering registration: form validation, email verification, login after signup. Test happy path and error cases.

**Files:** e2e/registration.spec.ts, e2e/fixtures/users.ts

### Top-5 Similar Tasks

1. **IMP-OBS-01** (score: 0.874)
   - Title: Add OpenTelemetry tracing for API requests
   - Description: Instrument API layer with distributed tracing. Capture request duration, status codes, user ID. Export traces to Jaeger.
   - Files: src/tracing/tracer.ts, src/middleware/tracing.ts
   - Relevant? [ ] Yes [x] No

2. **CRIT-PERF-01** (score: 0.854)
   - Title: Optimize image loading causing slow page load
   - Description: Landing page loads 20MB of unoptimized images. Add lazy loading, WebP format, responsive srcset, CDN caching. Target <3s LCP.
   - Files: src/components/ImageGallery.tsx, src/utils/image-optimizer.ts
   - Relevant? [ ] Yes [x] No

3. **REFACTOR-01** (score: 0.829)
   - Title: Extract validation logic into reusable validators
   - Description: Validation code duplicated across 10+ files. Extract email, phone, password validators into shared utility. Add comprehensive tests.
   - Files: src/utils/validators.ts, src/utils/validators.test.ts
   - Relevant? [ ] Yes [x] No

4. **CRIT-API-01** (score: 0.808)
   - Title: Fix authentication bypass vulnerability in login endpoint
   - Description: Critical security issue: login endpoint accepts null password and grants access. Add password validation, rate limiting, and audit logging.
   - Files: src/auth/login.ts, src/auth/login.test.ts
   - Relevant? [ ] Yes [x] No

5. **IMP-INFRA-01** (score: 0.803)
   - Title: Set up CI/CD pipeline with GitHub Actions
   - Description: Automate build, test, deploy workflow. Run tests on PR, deploy to staging on merge, production on tag. Add deployment notifications.
   - Files: .github/workflows/ci.yml, .github/workflows/deploy.yml
   - Relevant? [ ] Yes [x] No

---

## Query 10: IMP-TEST-02

**Title:** Increase unit test coverage for payment processing

**Description:** Add tests for payment edge cases: declined cards, network timeouts, partial refunds, currency conversion. Target 90% coverage.

**Files:** src/payment/processor.test.ts, src/payment/refunds.test.ts

### Top-5 Similar Tasks

1. **IMP-API-02** (score: 0.901)
   - Title: Implement JWT authentication middleware
   - Description: Add JWT token validation middleware for protected routes. Verify token signature, check expiration, extract user claims. Handle auth errors gracefully.
   - Files: src/middleware/auth.ts, src/middleware/auth.test.ts
   - Relevant? [ ] Yes [x] No

2. **IMP-OBS-02** (score: 0.897)
   - Title: Create dashboard for application health metrics
   - Description: Build metrics dashboard showing request rate, error rate, p95 latency, database connections. Add alerting for SLO violations.
   - Files: src/metrics/dashboard.tsx, src/metrics/collectors.ts
   - Relevant? [ ] Yes [x] No

3. **CRIT-OBS-01** (score: 0.840)
   - Title: Fix memory leak in background job processor
   - Description: Worker process memory growing unbounded. Profile with heap snapshots, identify leak source, add proper cleanup in job handlers.
   - Files: src/workers/job-processor.ts, src/workers/cleanup.ts
   - Relevant? [ ] Yes [x] No

4. **IMP-INFRA-01** (score: 0.779)
   - Title: Set up CI/CD pipeline with GitHub Actions
   - Description: Automate build, test, deploy workflow. Run tests on PR, deploy to staging on merge, production on tag. Add deployment notifications.
   - Files: .github/workflows/ci.yml, .github/workflows/deploy.yml
   - Relevant? [ ] Yes [x] No

5. **REFACTOR-02** (score: 0.762)
   - Title: Migrate legacy callback-based code to async/await
   - Description: Modernize callback pyramid in file upload module. Convert to promises with async/await. Improve error handling and readability.
   - Files: src/upload/file-handler.ts, src/upload/file-handler.test.ts
   - Relevant? [ ] Yes [x] No

---

## Query 11: IMP-OBS-01

**Title:** Add OpenTelemetry tracing for API requests

**Description:** Instrument API layer with distributed tracing. Capture request duration, status codes, user ID. Export traces to Jaeger.

**Files:** src/tracing/tracer.ts, src/middleware/tracing.ts

### Top-5 Similar Tasks

1. **IMP-TEST-01** (score: 0.874)
   - Title: Add end-to-end tests for user registration flow
   - Description: Create Playwright tests covering registration: form validation, email verification, login after signup. Test happy path and error cases.
   - Files: e2e/registration.spec.ts, e2e/fixtures/users.ts
   - Relevant? [ ] Yes [x] No

2. **REFACTOR-01** (score: 0.836)
   - Title: Extract validation logic into reusable validators
   - Description: Validation code duplicated across 10+ files. Extract email, phone, password validators into shared utility. Add comprehensive tests.
   - Files: src/utils/validators.ts, src/utils/validators.test.ts
   - Relevant? [ ] Yes [x] No

3. **CRIT-PERF-01** (score: 0.787)
   - Title: Optimize image loading causing slow page load
   - Description: Landing page loads 20MB of unoptimized images. Add lazy loading, WebP format, responsive srcset, CDN caching. Target <3s LCP.
   - Files: src/components/ImageGallery.tsx, src/utils/image-optimizer.ts
   - Relevant? [ ] Yes [x] No

4. **IMP-API-02** (score: 0.780)
   - Title: Implement JWT authentication middleware
   - Description: Add JWT token validation middleware for protected routes. Verify token signature, check expiration, extract user claims. Handle auth errors gracefully.
   - Files: src/middleware/auth.ts, src/middleware/auth.test.ts
   - Relevant? [ ] Yes [x] No

5. **CRIT-API-01** (score: 0.774)
   - Title: Fix authentication bypass vulnerability in login endpoint
   - Description: Critical security issue: login endpoint accepts null password and grants access. Add password validation, rate limiting, and audit logging.
   - Files: src/auth/login.ts, src/auth/login.test.ts
   - Relevant? [ ] Yes [x] No

---

## Query 12: IMP-OBS-02

**Title:** Create dashboard for application health metrics

**Description:** Build metrics dashboard showing request rate, error rate, p95 latency, database connections. Add alerting for SLO violations.

**Files:** src/metrics/dashboard.tsx, src/metrics/collectors.ts

### Top-5 Similar Tasks

1. **IMP-TEST-02** (score: 0.897)
   - Title: Increase unit test coverage for payment processing
   - Description: Add tests for payment edge cases: declined cards, network timeouts, partial refunds, currency conversion. Target 90% coverage.
   - Files: src/payment/processor.test.ts, src/payment/refunds.test.ts
   - Relevant? [ ] Yes [x] No

2. **IMP-API-02** (score: 0.877)
   - Title: Implement JWT authentication middleware
   - Description: Add JWT token validation middleware for protected routes. Verify token signature, check expiration, extract user claims. Handle auth errors gracefully.
   - Files: src/middleware/auth.ts, src/middleware/auth.test.ts
   - Relevant? [ ] Yes [x] No

3. **CRIT-OBS-01** (score: 0.829)
   - Title: Fix memory leak in background job processor
   - Description: Worker process memory growing unbounded. Profile with heap snapshots, identify leak source, add proper cleanup in job handlers.
   - Files: src/workers/job-processor.ts, src/workers/cleanup.ts
   - Relevant? [ ] Yes [x] No

4. **REFACTOR-02** (score: 0.812)
   - Title: Migrate legacy callback-based code to async/await
   - Description: Modernize callback pyramid in file upload module. Convert to promises with async/await. Improve error handling and readability.
   - Files: src/upload/file-handler.ts, src/upload/file-handler.test.ts
   - Relevant? [ ] Yes [x] No

5. **CRIT-UI-01** (score: 0.808)
   - Title: Fix form submission bug causing data loss
   - Description: Users losing form data on validation error. Preserve form state on error, add auto-save to localStorage, show error messages inline.
   - Files: src/components/ContactForm.tsx, src/hooks/useFormPersistence.ts
   - Relevant? [ ] Yes [x] No

---

## Query 13: CRIT-OBS-01

**Title:** Fix memory leak in background job processor

**Description:** Worker process memory growing unbounded. Profile with heap snapshots, identify leak source, add proper cleanup in job handlers.

**Files:** src/workers/job-processor.ts, src/workers/cleanup.ts

### Top-5 Similar Tasks

1. **IMP-INFRA-01** (score: 0.854)
   - Title: Set up CI/CD pipeline with GitHub Actions
   - Description: Automate build, test, deploy workflow. Run tests on PR, deploy to staging on merge, production on tag. Add deployment notifications.
   - Files: .github/workflows/ci.yml, .github/workflows/deploy.yml
   - Relevant? [ ] Yes [x] No

2. **REFACTOR-02** (score: 0.846)
   - Title: Migrate legacy callback-based code to async/await
   - Description: Modernize callback pyramid in file upload module. Convert to promises with async/await. Improve error handling and readability.
   - Files: src/upload/file-handler.ts, src/upload/file-handler.test.ts
   - Relevant? [ ] Yes [x] No

3. **IMP-TEST-02** (score: 0.840)
   - Title: Increase unit test coverage for payment processing
   - Description: Add tests for payment edge cases: declined cards, network timeouts, partial refunds, currency conversion. Target 90% coverage.
   - Files: src/payment/processor.test.ts, src/payment/refunds.test.ts
   - Relevant? [ ] Yes [x] No

4. **IMP-DB-01** (score: 0.831)
   - Title: Add database migration for user preferences table
   - Description: Create migration to add user_preferences table with columns: user_id (FK), theme, language, timezone. Include rollback script.
   - Files: migrations/001_add_user_preferences.sql
   - Relevant? [ ] Yes [x] No

5. **IMP-OBS-02** (score: 0.829)
   - Title: Create dashboard for application health metrics
   - Description: Build metrics dashboard showing request rate, error rate, p95 latency, database connections. Add alerting for SLO violations.
   - Files: src/metrics/dashboard.tsx, src/metrics/collectors.ts
   - Relevant? [ ] Yes [x] No

---

## Query 14: REFACTOR-01

**Title:** Extract validation logic into reusable validators

**Description:** Validation code duplicated across 10+ files. Extract email, phone, password validators into shared utility. Add comprehensive tests.

**Files:** src/utils/validators.ts, src/utils/validators.test.ts

### Top-5 Similar Tasks

1. **IMP-OBS-01** (score: 0.836)
   - Title: Add OpenTelemetry tracing for API requests
   - Description: Instrument API layer with distributed tracing. Capture request duration, status codes, user ID. Export traces to Jaeger.
   - Files: src/tracing/tracer.ts, src/middleware/tracing.ts
   - Relevant? [ ] Yes [x] No

2. **IMP-TEST-01** (score: 0.829)
   - Title: Add end-to-end tests for user registration flow
   - Description: Create Playwright tests covering registration: form validation, email verification, login after signup. Test happy path and error cases.
   - Files: e2e/registration.spec.ts, e2e/fixtures/users.ts
   - Relevant? [ ] Yes [x] No

3. **IMP-UI-02** (score: 0.781)
   - Title: Add dark mode theme support
   - Description: Implement dark/light theme toggle with CSS variables. Persist theme preference in localStorage. Respect system preference (prefers-color-scheme).
   - Files: src/theme/ThemeProvider.tsx, src/styles/themes.css
   - Relevant? [ ] Yes [x] No

4. **CRIT-DB-01** (score: 0.775)
   - Title: Optimize slow query on orders table (N+1 problem)
   - Description: Orders list endpoint causing 500+ queries per request. Replace with single JOIN query. Add database index on customer_id.
   - Files: src/db/orders.ts, migrations/002_add_orders_index.sql
   - Relevant? [ ] Yes [x] No

5. **REFACTOR-02** (score: 0.765)
   - Title: Migrate legacy callback-based code to async/await
   - Description: Modernize callback pyramid in file upload module. Convert to promises with async/await. Improve error handling and readability.
   - Files: src/upload/file-handler.ts, src/upload/file-handler.test.ts
   - Relevant? [ ] Yes [x] No

---

## Query 15: REFACTOR-02

**Title:** Migrate legacy callback-based code to async/await

**Description:** Modernize callback pyramid in file upload module. Convert to promises with async/await. Improve error handling and readability.

**Files:** src/upload/file-handler.ts, src/upload/file-handler.test.ts

### Top-5 Similar Tasks

1. **CRIT-OBS-01** (score: 0.846)
   - Title: Fix memory leak in background job processor
   - Description: Worker process memory growing unbounded. Profile with heap snapshots, identify leak source, add proper cleanup in job handlers.
   - Files: src/workers/job-processor.ts, src/workers/cleanup.ts
   - Relevant? [ ] Yes [x] No

2. **CRIT-UI-01** (score: 0.816)
   - Title: Fix form submission bug causing data loss
   - Description: Users losing form data on validation error. Preserve form state on error, add auto-save to localStorage, show error messages inline.
   - Files: src/components/ContactForm.tsx, src/hooks/useFormPersistence.ts
   - Relevant? [ ] Yes [x] No

3. **IMP-INFRA-01** (score: 0.812)
   - Title: Set up CI/CD pipeline with GitHub Actions
   - Description: Automate build, test, deploy workflow. Run tests on PR, deploy to staging on merge, production on tag. Add deployment notifications.
   - Files: .github/workflows/ci.yml, .github/workflows/deploy.yml
   - Relevant? [ ] Yes [x] No

4. **IMP-OBS-02** (score: 0.812)
   - Title: Create dashboard for application health metrics
   - Description: Build metrics dashboard showing request rate, error rate, p95 latency, database connections. Add alerting for SLO violations.
   - Files: src/metrics/dashboard.tsx, src/metrics/collectors.ts
   - Relevant? [ ] Yes [x] No

5. **CRIT-API-01** (score: 0.786)
   - Title: Fix authentication bypass vulnerability in login endpoint
   - Description: Critical security issue: login endpoint accepts null password and grants access. Add password validation, rate limiting, and audit logging.
   - Files: src/auth/login.ts, src/auth/login.test.ts
   - Relevant? [ ] Yes [x] No

---

## Query 16: DOC-01

**Title:** Write deployment guide for production environment

**Description:** Document production deployment: prerequisites, environment variables, database migrations, blue-green deployment, rollback procedure.

**Files:** docs/deployment.md, docs/troubleshooting.md

### Top-5 Similar Tasks

1. **IMP-PERF-01** (score: 0.809)
   - Title: Add Redis caching for frequently accessed data
   - Description: Cache user sessions, product catalog in Redis. Implement cache invalidation on updates. Add cache hit/miss metrics.
   - Files: src/cache/redis-client.ts, src/cache/cache-strategy.ts
   - Relevant? [ ] Yes [x] No

2. **DOC-02** (score: 0.728)
   - Title: Create API reference documentation
   - Description: Generate OpenAPI/Swagger docs for all REST endpoints. Include request/response schemas, authentication, rate limits, examples.
   - Files: docs/api-reference.md, openapi.yaml
   - Relevant? [x] Yes [ ] No

3. **CRIT-DB-01** (score: 0.718)
   - Title: Optimize slow query on orders table (N+1 problem)
   - Description: Orders list endpoint causing 500+ queries per request. Replace with single JOIN query. Add database index on customer_id.
   - Files: src/db/orders.ts, migrations/002_add_orders_index.sql
   - Relevant? [ ] Yes [x] No

4. **IMP-UI-02** (score: 0.712)
   - Title: Add dark mode theme support
   - Description: Implement dark/light theme toggle with CSS variables. Persist theme preference in localStorage. Respect system preference (prefers-color-scheme).
   - Files: src/theme/ThemeProvider.tsx, src/styles/themes.css
   - Relevant? [ ] Yes [x] No

5. **CRIT-OBS-01** (score: 0.704)
   - Title: Fix memory leak in background job processor
   - Description: Worker process memory growing unbounded. Profile with heap snapshots, identify leak source, add proper cleanup in job handlers.
   - Files: src/workers/job-processor.ts, src/workers/cleanup.ts
   - Relevant? [ ] Yes [x] No

---

## Query 17: DOC-02

**Title:** Create API reference documentation

**Description:** Generate OpenAPI/Swagger docs for all REST endpoints. Include request/response schemas, authentication, rate limits, examples.

**Files:** docs/api-reference.md, openapi.yaml

### Top-5 Similar Tasks

1. **IMP-DB-01** (score: 0.825)
   - Title: Add database migration for user preferences table
   - Description: Create migration to add user_preferences table with columns: user_id (FK), theme, language, timezone. Include rollback script.
   - Files: migrations/001_add_user_preferences.sql
   - Relevant? [ ] Yes [x] No

2. **CRIT-DB-01** (score: 0.825)
   - Title: Optimize slow query on orders table (N+1 problem)
   - Description: Orders list endpoint causing 500+ queries per request. Replace with single JOIN query. Add database index on customer_id.
   - Files: src/db/orders.ts, migrations/002_add_orders_index.sql
   - Relevant? [ ] Yes [x] No

3. **IMP-UI-02** (score: 0.806)
   - Title: Add dark mode theme support
   - Description: Implement dark/light theme toggle with CSS variables. Persist theme preference in localStorage. Respect system preference (prefers-color-scheme).
   - Files: src/theme/ThemeProvider.tsx, src/styles/themes.css
   - Relevant? [ ] Yes [x] No

4. **CRIT-OBS-01** (score: 0.783)
   - Title: Fix memory leak in background job processor
   - Description: Worker process memory growing unbounded. Profile with heap snapshots, identify leak source, add proper cleanup in job handlers.
   - Files: src/workers/job-processor.ts, src/workers/cleanup.ts
   - Relevant? [ ] Yes [x] No

5. **IMP-API-02** (score: 0.781)
   - Title: Implement JWT authentication middleware
   - Description: Add JWT token validation middleware for protected routes. Verify token signature, check expiration, extract user claims. Handle auth errors gracefully.
   - Files: src/middleware/auth.ts, src/middleware/auth.test.ts
   - Relevant? [x] Yes [ ] No

---

## Query 18: CRIT-PERF-01

**Title:** Optimize image loading causing slow page load

**Description:** Landing page loads 20MB of unoptimized images. Add lazy loading, WebP format, responsive srcset, CDN caching. Target <3s LCP.

**Files:** src/components/ImageGallery.tsx, src/utils/image-optimizer.ts

### Top-5 Similar Tasks

1. **IMP-TEST-01** (score: 0.854)
   - Title: Add end-to-end tests for user registration flow
   - Description: Create Playwright tests covering registration: form validation, email verification, login after signup. Test happy path and error cases.
   - Files: e2e/registration.spec.ts, e2e/fixtures/users.ts
   - Relevant? [ ] Yes [x] No

2. **IMP-INFRA-01** (score: 0.811)
   - Title: Set up CI/CD pipeline with GitHub Actions
   - Description: Automate build, test, deploy workflow. Run tests on PR, deploy to staging on merge, production on tag. Add deployment notifications.
   - Files: .github/workflows/ci.yml, .github/workflows/deploy.yml
   - Relevant? [ ] Yes [x] No

3. **CRIT-API-01** (score: 0.788)
   - Title: Fix authentication bypass vulnerability in login endpoint
   - Description: Critical security issue: login endpoint accepts null password and grants access. Add password validation, rate limiting, and audit logging.
   - Files: src/auth/login.ts, src/auth/login.test.ts
   - Relevant? [ ] Yes [x] No

4. **CRIT-UI-01** (score: 0.788)
   - Title: Fix form submission bug causing data loss
   - Description: Users losing form data on validation error. Preserve form state on error, add auto-save to localStorage, show error messages inline.
   - Files: src/components/ContactForm.tsx, src/hooks/useFormPersistence.ts
   - Relevant? [ ] Yes [x] No

5. **IMP-OBS-01** (score: 0.787)
   - Title: Add OpenTelemetry tracing for API requests
   - Description: Instrument API layer with distributed tracing. Capture request duration, status codes, user ID. Export traces to Jaeger.
   - Files: src/tracing/tracer.ts, src/middleware/tracing.ts
   - Relevant? [ ] Yes [x] No

---

## Query 19: IMP-PERF-01

**Title:** Add Redis caching for frequently accessed data

**Description:** Cache user sessions, product catalog in Redis. Implement cache invalidation on updates. Add cache hit/miss metrics.

**Files:** src/cache/redis-client.ts, src/cache/cache-strategy.ts

### Top-5 Similar Tasks

1. **DOC-01** (score: 0.809)
   - Title: Write deployment guide for production environment
   - Description: Document production deployment: prerequisites, environment variables, database migrations, blue-green deployment, rollback procedure.
   - Files: docs/deployment.md, docs/troubleshooting.md
   - Relevant? [ ] Yes [x] No

2. **IMP-UI-02** (score: 0.791)
   - Title: Add dark mode theme support
   - Description: Implement dark/light theme toggle with CSS variables. Persist theme preference in localStorage. Respect system preference (prefers-color-scheme).
   - Files: src/theme/ThemeProvider.tsx, src/styles/themes.css
   - Relevant? [ ] Yes [x] No

3. **CRIT-DB-01** (score: 0.742)
   - Title: Optimize slow query on orders table (N+1 problem)
   - Description: Orders list endpoint causing 500+ queries per request. Replace with single JOIN query. Add database index on customer_id.
   - Files: src/db/orders.ts, migrations/002_add_orders_index.sql
   - Relevant? [ ] Yes [x] No

4. **CRIT-OBS-01** (score: 0.731)
   - Title: Fix memory leak in background job processor
   - Description: Worker process memory growing unbounded. Profile with heap snapshots, identify leak source, add proper cleanup in job handlers.
   - Files: src/workers/job-processor.ts, src/workers/cleanup.ts
   - Relevant? [ ] Yes [x] No

5. **CRIT-API-01** (score: 0.727)
   - Title: Fix authentication bypass vulnerability in login endpoint
   - Description: Critical security issue: login endpoint accepts null password and grants access. Add password validation, rate limiting, and audit logging.
   - Files: src/auth/login.ts, src/auth/login.test.ts
   - Relevant? [ ] Yes [x] No

---

## Query 20: IMP-INFRA-01

**Title:** Set up CI/CD pipeline with GitHub Actions

**Description:** Automate build, test, deploy workflow. Run tests on PR, deploy to staging on merge, production on tag. Add deployment notifications.

**Files:** .github/workflows/ci.yml, .github/workflows/deploy.yml

### Top-5 Similar Tasks

1. **CRIT-OBS-01** (score: 0.854)
   - Title: Fix memory leak in background job processor
   - Description: Worker process memory growing unbounded. Profile with heap snapshots, identify leak source, add proper cleanup in job handlers.
   - Files: src/workers/job-processor.ts, src/workers/cleanup.ts
   - Relevant? [ ] Yes [x] No

2. **CRIT-API-01** (score: 0.818)
   - Title: Fix authentication bypass vulnerability in login endpoint
   - Description: Critical security issue: login endpoint accepts null password and grants access. Add password validation, rate limiting, and audit logging.
   - Files: src/auth/login.ts, src/auth/login.test.ts
   - Relevant? [ ] Yes [x] No

3. **REFACTOR-02** (score: 0.812)
   - Title: Migrate legacy callback-based code to async/await
   - Description: Modernize callback pyramid in file upload module. Convert to promises with async/await. Improve error handling and readability.
   - Files: src/upload/file-handler.ts, src/upload/file-handler.test.ts
   - Relevant? [ ] Yes [x] No

4. **CRIT-PERF-01** (score: 0.811)
   - Title: Optimize image loading causing slow page load
   - Description: Landing page loads 20MB of unoptimized images. Add lazy loading, WebP format, responsive srcset, CDN caching. Target <3s LCP.
   - Files: src/components/ImageGallery.tsx, src/utils/image-optimizer.ts
   - Relevant? [ ] Yes [x] No

5. **IMP-TEST-01** (score: 0.803)
   - Title: Add end-to-end tests for user registration flow
   - Description: Create Playwright tests covering registration: form validation, email verification, login after signup. Test happy path and error cases.
   - Files: e2e/registration.spec.ts, e2e/fixtures/users.ts
   - Relevant? [ ] Yes [x] No

---

## Evaluation Complete

**Next Steps:**
1. Save this file with your relevance judgments marked
2. Run `python3 scripts/calculate_precision.py .` to compute metrics
3. Review precision@5 score to assess similarity search quality
