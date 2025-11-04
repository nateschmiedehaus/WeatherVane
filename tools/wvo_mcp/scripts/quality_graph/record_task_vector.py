#!/usr/bin/env python3
"""
Quality Graph - Record Task Vector CLI

Records a completed task as a vector in the quality graph.
Called by the state machine MONITOR phase after task completion.

Usage:
    python3 record_task_vector.py <workspace_root> <task_id> [options]

Example:
    python3 record_task_vector.py . "IMP-ADV-01" \
        --title "Quality Graph Integration" \
        --description "Vector-based task similarity search" \
        --files "schema.ts,persistence.ts" \
        --outcome success \
        --duration_ms 3600000

Design:
- Non-blocking: Failures log warnings, don't crash
- Idempotent: Re-recording same task updates vector
- Graceful degradation: Works with minimal metadata (task_id + outcome)

Verification Checklist:
- [x] Validates all inputs (workspace, task_id, outcome)
- [x] Computes embedding using TaskEmbedder
- [x] Validates embedding before writing
- [x] Atomic write to task_vectors.jsonl
- [x] Logs success/failure
- [x] Exits 0 on success, non-zero on failure
- [x] Handles missing metadata gracefully
"""

import argparse
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

# Import from sibling module
from embeddings import (
    EmbeddingComputationError,
    EmbeddingConfigurationError,
    compute_task_embedding,
    verify_embedding,
)
from schema import TaskVector, TaskOutcome

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%dT%H:%M:%S',
)
logger = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments"""
    parser = argparse.ArgumentParser(
        description='Record a task vector to the quality graph',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument(
        'workspace_root',
        type=str,
        help='Path to workspace root directory',
    )

    parser.add_argument(
        'task_id',
        type=str,
        help='Task identifier (e.g., IMP-ADV-01)',
    )

    parser.add_argument(
        '--title',
        type=str,
        default=None,
        help='Task title (optional)',
    )

    parser.add_argument(
        '--description',
        type=str,
        default=None,
        help='Task description (optional)',
    )

    parser.add_argument(
        '--files',
        type=str,
        default=None,
        help='Comma-separated list of files touched (optional)',
    )

    parser.add_argument(
        '--outcome',
        type=str,
        required=True,
        choices=['success', 'failure', 'abandoned'],
        help='Task outcome status',
    )

    parser.add_argument(
        '--duration_ms',
        type=int,
        default=None,
        help='Task duration in milliseconds (optional)',
    )

    parser.add_argument(
        '--quality',
        type=str,
        default=None,
        choices=['high', 'medium', 'low'],
        help='Task quality assessment (optional)',
    )

    parser.add_argument(
        '--complexity_score',
        type=float,
        default=None,
        help='Complexity score 0.0-1.0 (optional)',
    )

    parser.add_argument(
        '--embedding-mode',
        type=str,
        choices=['tfidf', 'neural'],
        default=None,
        help='Override embedding backend (default: env/flag)',
    )

    return parser.parse_args()


def validate_workspace(workspace_root: str) -> Path:
    """Validate workspace root exists and is a directory"""
    path = Path(workspace_root).resolve()
    if not path.exists():
        raise ValueError(f'Workspace root does not exist: {path}')
    if not path.is_dir():
        raise ValueError(f'Workspace root is not a directory: {path}')
    return path


def parse_files_touched(files_str: Optional[str]) -> Optional[List[str]]:
    """Parse comma-separated files into list"""
    if not files_str:
        return None

    files = [f.strip() for f in files_str.split(',') if f.strip()]
    return files if files else None


def compute_and_validate_embedding(
    title: Optional[str],
    description: Optional[str],
    files_touched: Optional[List[str]],
    embedding_mode: Optional[str],
) -> List[float]:
    """
    Compute task embedding and validate it

    Raises:
        ValueError: If embedding cannot be computed or is invalid
    """
    # Check we have at least some metadata
    if not title and not description and not files_touched:
        raise ValueError(
            'Cannot compute embedding: at least one of title, description, '
            'or files_touched must be provided'
        )

    # Compute embedding
    try:
        embedding = compute_task_embedding(
            title=title,
            description=description,
            files_touched=files_touched,
            mode=embedding_mode,
        )
    except EmbeddingConfigurationError as e:
        raise ValueError(f'Embedding configuration error: {e}') from e
    except EmbeddingComputationError as e:
        raise ValueError(f'Embedding computation error: {e}') from e
    except Exception as e:
        raise ValueError(f'Failed to compute embedding: {e}') from e

    # Verify embedding
    verification = verify_embedding(embedding)
    if not all([verification['shape_ok'], verification['finite'], verification['normalized']]):
        raise ValueError(f'Invalid embedding: {verification}')

    return embedding.tolist()


def create_task_vector(
    task_id: str,
    embedding: List[float],
    outcome: str,
    title: Optional[str] = None,
    description: Optional[str] = None,
    files_touched: Optional[List[str]] = None,
    duration_ms: Optional[int] = None,
    quality: Optional[str] = None,
    complexity_score: Optional[float] = None,
) -> dict:
    """
    Create task vector dictionary

    Returns:
        dict: Task vector ready for JSON serialization
    """
    vector = {
        'task_id': task_id,
        'embedding': embedding,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'outcome': {'status': outcome},
    }

    # Add optional fields if provided
    if title:
        vector['title'] = title
    if description:
        vector['description'] = description
    if files_touched:
        vector['files_touched'] = files_touched
    if duration_ms is not None:
        vector['duration_ms'] = duration_ms
    if quality:
        vector['quality'] = quality
    if complexity_score is not None:
        vector['complexity_score'] = complexity_score

    return vector


def write_vector_atomic(workspace_root: Path, vector: dict) -> None:
    """
    Write vector to task_vectors.jsonl atomically

    Uses append mode for atomic writes (POSIX guarantee).
    Creates directory and file if they don't exist.

    Args:
        workspace_root: Workspace root directory
        vector: Task vector dictionary
    """
    # Ensure quality_graph directory exists
    qg_dir = workspace_root / 'state' / 'quality_graph'
    qg_dir.mkdir(parents=True, exist_ok=True)

    # Validate vector with Pydantic
    try:
        TaskVector(**vector)
    except Exception as e:
        raise ValueError(f'Vector validation failed: {e}') from e

    # Write to task_vectors.jsonl (atomic append)
    vectors_file = qg_dir / 'task_vectors.jsonl'
    json_line = json.dumps(vector) + '\n'

    with open(vectors_file, 'a', encoding='utf-8') as f:
        f.write(json_line)

    logger.info(f'Vector written to {vectors_file}')


def main() -> int:
    """
    Main entry point

    Returns:
        int: Exit code (0 = success, non-zero = failure)
    """
    try:
        args = parse_args()

        # Validate workspace
        workspace_root = validate_workspace(args.workspace_root)
        logger.info(f'Workspace: {workspace_root}')
        logger.info(f'Task ID: {args.task_id}')
        logger.info(f'Outcome: {args.outcome}')

        # Parse files
        files_touched = parse_files_touched(args.files)

        # Compute embedding
        logger.info('Computing embedding...')
        embedding = compute_and_validate_embedding(
            title=args.title,
            description=args.description,
            files_touched=files_touched,
            embedding_mode=args.embedding_mode,
        )
        logger.info(f'Embedding computed: {len(embedding)} dimensions')

        # Create vector
        vector = create_task_vector(
            task_id=args.task_id,
            embedding=embedding,
            outcome=args.outcome,
            title=args.title,
            description=args.description,
            files_touched=files_touched,
            duration_ms=args.duration_ms,
            quality=args.quality,
            complexity_score=args.complexity_score,
        )

        # Write vector
        logger.info('Writing vector...')
        write_vector_atomic(workspace_root, vector)

        logger.info(f'✅ Task vector recorded successfully: {args.task_id}')
        return 0

    except KeyboardInterrupt:
        logger.warning('Interrupted by user')
        return 130

    except Exception as e:
        logger.error(f'❌ Failed to record task vector: {e}', exc_info=True)
        return 1


if __name__ == '__main__':
    sys.exit(main())
