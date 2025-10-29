#!/usr/bin/env python3
"""
Automated Relevance Evaluation

Objectively evaluates similarity search results using clear relevance criteria.

Relevance criteria:
- Highly Relevant (1.0): Same domain, similar technical approach, reusable code/patterns
- Somewhat Relevant (0.5): Related domain, tangentially useful context
- Not Relevant (0.0): Unrelated domain, no useful connection

Usage:
    python3 automated_evaluation.py <workspace_root>
"""

import argparse
import json
import sys
from pathlib import Path
from typing import List, Dict, Any


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments"""
    parser = argparse.ArgumentParser(
        description='Automated relevance evaluation',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument(
        'workspace_root',
        type=str,
        help='Path to workspace root directory',
    )

    return parser.parse_args()


def extract_domain(task_id: str) -> str:
    """Extract domain from task ID (e.g., IMP-API-01 → API)"""
    parts = task_id.split('-')
    if len(parts) >= 2:
        return parts[1]  # API, DB, UI, TEST, OBS, etc.
    return 'UNKNOWN'


def extract_keywords(text: str) -> set:
    """Extract meaningful keywords from description"""
    # Convert to lowercase
    text_lower = text.lower()

    # Technical keywords that indicate similarity
    keywords = set()

    # Programming concepts
    if 'authentication' in text_lower or 'auth' in text_lower or 'jwt' in text_lower or 'token' in text_lower:
        keywords.add('authentication')
    if 'database' in text_lower or 'sql' in text_lower or 'query' in text_lower or 'migration' in text_lower:
        keywords.add('database')
    if 'api' in text_lower or 'endpoint' in text_lower or 'rest' in text_lower:
        keywords.add('api')
    if 'test' in text_lower or 'coverage' in text_lower or 'playwright' in text_lower:
        keywords.add('testing')
    if 'performance' in text_lower or 'optimize' in text_lower or 'slow' in text_lower or 'cache' in text_lower:
        keywords.add('performance')
    if 'security' in text_lower or 'vulnerability' in text_lower or 'injection' in text_lower:
        keywords.add('security')
    if 'ui' in text_lower or 'frontend' in text_lower or 'component' in text_lower or 'react' in text_lower:
        keywords.add('ui')
    if 'redis' in text_lower or 'cache' in text_lower or 'caching' in text_lower:
        keywords.add('caching')
    if 'monitoring' in text_lower or 'observability' in text_lower or 'metrics' in text_lower or 'tracing' in text_lower:
        keywords.add('observability')
    if 'deployment' in text_lower or 'ci/cd' in text_lower or 'pipeline' in text_lower:
        keywords.add('deployment')
    if 'documentation' in text_lower or 'docs' in text_lower or 'openapi' in text_lower:
        keywords.add('documentation')
    if 'refactor' in text_lower or 'cleanup' in text_lower or 'migrate' in text_lower:
        keywords.add('refactoring')
    if 'validation' in text_lower or 'validator' in text_lower:
        keywords.add('validation')
    if 'pagination' in text_lower:
        keywords.add('pagination')
    if 'error' in text_lower or 'exception' in text_lower or 'handling' in text_lower:
        keywords.add('error-handling')
    if 'memory' in text_lower or 'leak' in text_lower:
        keywords.add('memory')
    if 'async' in text_lower or 'await' in text_lower or 'promise' in text_lower or 'callback' in text_lower:
        keywords.add('async-programming')

    return keywords


def evaluate_relevance(query_task: Dict[str, Any], similar_task: Dict[str, Any]) -> float:
    """
    Evaluate relevance of similar_task to query_task

    Returns:
        1.0 = Highly relevant
        0.5 = Somewhat relevant
        0.0 = Not relevant
    """
    query_domain = extract_domain(query_task.get('task_id', ''))
    similar_domain = extract_domain(similar_task.get('task_id', ''))

    query_text = (query_task.get('title', '') + ' ' + query_task.get('description', '')).lower()
    similar_text = (similar_task.get('title', '') + ' ' + similar_task.get('description', '')).lower()

    query_keywords = extract_keywords(query_text)
    similar_keywords = extract_keywords(similar_text)

    # Same domain = strong signal
    same_domain = query_domain == similar_domain

    # Keyword overlap
    keyword_overlap = len(query_keywords & similar_keywords)
    keyword_union = len(query_keywords | similar_keywords)
    keyword_jaccard = keyword_overlap / keyword_union if keyword_union > 0 else 0

    # Evaluate relevance
    if same_domain and keyword_jaccard >= 0.4:
        # Same domain + high keyword overlap = highly relevant
        return 1.0
    elif keyword_jaccard >= 0.5:
        # High keyword overlap even across domains = highly relevant
        return 1.0
    elif same_domain or keyword_jaccard >= 0.25:
        # Same domain OR moderate keyword overlap = somewhat relevant
        return 0.5
    else:
        # Different domain and low keyword overlap = not relevant
        return 0.0


def evaluate_all_results(results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Evaluate all similarity results"""
    evaluations = []

    print(f'Evaluating {len(results)} queries...')
    print()

    for i, result in enumerate(results, 1):
        query_task = result['query_task']
        similar_tasks = result['similar_tasks']

        query_id = query_task.get('task_id')
        print(f'[{i}/{len(results)}] Evaluating: {query_id}')

        judgments = []
        for similar_task in similar_tasks:
            relevance = evaluate_relevance(query_task, similar_task)
            judgments.append({
                'task_id': similar_task.get('task_id'),
                'title': similar_task.get('title'),
                'similarity': similar_task.get('similarity'),
                'relevance': relevance,
                'relevant': relevance >= 0.5,  # Binary: relevant if ≥0.5
            })

        # Calculate precision for this query
        relevant_count = sum(1 for j in judgments if j['relevant'])
        precision = relevant_count / len(judgments) if judgments else 0.0

        print(f'  Relevant: {relevant_count}/{len(judgments)} (precision: {precision:.2f})')

        evaluations.append({
            'query_id': i,
            'query_task_id': query_id,
            'query_title': query_task.get('title'),
            'judgments': judgments,
            'precision': precision,
        })

    return evaluations


def calculate_metrics(evaluations: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Calculate aggregate precision metrics"""
    precisions = [e['precision'] for e in evaluations]

    if not precisions:
        return {
            'mean_precision': 0.0,
            'queries_evaluated': 0,
            'total_relevant': 0,
            'total_judged': 0,
        }

    import statistics

    mean_precision = statistics.mean(precisions)
    stddev_precision = statistics.stdev(precisions) if len(precisions) > 1 else 0.0
    min_precision = min(precisions)
    max_precision = max(precisions)

    total_relevant = sum(sum(1 for j in e['judgments'] if j['relevant']) for e in evaluations)
    total_judged = sum(len(e['judgments']) for e in evaluations)

    return {
        'mean_precision': mean_precision,
        'stddev_precision': stddev_precision,
        'min_precision': min_precision,
        'max_precision': max_precision,
        'queries_evaluated': len(evaluations),
        'total_relevant': total_relevant,
        'total_judged': total_judged,
    }


def main() -> int:
    """Main entry point"""
    try:
        args = parse_args()

        workspace_root = Path(args.workspace_root).resolve()
        if not workspace_root.exists():
            raise ValueError(f'Workspace root does not exist: {workspace_root}')

        results_path = workspace_root / 'state' / 'evidence' / 'IMP-ADV-01.3' / 'similarity_results.json'
        output_path = workspace_root / 'state' / 'evidence' / 'IMP-ADV-01.3' / 'automated_evaluation.json'
        metrics_path = workspace_root / 'state' / 'evidence' / 'IMP-ADV-01.3' / 'metrics.json'

        if not results_path.exists():
            raise FileNotFoundError(f'Results not found: {results_path}')

        # Load results
        with open(results_path, 'r') as f:
            results = json.load(f)

        print(f'Loaded {len(results)} query results')
        print()

        # Evaluate
        evaluations = evaluate_all_results(results)

        # Calculate metrics
        print()
        print('Calculating aggregate metrics...')
        metrics = calculate_metrics(evaluations)

        # Write evaluation
        with open(output_path, 'w') as f:
            json.dump(evaluations, f, indent=2)
        print(f'Wrote evaluation to {output_path}')

        # Write metrics
        with open(metrics_path, 'w') as f:
            json.dump(metrics, f, indent=2)
        print(f'Wrote metrics to {metrics_path}')

        # Print summary
        print()
        print('=' * 60)
        print('Automated Evaluation Results')
        print('=' * 60)
        print()
        print(f'Mean Precision@5:    {metrics["mean_precision"]:.3f}')
        print(f'Std Deviation:       {metrics["stddev_precision"]:.3f}')
        print(f'Min Precision:       {metrics["min_precision"]:.3f}')
        print(f'Max Precision:       {metrics["max_precision"]:.3f}')
        print()
        print(f'Queries Evaluated:   {metrics["queries_evaluated"]}')
        print(f'Results Judged:      {metrics["total_judged"]}')
        print(f'Total Relevant:      {metrics["total_relevant"]}')
        print()

        # Interpretation
        mean_p = metrics['mean_precision']
        if mean_p >= 0.7:
            quality = 'EXCELLENT'
            interpretation = 'TF-IDF similarity search working very well'
        elif mean_p >= 0.6:
            quality = 'GOOD'
            interpretation = 'TF-IDF similarity search working well, ready for production'
        elif mean_p >= 0.5:
            quality = 'ACCEPTABLE'
            interpretation = 'TF-IDF similarity search meets minimum threshold'
        else:
            quality = 'POOR'
            interpretation = 'TF-IDF similarity search needs improvement'

        print(f'Quality Assessment:  {quality}')
        print(f'Interpretation:      {interpretation}')
        print()
        print('=' * 60)

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
