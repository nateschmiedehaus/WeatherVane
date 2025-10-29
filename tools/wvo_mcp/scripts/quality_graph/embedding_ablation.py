#!/usr/bin/env python3
"""
Embedding Ablation Script

Compares TF-IDF and neural embedding backends on the quality graph evaluation
set (IMP-ADV-01.3). Produces precision@K and MAP metrics along with per-query
results for evidence capture.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import numpy as np

# Ensure local imports resolve when script executed via absolute path
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from embeddings import (  # noqa: E402  pylint: disable=wrong-import-position
    EMBEDDING_DIM,
    EmbeddingComputationError,
    EmbeddingConfigurationError,
    TaskEmbedder,
    compute_task_embedding,
)
from query_similar_tasks import compute_cosine_similarity  # noqa: E402  pylint: disable=wrong-import-position


@dataclass
class EvaluationTask:
    task_id: str
    title: str
    description: Optional[str]
    files_touched: Optional[List[str]]


def load_sample_tasks(sample_path: Path) -> Dict[str, EvaluationTask]:
    tasks_raw = json.loads(sample_path.read_text())
    tasks: Dict[str, EvaluationTask] = {}
    for item in tasks_raw:
        tasks[item['task_id']] = EvaluationTask(
            task_id=item['task_id'],
            title=item.get('title', ''),
            description=item.get('description'),
            files_touched=item.get('files_touched'),
        )
    return tasks


def load_ground_truth(eval_path: Path) -> Dict[str, Dict[str, bool]]:
    evaluations = json.loads(eval_path.read_text())
    ground_truth: Dict[str, Dict[str, bool]] = {}
    for entry in evaluations:
        query_id = entry['query_task_id']
        relevance_map = {}
        for judgment in entry.get('judgments', []):
            relevance_map[judgment['task_id']] = bool(judgment.get('relevant', False))
        ground_truth[query_id] = relevance_map
    return ground_truth


@dataclass
class EmbeddingCache:
    embeddings: Dict[str, np.ndarray]
    mean_latency_ms: float


def precompute_embeddings(
    tasks: Iterable[EvaluationTask],
    mode: str,
) -> EmbeddingCache:
    embedder = TaskEmbedder(mode=mode)
    embeddings: Dict[str, np.ndarray] = {}
    latencies: List[float] = []

    task_list = list(tasks)

    corpus_texts: Optional[List[str]] = None
    if mode == 'tfidf':
        corpus_texts = [
            embedder.extract_text_features(
                title=task.title,
                description=task.description,
                files_touched=task.files_touched,
            )
            for task in task_list
        ]

    for index, task in enumerate(task_list):
        metadata = {
            'title': task.title,
            'description': task.description,
            'files_touched': task.files_touched,
        }
        start = time.perf_counter()
        embedding = compute_task_embedding(
            metadata,
            mode=mode,
            embedder=embedder,
            corpus=corpus_texts if index == 0 else None,
        )
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        latencies.append(elapsed_ms)
        embeddings[task.task_id] = embedding.astype(np.float32)

    mean_latency = float(np.mean(latencies)) if latencies else 0.0
    return EmbeddingCache(embeddings=embeddings, mean_latency_ms=mean_latency)


def precision_at_k(results: List[Tuple[str, float]], ground_truth: Dict[str, bool], k: int) -> float:
    if k <= 0:
        return 0.0
    relevant = 0
    for candidate, _ in results[:k]:
        if ground_truth.get(candidate, False):
            relevant += 1
    return relevant / min(k, len(results)) if results else 0.0


def average_precision(results: List[Tuple[str, float]], ground_truth: Dict[str, bool]) -> float:
    total_relevant = sum(1 for value in ground_truth.values() if value)
    if total_relevant == 0:
        return 0.0
    hits = 0
    cumulative_precision = 0.0
    for rank, (candidate, _) in enumerate(results, start=1):
        if ground_truth.get(candidate, False):
            hits += 1
            cumulative_precision += hits / rank
    if hits == 0:
        return 0.0
    return cumulative_precision / total_relevant


def evaluate_mode(
    query_tasks: Dict[str, EvaluationTask],
    corpus_embeddings: Dict[str, np.ndarray],
    ground_truth: Dict[str, Dict[str, bool]],
    mode: str,
    k: int,
) -> Tuple[Dict[str, Dict[str, object]], Dict[str, float]]:
    per_query: Dict[str, Dict[str, object]] = {}
    precisions: List[float] = []
    map_scores: List[float] = []

    for task_id, query_task in query_tasks.items():
        if task_id not in ground_truth:
            continue
        query_embedding = corpus_embeddings.get(task_id)
        if query_embedding is None:
            continue

        candidates: List[Tuple[str, float]] = []
        for candidate_id, candidate_embedding in corpus_embeddings.items():
            if candidate_id == task_id:
                continue
            similarity = float(np.dot(query_embedding, candidate_embedding))
            candidates.append((candidate_id, similarity))

        candidates.sort(key=lambda item: item[1], reverse=True)
        top_results = candidates[:k]
        truth_map = ground_truth[task_id]

        prec = precision_at_k(top_results, truth_map, k)
        ap = average_precision(candidates, truth_map)

        per_query[task_id] = {
            'mode': mode,
            'precision_at_k': prec,
            'average_precision': ap,
            'top_results': [
                {
                    'task_id': candidate,
                    'similarity': score,
                    'relevant': truth_map.get(candidate, False),
                }
                for candidate, score in top_results
            ],
            'relevant_total': sum(1 for value in truth_map.values() if value),
        }
        precisions.append(prec)
        map_scores.append(ap)

    summary = {
        'precision_at_k': float(np.mean(precisions)) if precisions else 0.0,
        'map': float(np.mean(map_scores)) if map_scores else 0.0,
    }

    return per_query, summary


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Compare TF-IDF vs neural embeddings.')
    parser.add_argument('workspace_root', type=Path, help='Workspace root directory')
    parser.add_argument(
        '--sample',
        type=Path,
        default=Path('state/evidence/IMP-ADV-01.3/sample_tasks.json'),
        help='Path to sample tasks JSON',
    )
    parser.add_argument(
        '--evaluation',
        type=Path,
        default=Path('state/evidence/IMP-ADV-01.3/automated_evaluation.json'),
        help='Path to evaluation judgments JSON',
    )
    parser.add_argument(
        '--output',
        type=Path,
        default=Path('state/evidence/IMP-ADV-01.6/verify/neural_vs_tfidf_ablation.json'),
        help='Path to write ablation results JSON',
    )
    parser.add_argument('--k', type=int, default=5, help='Top-K for precision (default: 5)')
    parser.add_argument(
        '--modes',
        type=str,
        nargs='*',
        default=['tfidf', 'neural'],
        help='Embedding modes to evaluate (subset of tfidf|neural)',
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    workspace_root = args.workspace_root.resolve()

    try:
        tasks = load_sample_tasks(workspace_root / args.sample)
    except FileNotFoundError:
        print(f"Sample tasks file not found: {(workspace_root / args.sample)}", file=sys.stderr)
        return 1

    try:
        ground_truth = load_ground_truth(workspace_root / args.evaluation)
    except FileNotFoundError:
        print(f"Evaluation judgments file not found: {(workspace_root / args.evaluation)}", file=sys.stderr)
        return 1

    modes = []
    for mode in args.modes:
        normalized = mode.lower()
        if normalized in ('tfidf', 'neural') and normalized not in modes:
            modes.append(normalized)

    if not modes:
        print('No valid embedding modes specified', file=sys.stderr)
        return 1

    per_mode_results: Dict[str, Dict[str, object]] = {}
    per_query_details: Dict[str, Dict[str, Dict[str, object]]] = defaultdict(dict)

    for mode in modes:
        try:
            cache = precompute_embeddings(tasks.values(), mode)
        except EmbeddingConfigurationError as error:
            print(f"[{mode}] Configuration error: {error}", file=sys.stderr)
            return 2
        except EmbeddingComputationError as error:
            print(f"[{mode}] Computation error: {error}", file=sys.stderr)
            return 2

        per_query, summary = evaluate_mode(tasks, cache.embeddings, ground_truth, mode, args.k)
        for task_id, result in per_query.items():
            per_query_details[task_id][mode] = result

        per_mode_results[mode] = {
            'precision_at_k': summary['precision_at_k'],
            'map': summary['map'],
            'mean_embedding_latency_ms': cache.mean_latency_ms,
            'evaluated_queries': len(per_query),
        }

    output = {
        'k': args.k,
        'modes': per_mode_results,
        'per_query': [],
        'workspace_root': str(workspace_root),
        'generated_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    }

    for task_id, mode_details in per_query_details.items():
        entry = {
            'query_task_id': task_id,
            'modes': mode_details,
        }
        output['per_query'].append(entry)

    output_path = workspace_root / args.output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, indent=2))

    print(json.dumps(per_mode_results, indent=2))
    print(f"Ablation written to {output_path}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
