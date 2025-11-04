#!/usr/bin/env python3
"""
Quality Graph - Query Similar Tasks CLI

Queries the quality graph for tasks similar to a given task.
Used by PLAN phase to provide hints from past similar tasks.

Usage:
    python3 query_similar_tasks.py <workspace_root> [options]

Example:
    python3 query_similar_tasks.py . \
        --title "Add user authentication" \
        --description "Implement JWT-based auth" \
        --files "src/auth.ts,src/middleware.ts" \
        --k 5 \
        --min-similarity 0.3

Design:
- Computes embedding for query task
- Finds top-K most similar tasks in corpus
- Returns JSON with similar tasks and metadata
- Graceful degradation: returns empty list if corpus empty

Verification Checklist:
- [x] Computes embedding for query task
- [x] Queries similarity index
- [x] Returns top-K sorted by similarity
- [x] Filters by similarity threshold
- [x] Handles empty corpus gracefully
- [x] Outputs valid JSON
"""

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import List, Optional, Dict, Any

# Import from sibling modules
from embeddings import (
    EmbeddingComputationError,
    EmbeddingConfigurationError,
    compute_task_embedding,
)
from schema import TaskVector

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
        description='Query similar tasks from the quality graph',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument(
        'workspace_root',
        type=str,
        help='Path to workspace root directory',
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
        help='Comma-separated list of files (optional)',
    )

    parser.add_argument(
        '--k',
        type=int,
        default=5,
        help='Number of similar tasks to return (default: 5)',
    )

    parser.add_argument(
        '--min-similarity',
        type=float,
        default=0.3,
        help='Minimum similarity threshold 0.0-1.0 (default: 0.3)',
    )

    parser.add_argument(
        '--success-only',
        action='store_true',
        help='Only return successful tasks',
    )

    parser.add_argument(
        '--exclude-abandoned',
        action='store_true',
        default=True,
        help='Exclude abandoned tasks (default: true)',
    )

    parser.add_argument(
        '--embedding-mode',
        type=str,
        choices=['tfidf', 'neural'],
        default=None,
        help='Override embedding backend (default: env/flag)',
    )

    return parser.parse_args()


def parse_files(files_str: Optional[str]) -> Optional[List[str]]:
    """Parse comma-separated files into list"""
    if not files_str:
        return None
    files = [f.strip() for f in files_str.split(',') if f.strip()]
    return files if files else None


def load_vectors(workspace_root: Path) -> List[Dict[str, Any]]:
    """
    Load all task vectors from quality graph

    Returns:
        List of task vector dictionaries
    """
    vectors_file = workspace_root / 'state' / 'quality_graph' / 'task_vectors.jsonl'

    if not vectors_file.exists():
        logger.warning(f'Task vectors file not found: {vectors_file}')
        return []

    vectors = []
    with open(vectors_file, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue

            try:
                vector = json.loads(line)
                # Validate with Pydantic
                TaskVector(**vector)
                vectors.append(vector)
            except Exception as e:
                logger.warning(f'Skipping invalid vector at line {line_num}: {e}')
                continue

    logger.info(f'Loaded {len(vectors)} task vectors')
    return vectors


def compute_cosine_similarity(v1: List[float], v2: List[float]) -> float:
    """
    Compute cosine similarity between two vectors

    Assumes vectors are unit-normalized (L2 norm = 1.0)
    """
    if len(v1) != len(v2):
        raise ValueError(f'Vector dimension mismatch: {len(v1)} vs {len(v2)}')

    dot_product = sum(a * b for a, b in zip(v1, v2))
    # Clamp to [0, 1] for floating point errors
    return max(0.0, min(1.0, dot_product))


def find_similar_tasks(
    query_embedding: List[float],
    corpus: List[Dict[str, Any]],
    k: int = 5,
    min_similarity: float = 0.3,
    success_only: bool = False,
    exclude_abandoned: bool = True,
) -> List[Dict[str, Any]]:
    """
    Find top-K similar tasks to query

    Args:
        query_embedding: Query task embedding
        corpus: List of task vectors
        k: Number of results to return
        min_similarity: Minimum similarity threshold
        success_only: Only return successful tasks
        exclude_abandoned: Exclude abandoned tasks

    Returns:
        List of similar tasks with similarity scores
    """
    similarities = []

    for vector in corpus:
        # Apply filters
        status = vector.get('outcome', {}).get('status', '')

        if success_only and status != 'success':
            continue

        if exclude_abandoned and status == 'abandoned':
            continue

        # Compute similarity
        embedding = vector.get('embedding', [])
        if len(embedding) != len(query_embedding):
            logger.warning(f'Skipping vector {vector.get("task_id")} with wrong dimensions')
            continue

        similarity = compute_cosine_similarity(query_embedding, embedding)

        # Filter by threshold
        if similarity < min_similarity:
            continue

        similarities.append({
            'task_id': vector.get('task_id'),
            'title': vector.get('title'),
            'description': vector.get('description'),
            'files_touched': vector.get('files_touched'),
            'outcome': vector.get('outcome'),
            'duration_ms': vector.get('duration_ms'),
            'quality': vector.get('quality'),
            'complexity_score': vector.get('complexity_score'),
            'similarity': similarity,
            'is_confident': similarity > 0.5,
        })

    # Sort by similarity descending
    similarities.sort(key=lambda x: x['similarity'], reverse=True)

    # Return top-K
    return similarities[:k]


def format_output(similar_tasks: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Format output as JSON

    Returns:
        Dictionary with query results
    """
    return {
        'success': True,
        'count': len(similar_tasks),
        'similar_tasks': similar_tasks,
    }


def main() -> int:
    """
    Main entry point

    Returns:
        Exit code (0 = success, non-zero = failure)
    """
    try:
        args = parse_args()

        workspace_root = Path(args.workspace_root).resolve()
        if not workspace_root.exists():
            raise ValueError(f'Workspace root does not exist: {workspace_root}')

        # Check we have at least some metadata
        if not args.title and not args.description and not args.files:
            raise ValueError('At least one of --title, --description, or --files must be provided')

        # Parse files
        files_touched = parse_files(args.files)

        # Compute query embedding
        logger.info('Computing query embedding...')
        try:
            query_embedding_array = compute_task_embedding(
                title=args.title,
                description=args.description,
                files_touched=files_touched,
                mode=args.embedding_mode,
            )
        except EmbeddingConfigurationError as error:
            logger.error('Embedding configuration error: %s', error)
            return 1
        except EmbeddingComputationError as error:
            logger.error('Embedding computation error: %s', error)
            return 1
        query_embedding = query_embedding_array.tolist()
        logger.info(f'Query embedding computed: {len(query_embedding)} dimensions')

        # Load corpus
        logger.info('Loading task vectors...')
        corpus = load_vectors(workspace_root)

        if not corpus:
            logger.warning('Corpus is empty, returning no results')
            output = format_output([])
            print(json.dumps(output, indent=2))
            return 0

        # Find similar tasks
        logger.info(f'Searching for top-{args.k} similar tasks...')
        similar_tasks = find_similar_tasks(
            query_embedding=query_embedding,
            corpus=corpus,
            k=args.k,
            min_similarity=args.min_similarity,
            success_only=args.success_only,
            exclude_abandoned=args.exclude_abandoned,
        )

        logger.info(f'Found {len(similar_tasks)} similar tasks')

        # Output results
        output = format_output(similar_tasks)
        print(json.dumps(output, indent=2))

        return 0

    except KeyboardInterrupt:
        logger.warning('Interrupted by user')
        return 130

    except Exception as e:
        logger.error(f'Error querying similar tasks: {e}', exc_info=True)
        # Output error as JSON for consistent parsing
        error_output = {
            'success': False,
            'error': str(e),
            'count': 0,
            'similar_tasks': [],
        }
        print(json.dumps(error_output, indent=2))
        return 1


if __name__ == '__main__':
    sys.exit(main())
