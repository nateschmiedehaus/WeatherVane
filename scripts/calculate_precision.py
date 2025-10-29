#!/usr/bin/env python3
"""
Calculate Precision Metrics

Parses evaluation template with relevance judgments and computes precision@5.

Usage:
    python3 calculate_precision.py <workspace_root>

Example:
    python3 calculate_precision.py .
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import List, Dict, Any, Tuple
import statistics


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments"""
    parser = argparse.ArgumentParser(
        description='Calculate precision metrics from evaluation template',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument(
        'workspace_root',
        type=str,
        help='Path to workspace root directory',
    )

    parser.add_argument(
        '--input',
        type=str,
        default='state/evidence/IMP-ADV-01.3/evaluation_template.md',
        help='Input evaluation template (with judgments)',
    )

    parser.add_argument(
        '--output',
        type=str,
        default='state/evidence/IMP-ADV-01.3/metrics.json',
        help='Output metrics file',
    )

    return parser.parse_args()


def parse_evaluation_template(template_path: Path) -> List[Dict[str, Any]]:
    """
    Parse evaluation template markdown to extract relevance judgments

    Returns:
        List of query result dictionaries with relevance judgments
    """
    with open(template_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Split by query sections
    query_sections = re.split(r'## Query \d+:', content)[1:]  # Skip header

    results = []

    for i, section in enumerate(query_sections, 1):
        # Extract query task ID
        task_id_match = re.search(r'^([A-Z-]+\d+)', section.strip())
        if not task_id_match:
            print(f'Warning: Could not extract task ID from Query {i}', file=sys.stderr)
            continue

        task_id = task_id_match.group(1)

        # Extract relevance judgments
        # Pattern: "Relevant? [x] Yes [ ] No" or "Relevant? [ ] Yes [x] No"
        judgments = []
        for line in section.split('\n'):
            if 'Relevant?' in line:
                # Check if Yes is marked
                if '[x] Yes' in line or '[X] Yes' in line:
                    judgments.append(1)  # Relevant
                elif '[x] No' in line or '[X] No' in line:
                    judgments.append(0)  # Not relevant
                else:
                    # Not judged yet
                    judgments.append(None)

        # Filter out None (unjudged)
        judged_count = sum(1 for j in judgments if j is not None)

        if judged_count == 0:
            print(f'Warning: Query {i} ({task_id}) has no judgments', file=sys.stderr)

        results.append({
            'query_id': i,
            'task_id': task_id,
            'judgments': judgments,
            'judged_count': judged_count,
            'total_results': len(judgments),
        })

    return results


def calculate_precision(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Calculate precision@5 metrics

    Args:
        results: List of query results with judgments

    Returns:
        Dictionary with precision metrics
    """
    precisions = []

    for result in results:
        judgments = result.get('judgments', [])

        # Filter out None (unjudged)
        valid_judgments = [j for j in judgments if j is not None]

        if not valid_judgments:
            # No judgments for this query, skip
            continue

        # Precision@K = (# relevant) / K
        relevant_count = sum(valid_judgments)
        k = len(valid_judgments)
        precision = relevant_count / k if k > 0 else 0.0

        precisions.append({
            'query_id': result.get('query_id'),
            'task_id': result.get('task_id'),
            'relevant': relevant_count,
            'total': k,
            'precision': precision,
        })

    # Aggregate metrics
    if not precisions:
        return {
            'mean_precision': 0.0,
            'stddev_precision': 0.0,
            'min_precision': 0.0,
            'max_precision': 0.0,
            'queries_evaluated': 0,
            'total_results_judged': 0,
            'total_relevant': 0,
            'per_query_precision': [],
        }

    precision_values = [p['precision'] for p in precisions]

    return {
        'mean_precision': statistics.mean(precision_values),
        'stddev_precision': statistics.stdev(precision_values) if len(precision_values) > 1 else 0.0,
        'min_precision': min(precision_values),
        'max_precision': max(precision_values),
        'queries_evaluated': len(precisions),
        'total_results_judged': sum(p['total'] for p in precisions),
        'total_relevant': sum(p['relevant'] for p in precisions),
        'per_query_precision': precisions,
    }


def write_metrics(metrics: Dict[str, Any], output_path: Path):
    """Write metrics to JSON file"""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(metrics, f, indent=2)

    print(f'Wrote metrics to {output_path}')


def print_summary(metrics: Dict[str, Any]):
    """Print human-readable summary"""
    print()
    print('=' * 60)
    print('Precision@5 Evaluation Results')
    print('=' * 60)
    print()
    print(f'Mean Precision@5:    {metrics["mean_precision"]:.3f}')
    print(f'Std Deviation:       {metrics["stddev_precision"]:.3f}')
    print(f'Min Precision:       {metrics["min_precision"]:.3f}')
    print(f'Max Precision:       {metrics["max_precision"]:.3f}')
    print()
    print(f'Queries Evaluated:   {metrics["queries_evaluated"]}')
    print(f'Results Judged:      {metrics["total_results_judged"]}')
    print(f'Total Relevant:      {metrics["total_relevant"]}')
    print()

    # Interpretation
    mean_p = metrics['mean_precision']
    if mean_p >= 0.7:
        quality = 'EXCELLENT'
        interpretation = 'TF-IDF similarity search is working very well'
    elif mean_p >= 0.6:
        quality = 'GOOD'
        interpretation = 'TF-IDF similarity search is working well, ready for IMP-ADV-01.2'
    elif mean_p >= 0.5:
        quality = 'ACCEPTABLE'
        interpretation = 'TF-IDF similarity search meets minimum threshold'
    else:
        quality = 'POOR'
        interpretation = 'TF-IDF similarity search needs improvement (consider neural embeddings)'

    print(f'Quality Assessment:  {quality}')
    print(f'Interpretation:      {interpretation}')
    print()
    print('=' * 60)


def main() -> int:
    """Main entry point"""
    try:
        args = parse_args()

        workspace_root = Path(args.workspace_root).resolve()
        if not workspace_root.exists():
            raise ValueError(f'Workspace root does not exist: {workspace_root}')

        input_path = Path(args.input) if args.input.startswith('/') else workspace_root / args.input
        output_path = Path(args.output) if args.output.startswith('/') else workspace_root / args.output

        if not input_path.exists():
            raise FileNotFoundError(f'Evaluation template not found: {input_path}')

        print(f'Workspace: {workspace_root}')
        print(f'Input: {input_path}')
        print(f'Output: {output_path}')
        print()

        # Parse template
        print('Parsing evaluation template...')
        results = parse_evaluation_template(input_path)
        print(f'Parsed {len(results)} query results')

        # Calculate metrics
        print('Calculating precision metrics...')
        metrics = calculate_precision(results)

        # Write metrics
        write_metrics(metrics, output_path)

        # Print summary
        print_summary(metrics)

        # Check if all queries were evaluated
        if metrics['queries_evaluated'] < len(results):
            print(f'⚠️  Warning: Only {metrics["queries_evaluated"]} of {len(results)} queries have judgments', file=sys.stderr)
            print(f'   Please complete all relevance judgments before final analysis', file=sys.stderr)
            return 1

        print('✅ Metrics calculation complete')

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
