#!/usr/bin/env python3
"""
Create Synthetic Evaluation Corpus

Generates diverse synthetic tasks with realistic titles/descriptions
for meaningful similarity evaluation.

Usage:
    python3 create_synthetic_corpus.py <workspace_root>

Example:
    python3 create_synthetic_corpus.py .
"""

import argparse
import json
import sys
from pathlib import Path
from datetime import datetime, timezone

# Add quality_graph scripts to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'tools' / 'wvo_mcp' / 'scripts' / 'quality_graph'))

from embeddings import compute_task_embedding


# Synthetic tasks representing diverse autopilot work
SYNTHETIC_TASKS = [
    # API/Backend tasks
    {
        'task_id': 'IMP-API-01',
        'title': 'Add GET /api/users endpoint with pagination',
        'description': 'Implement REST API endpoint to list users with pagination support (limit, offset). Return user ID, email, name. Include unit tests and API documentation.',
        'files_touched': ['src/api/users.ts', 'src/api/users.test.ts', 'docs/api.md'],
    },
    {
        'task_id': 'IMP-API-02',
        'title': 'Implement JWT authentication middleware',
        'description': 'Add JWT token validation middleware for protected routes. Verify token signature, check expiration, extract user claims. Handle auth errors gracefully.',
        'files_touched': ['src/middleware/auth.ts', 'src/middleware/auth.test.ts'],
    },
    {
        'task_id': 'CRIT-API-01',
        'title': 'Fix authentication bypass vulnerability in login endpoint',
        'description': 'Critical security issue: login endpoint accepts null password and grants access. Add password validation, rate limiting, and audit logging.',
        'files_touched': ['src/auth/login.ts', 'src/auth/login.test.ts'],
    },

    # Database tasks
    {
        'task_id': 'IMP-DB-01',
        'title': 'Add database migration for user preferences table',
        'description': 'Create migration to add user_preferences table with columns: user_id (FK), theme, language, timezone. Include rollback script.',
        'files_touched': ['migrations/001_add_user_preferences.sql'],
    },
    {
        'task_id': 'CRIT-DB-01',
        'title': 'Optimize slow query on orders table (N+1 problem)',
        'description': 'Orders list endpoint causing 500+ queries per request. Replace with single JOIN query. Add database index on customer_id.',
        'files_touched': ['src/db/orders.ts', 'migrations/002_add_orders_index.sql'],
    },

    # UI/Frontend tasks
    {
        'task_id': 'IMP-UI-01',
        'title': 'Build responsive navigation menu component',
        'description': 'Create navigation component with mobile hamburger menu. Support nested menu items, active link highlighting, accessibility (ARIA labels, keyboard nav).',
        'files_touched': ['src/components/Navigation.tsx', 'src/components/Navigation.test.tsx', 'src/styles/navigation.css'],
    },
    {
        'task_id': 'IMP-UI-02',
        'title': 'Add dark mode theme support',
        'description': 'Implement dark/light theme toggle with CSS variables. Persist theme preference in localStorage. Respect system preference (prefers-color-scheme).',
        'files_touched': ['src/theme/ThemeProvider.tsx', 'src/styles/themes.css'],
    },
    {
        'task_id': 'CRIT-UI-01',
        'title': 'Fix form submission bug causing data loss',
        'description': 'Users losing form data on validation error. Preserve form state on error, add auto-save to localStorage, show error messages inline.',
        'files_touched': ['src/components/ContactForm.tsx', 'src/hooks/useFormPersistence.ts'],
    },

    # Testing tasks
    {
        'task_id': 'IMP-TEST-01',
        'title': 'Add end-to-end tests for user registration flow',
        'description': 'Create Playwright tests covering registration: form validation, email verification, login after signup. Test happy path and error cases.',
        'files_touched': ['e2e/registration.spec.ts', 'e2e/fixtures/users.ts'],
    },
    {
        'task_id': 'IMP-TEST-02',
        'title': 'Increase unit test coverage for payment processing',
        'description': 'Add tests for payment edge cases: declined cards, network timeouts, partial refunds, currency conversion. Target 90% coverage.',
        'files_touched': ['src/payment/processor.test.ts', 'src/payment/refunds.test.ts'],
    },

    # Observability/Monitoring tasks
    {
        'task_id': 'IMP-OBS-01',
        'title': 'Add OpenTelemetry tracing for API requests',
        'description': 'Instrument API layer with distributed tracing. Capture request duration, status codes, user ID. Export traces to Jaeger.',
        'files_touched': ['src/tracing/tracer.ts', 'src/middleware/tracing.ts'],
    },
    {
        'task_id': 'IMP-OBS-02',
        'title': 'Create dashboard for application health metrics',
        'description': 'Build metrics dashboard showing request rate, error rate, p95 latency, database connections. Add alerting for SLO violations.',
        'files_touched': ['src/metrics/dashboard.tsx', 'src/metrics/collectors.ts'],
    },
    {
        'task_id': 'CRIT-OBS-01',
        'title': 'Fix memory leak in background job processor',
        'description': 'Worker process memory growing unbounded. Profile with heap snapshots, identify leak source, add proper cleanup in job handlers.',
        'files_touched': ['src/workers/job-processor.ts', 'src/workers/cleanup.ts'],
    },

    # Refactoring tasks
    {
        'task_id': 'REFACTOR-01',
        'title': 'Extract validation logic into reusable validators',
        'description': 'Validation code duplicated across 10+ files. Extract email, phone, password validators into shared utility. Add comprehensive tests.',
        'files_touched': ['src/utils/validators.ts', 'src/utils/validators.test.ts'],
    },
    {
        'task_id': 'REFACTOR-02',
        'title': 'Migrate legacy callback-based code to async/await',
        'description': 'Modernize callback pyramid in file upload module. Convert to promises with async/await. Improve error handling and readability.',
        'files_touched': ['src/upload/file-handler.ts', 'src/upload/file-handler.test.ts'],
    },

    # Documentation tasks
    {
        'task_id': 'DOC-01',
        'title': 'Write deployment guide for production environment',
        'description': 'Document production deployment: prerequisites, environment variables, database migrations, blue-green deployment, rollback procedure.',
        'files_touched': ['docs/deployment.md', 'docs/troubleshooting.md'],
    },
    {
        'task_id': 'DOC-02',
        'title': 'Create API reference documentation',
        'description': 'Generate OpenAPI/Swagger docs for all REST endpoints. Include request/response schemas, authentication, rate limits, examples.',
        'files_touched': ['docs/api-reference.md', 'openapi.yaml'],
    },

    # Performance tasks
    {
        'task_id': 'CRIT-PERF-01',
        'title': 'Optimize image loading causing slow page load',
        'description': 'Landing page loads 20MB of unoptimized images. Add lazy loading, WebP format, responsive srcset, CDN caching. Target <3s LCP.',
        'files_touched': ['src/components/ImageGallery.tsx', 'src/utils/image-optimizer.ts'],
    },
    {
        'task_id': 'IMP-PERF-01',
        'title': 'Add Redis caching for frequently accessed data',
        'description': 'Cache user sessions, product catalog in Redis. Implement cache invalidation on updates. Add cache hit/miss metrics.',
        'files_touched': ['src/cache/redis-client.ts', 'src/cache/cache-strategy.ts'],
    },

    # Infrastructure tasks
    {
        'task_id': 'IMP-INFRA-01',
        'title': 'Set up CI/CD pipeline with GitHub Actions',
        'description': 'Automate build, test, deploy workflow. Run tests on PR, deploy to staging on merge, production on tag. Add deployment notifications.',
        'files_touched': ['.github/workflows/ci.yml', '.github/workflows/deploy.yml'],
    },
]


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments"""
    parser = argparse.ArgumentParser(
        description='Create synthetic evaluation corpus',
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


def create_synthetic_corpus(workspace_root: Path, output_path: Path):
    """
    Create synthetic corpus with diverse tasks

    Args:
        workspace_root: Workspace root directory
        output_path: Output corpus file path
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f'Creating synthetic corpus with {len(SYNTHETIC_TASKS)} tasks...')
    print()

    vectors = []

    for i, task in enumerate(SYNTHETIC_TASKS, 1):
        task_id = task['task_id']
        print(f'[{i}/{len(SYNTHETIC_TASKS)}] {task_id}: {task["title"][:50]}...')

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
                'synthetic': True,  # Mark as synthetic for filtering
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
    print(f'✅ Created synthetic corpus: {output_path}')
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
        create_synthetic_corpus(workspace_root, output_path)

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
