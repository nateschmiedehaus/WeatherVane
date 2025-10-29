#!/usr/bin/env python3
"""
Run Similarity Evaluation Queries

Queries top-5 similar tasks for all sampled evaluation tasks.
Collects results for manual relevance judgment.

Usage:
    python3 run_similarity_evaluation.py <workspace_root>

Example:
    python3 run_similarity_evaluation.py .
"""

import argparse
import json
import sys
from pathlib import Path
from typing import List, Dict, Any

# Import from quality_graph scripts
sys.path.insert(0, str(Path(__file__).parent.parent / 'tools' / 'wvo_mcp' / 'scripts' / 'quality_graph'))

from embeddings import compute_task_embedding
from query_similar_tasks import load_vectors, find_similar_tasks


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments"""
    parser = argparse.ArgumentParser(
        description='Run similarity queries for evaluation',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument(
        'workspace_root',
        type=str,
        help='Path to workspace root directory',
    )

    parser.add_argument(
        '--sample',
        type=str,
        default='state/evidence/IMP-ADV-01.3/sample_tasks.json',
        help='Sample tasks file path',
    )

    parser.add_argument(
        '--output',
        type=str,
        default='state/evidence/IMP-ADV-01.3/similarity_results.json',
        help='Output results file path',
    )

    parser.add_argument(
        '--k',
        type=int,
        default=5,
        help='Number of similar tasks per query (default: 5)',
    )

    return parser.parse_args()


def run_evaluation_queries(
    workspace_root: Path,
    sample_tasks: List[Dict[str, Any]],
    k: int = 5,
) -> List[Dict[str, Any]]:
    """
    Run similarity queries for all sampled tasks

    Args:
        workspace_root: Workspace root directory
        sample_tasks: List of sampled tasks to query
        k: Number of neighbors per query

    Returns:
        List of query results
    """
    # Load corpus once (reuse for all queries)
    print('Loading corpus...')
    corpus = load_vectors(workspace_root)
    print(f'Corpus: {len(corpus)} vectors')

    results = []

    for i, task in enumerate(sample_tasks, 1):
        task_id = task.get('task_id')
        print(f'[{i}/{len(sample_tasks)}] Querying: {task_id}')

        # Compute query embedding
        metadata = {
            'title': task.get('title'),
            'description': task.get('description'),
            'files_touched': task.get('files_touched'),
        }

        try:
            query_embedding = compute_task_embedding(metadata)
            query_embedding = query_embedding.tolist()

            # Find similar tasks (exclude self-reference by filtering task_id)
            similar_tasks = find_similar_tasks(
                query_embedding=query_embedding,
                corpus=corpus,
                k=k + 1,  # Request k+1 in case query task is in corpus
                min_similarity=0.0,  # No threshold (want to see all top-K)
                success_only=False,
                exclude_abandoned=False,
            )

            # Remove self-reference if present
            similar_tasks = [t for t in similar_tasks if t.get('task_id') != task_id][:k]

            result = {
                'query_task': {
                    'task_id': task_id,
                    'title': task.get('title'),
                    'description': task.get('description'),
                    'files_touched': task.get('files_touched'),
                },
                'similar_tasks': similar_tasks,
                'count': len(similar_tasks),
            }

            results.append(result)

            print(f'  Found {len(similar_tasks)} similar tasks')

        except Exception as e:
            print(f'  ERROR: {e}', file=sys.stderr)
            # Record error but continue
            results.append({
                'query_task': {
                    'task_id': task_id,
                    'title': task.get('title'),
                    'description': task.get('description'),
                },
                'similar_tasks': [],
                'count': 0,
                'error': str(e),
            })

    return results


def write_results(results: List[Dict[str, Any]], output_path: Path):
    """Write evaluation results to JSON file"""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2)

    print(f'\nWrote {len(results)} query results to {output_path}')


def main() -> int:
    """Main entry point"""
    try:
        args = parse_args()

        workspace_root = Path(args.workspace_root).resolve()
        if not workspace_root.exists():
            raise ValueError(f'Workspace root does not exist: {workspace_root}')

        sample_path = Path(args.sample) if args.sample.startswith('/') else workspace_root / args.sample
        output_path = Path(args.output) if args.output.startswith('/') else workspace_root / args.output

        if not sample_path.exists():
            raise FileNotFoundError(f'Sample tasks file not found: {sample_path}')

        print(f'Workspace: {workspace_root}')
        print(f'Sample: {sample_path}')
        print(f'Output: {output_path}')
        print(f'Top-K: {args.k}')
        print()

        # Load sample tasks
        with open(sample_path, 'r', encoding='utf-8') as f:
            sample_tasks = json.load(f)

        print(f'Sample size: {len(sample_tasks)} tasks')
        print()

        # Run queries
        results = run_evaluation_queries(workspace_root, sample_tasks, args.k)

        # Write results
        write_results(results, output_path)

        # Summary
        total_neighbors = sum(r.get('count', 0) for r in results)
        errors = sum(1 for r in results if 'error' in r)

        print()
        print('✅ Evaluation queries complete')
        print(f'   Queries: {len(results)}')
        print(f'   Total neighbors: {total_neighbors}')
        print(f'   Errors: {errors}')

        return 0 if errors == 0 else 1

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
