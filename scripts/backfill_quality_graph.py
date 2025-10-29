#!/usr/bin/env python3
"""
Quality Graph - Backfill Historical Tasks

Populates quality graph corpus from historical completed tasks.
Reads from resolution metrics or phase ledger to find past tasks.

Usage:
    python3 backfill_quality_graph.py <workspace_root> [options]

Example:
    python3 backfill_quality_graph.py . --days 90 --dry-run
    python3 backfill_quality_graph.py . --days 30

Design:
- Idempotent: Skips tasks already in corpus
- Progress reporting: tqdm progress bar
- Graceful degradation: Logs errors, continues processing
- Statistics: Reports tasks backfilled, skipped, failed

Verification Checklist:
- [x] Reads historical task data
- [x] Computes embeddings for each task
- [x] Writes vectors to quality graph
- [x] Idempotent (skips existing)
- [x] Progress bar for visibility
- [x] Statistics reporting
- [x] Error handling (logs and continues)
"""

import argparse
import json
import logging
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Dict, Any, Optional, Set

# Add quality_graph scripts to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'tools' / 'wvo_mcp' / 'scripts' / 'quality_graph'))

from embeddings import compute_task_embedding
from schema import TaskVector

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%dT%H:%M:%S',
)
logger = logging.getLogger(__name__)

# Try to import tqdm for progress bar
try:
    from tqdm import tqdm
    HAS_TQDM = True
except ImportError:
    logger.warning('tqdm not installed, progress bar will be basic')
    HAS_TQDM = False
    # Fallback progress indicator
    class tqdm:
        def __init__(self, iterable=None, total=None, desc=None, **kwargs):
            self.iterable = iterable
            self.total = total or (len(iterable) if iterable else 0)
            self.desc = desc
            self.current = 0
            if desc:
                print(f'{desc}: 0/{self.total}', end='', flush=True)

        def __iter__(self):
            for item in self.iterable:
                yield item
                self.current += 1
                if self.desc and self.current % max(1, self.total // 20) == 0:
                    print(f'\r{self.desc}: {self.current}/{self.total}', end='', flush=True)
            if self.desc:
                print(f'\r{self.desc}: {self.current}/{self.total}')

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def update(self, n=1):
            self.current += n


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments"""
    parser = argparse.ArgumentParser(
        description='Backfill quality graph from historical tasks',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument(
        'workspace_root',
        type=str,
        help='Path to workspace root directory',
    )

    parser.add_argument(
        '--days',
        type=int,
        default=90,
        help='Number of days to look back (default: 90)',
    )

    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be backfilled without writing',
    )

    parser.add_argument(
        '--force',
        action='store_true',
        help='Re-process existing vectors (not idempotent)',
    )

    return parser.parse_args()


def load_existing_task_ids(workspace_root: Path) -> Set[str]:
    """
    Load task IDs that already exist in quality graph

    Returns:
        Set of task IDs already recorded
    """
    vectors_file = workspace_root / 'state' / 'quality_graph' / 'task_vectors.jsonl'

    if not vectors_file.exists():
        logger.info('No existing task vectors found')
        return set()

    task_ids = set()
    with open(vectors_file, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                vector = json.loads(line)
                task_ids.add(vector.get('task_id'))
            except Exception:
                continue

    logger.info(f'Found {len(task_ids)} existing task vectors')
    return task_ids


def find_historical_tasks(
    workspace_root: Path,
    days_back: int
) -> List[Dict[str, Any]]:
    """
    Find completed tasks from resolution metrics

    Looks in resources/runs/*/resolution/*.json for task completions

    Returns:
        List of task dictionaries with metadata
    """
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=days_back)
    tasks = []

    # Check perf-baseline run
    resolution_dir = workspace_root / 'resources' / 'runs' / 'perf-baseline' / 'resolution'
    if resolution_dir.exists():
        for resolution_file in resolution_dir.glob('*.json'):
            try:
                with open(resolution_file, 'r') as f:
                    data = json.load(f)

                # Extract task metadata
                task_id = data.get('task_id')
                if not task_id:
                    continue

                # Check timestamp
                timestamp_str = data.get('timestamp')
                if timestamp_str:
                    try:
                        timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                        if timestamp < cutoff_date:
                            continue
                    except Exception:
                        pass

                # Extract metadata
                task = {
                    'task_id': task_id,
                    'title': data.get('title') or task_id,
                    'description': data.get('description'),
                    'files_touched': data.get('files_touched') or data.get('files_modified'),
                    'outcome': data.get('outcome', {}).get('status', 'success'),
                    'duration_ms': data.get('duration_ms'),
                    'quality': data.get('quality'),
                    'complexity_score': data.get('complexity_score'),
                }

                # Skip if no meaningful metadata
                if not task['title'] and not task['description'] and not task['files_touched']:
                    continue

                tasks.append(task)

            except Exception as e:
                logger.debug(f'Skipping {resolution_file.name}: {e}')
                continue

    # Check test run
    test_resolution_dir = workspace_root / 'resources' / 'runs' / 'test' / 'resolution'
    if test_resolution_dir.exists():
        for resolution_file in test_resolution_dir.glob('*.json'):
            try:
                with open(resolution_file, 'r') as f:
                    data = json.load(f)

                task_id = data.get('task_id')
                if not task_id:
                    continue

                # Extract metadata
                task = {
                    'task_id': task_id,
                    'title': data.get('title') or task_id,
                    'description': data.get('description'),
                    'files_touched': data.get('files_touched') or data.get('files_modified'),
                    'outcome': data.get('outcome', {}).get('status', 'success'),
                    'duration_ms': data.get('duration_ms'),
                    'quality': data.get('quality'),
                    'complexity_score': data.get('complexity_score'),
                }

                # Skip if no meaningful metadata
                if not task['title'] and not task['description'] and not task['files_touched']:
                    continue

                # Skip duplicates
                if not any(t['task_id'] == task_id for t in tasks):
                    tasks.append(task)

            except Exception as e:
                logger.debug(f'Skipping {resolution_file.name}: {e}')
                continue

    logger.info(f'Found {len(tasks)} historical tasks in last {days_back} days')
    return tasks


def backfill_task(
    task: Dict[str, Any],
    workspace_root: Path,
    dry_run: bool
) -> bool:
    """
    Backfill a single task into quality graph

    Args:
        task: Task metadata dictionary
        workspace_root: Workspace root path
        dry_run: If True, don't actually write

    Returns:
        True if successful, False otherwise
    """
    try:
        # Compute embedding
        embedding = compute_task_embedding(
            title=task.get('title'),
            description=task.get('description'),
            files_touched=task.get('files_touched'),
        )

        if dry_run:
            logger.debug(f'[DRY RUN] Would backfill: {task["task_id"]}')
            return True

        # Create vector
        vector = {
            'task_id': task['task_id'],
            'embedding': embedding.tolist(),
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'outcome': {'status': task.get('outcome', 'success')},
        }

        # Add optional fields
        if task.get('title'):
            vector['title'] = task['title']
        if task.get('description'):
            vector['description'] = task['description']
        if task.get('files_touched'):
            vector['files_touched'] = task['files_touched']
        if task.get('duration_ms') is not None:
            vector['duration_ms'] = task['duration_ms']
        if task.get('quality'):
            vector['quality'] = task['quality']
        if task.get('complexity_score') is not None:
            vector['complexity_score'] = task['complexity_score']

        # Validate with Pydantic
        TaskVector(**vector)

        # Write to file
        qg_dir = workspace_root / 'state' / 'quality_graph'
        qg_dir.mkdir(parents=True, exist_ok=True)

        vectors_file = qg_dir / 'task_vectors.jsonl'
        json_line = json.dumps(vector) + '\n'

        with open(vectors_file, 'a', encoding='utf-8') as f:
            f.write(json_line)

        return True

    except Exception as e:
        logger.warning(f'Failed to backfill {task.get("task_id")}: {e}')
        return False


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

        logger.info(f'Workspace: {workspace_root}')
        logger.info(f'Looking back: {args.days} days')

        if args.dry_run:
            logger.info('DRY RUN MODE: No vectors will be written')

        # Load existing task IDs
        existing_ids = set() if args.force else load_existing_task_ids(workspace_root)

        # Find historical tasks
        historical_tasks = find_historical_tasks(workspace_root, args.days)

        if not historical_tasks:
            logger.info('No historical tasks found to backfill')
            return 0

        # Filter out existing (if not force mode)
        if not args.force:
            tasks_to_process = [t for t in historical_tasks if t['task_id'] not in existing_ids]
            logger.info(f'{len(tasks_to_process)} tasks to backfill ({len(historical_tasks) - len(tasks_to_process)} already exist)')
        else:
            tasks_to_process = historical_tasks
            logger.info(f'{len(tasks_to_process)} tasks to backfill (force mode)')

        if not tasks_to_process:
            logger.info('All tasks already in quality graph')
            return 0

        # Backfill tasks with progress bar
        stats = {
            'success': 0,
            'failed': 0,
            'skipped': 0,
        }

        with tqdm(tasks_to_process, desc='Backfilling tasks', unit='task') as pbar:
            for task in pbar:
                if backfill_task(task, workspace_root, args.dry_run):
                    stats['success'] += 1
                else:
                    stats['failed'] += 1

        # Report statistics
        logger.info('='  * 60)
        logger.info('Backfill Complete')
        logger.info(f'  Successful: {stats["success"]}')
        logger.info(f'  Failed: {stats["failed"]}')
        logger.info(f'  Already existed: {len(historical_tasks) - len(tasks_to_process)}')
        logger.info('=' * 60)

        if args.dry_run:
            logger.info('DRY RUN: No actual changes made')

        return 0 if stats['failed'] == 0 else 1

    except KeyboardInterrupt:
        logger.warning('Interrupted by user')
        return 130

    except Exception as e:
        logger.error(f'Backfill failed: {e}', exc_info=True)
        return 1


if __name__ == '__main__':
    sys.exit(main())
