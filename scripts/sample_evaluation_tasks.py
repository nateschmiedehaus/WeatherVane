#!/usr/bin/env python3
"""
Sample Evaluation Tasks for Similarity Quality Assessment

Selects 20 diverse tasks from quality graph corpus for manual evaluation.
Uses stratified sampling by numeric ID to ensure coverage.

Usage:
    python3 sample_evaluation_tasks.py <workspace_root> [--output path]

Example:
    python3 sample_evaluation_tasks.py . --output state/evidence/IMP-ADV-01.3/sample_tasks.json
"""

import argparse
import json
import sys
from pathlib import Path
from typing import List, Dict, Any
import re


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments"""
    parser = argparse.ArgumentParser(
        description='Sample diverse tasks for similarity evaluation',
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
        default='state/evidence/IMP-ADV-01.3/sample_tasks.json',
        help='Output file path (default: state/evidence/IMP-ADV-01.3/sample_tasks.json)',
    )

    parser.add_argument(
        '--count',
        type=int,
        default=20,
        help='Number of tasks to sample (default: 20)',
    )

    return parser.parse_args()


def load_corpus(workspace_root: Path) -> List[Dict[str, Any]]:
    """
    Load all task vectors from corpus

    Returns:
        List of task dictionaries
    """
    vectors_file = workspace_root / 'state' / 'quality_graph' / 'task_vectors.jsonl'

    if not vectors_file.exists():
        raise FileNotFoundError(f'Corpus not found: {vectors_file}')

    tasks = []
    with open(vectors_file, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                task = json.loads(line)
                tasks.append(task)
            except Exception as e:
                print(f'Warning: Failed to parse line: {e}', file=sys.stderr)
                continue

    print(f'Loaded {len(tasks)} tasks from corpus')
    return tasks


def extract_numeric_id(task_id: str) -> int:
    """
    Extract numeric ID from task identifier

    Examples:
        PERF-TEST-0 → 0
        PERF-TEST-42 → 42
        TASK-1 → 1
    """
    match = re.search(r'-(\d+)', task_id)
    if match:
        return int(match.group(1))
    return 0


def sample_tasks(tasks: List[Dict[str, Any]], count: int) -> List[Dict[str, Any]]:
    """
    Sample diverse tasks using stratified sampling by numeric ID

    Strategy:
    1. Group tasks by prefix (PERF-TEST, TASK, etc.)
    2. For each prefix, select tasks evenly distributed across numeric ID range
    3. Prioritize larger groups (more samples from PERF-TEST than TASK)

    Args:
        tasks: All tasks from corpus
        count: Number of tasks to sample

    Returns:
        List of sampled tasks
    """
    # Group by prefix
    from collections import defaultdict
    groups = defaultdict(list)

    for task in tasks:
        task_id = task.get('task_id', '')
        # Extract prefix (everything before numeric ID)
        prefix_match = re.match(r'^([A-Z-]+)', task_id)
        if prefix_match:
            prefix = prefix_match.group(1).rstrip('-')
            groups[prefix].append(task)

    print(f'Task groups: {[(prefix, len(tasks)) for prefix, tasks in groups.items()]}')

    # Allocate sample size proportionally to group size
    total_tasks = sum(len(group_tasks) for group_tasks in groups.values())
    sample = []

    for prefix, group_tasks in groups.items():
        # Proportional allocation (minimum 1 per group if non-empty)
        group_size = len(group_tasks)
        target_samples = max(1, int(count * group_size / total_tasks))

        # Don't sample more than available
        target_samples = min(target_samples, group_size)

        # Sort by numeric ID
        group_tasks_sorted = sorted(group_tasks, key=lambda t: extract_numeric_id(t.get('task_id', '')))

        # Select evenly distributed tasks across numeric range
        if target_samples >= len(group_tasks_sorted):
            # Take all
            selected = group_tasks_sorted
        else:
            # Stratified sampling by numeric ID
            step = len(group_tasks_sorted) / target_samples
            indices = [int(i * step) for i in range(target_samples)]
            selected = [group_tasks_sorted[i] for i in indices]

        print(f'  {prefix}: selected {len(selected)} of {group_size} tasks')
        sample.extend(selected)

    # If we're under count, add more from largest group
    if len(sample) < count:
        largest_group = max(groups.keys(), key=lambda p: len(groups[p]))
        remaining = count - len(sample)
        already_sampled_ids = {t.get('task_id') for t in sample}

        # Add more from largest group (skip already sampled)
        additional = []
        for task in groups[largest_group]:
            if task.get('task_id') not in already_sampled_ids:
                additional.append(task)
                if len(additional) >= remaining:
                    break

        print(f'  Adding {len(additional)} more from {largest_group} to reach target')
        sample.extend(additional)

    # Trim to exact count if over
    sample = sample[:count]

    return sample


def write_sample(sample: List[Dict[str, Any]], output_path: Path):
    """Write sampled tasks to JSON file"""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Prepare output (exclude large embedding vectors for readability)
    output = []
    for task in sample:
        task_summary = {
            'task_id': task.get('task_id'),
            'title': task.get('title'),
            'description': task.get('description'),
            'files_touched': task.get('files_touched'),
            'outcome': task.get('outcome'),
            'quality': task.get('quality'),
            'duration_ms': task.get('duration_ms'),
        }
        output.append(task_summary)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2)

    print(f'Wrote {len(output)} sampled tasks to {output_path}')


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
        print(f'Target sample size: {args.count}')
        print()

        # Load corpus
        tasks = load_corpus(workspace_root)

        # Sample diverse tasks
        sample = sample_tasks(tasks, args.count)

        # Write output
        write_sample(sample, output_path)

        print()
        print('✅ Sampling complete')
        print(f'Selected {len(sample)} tasks for evaluation')

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
