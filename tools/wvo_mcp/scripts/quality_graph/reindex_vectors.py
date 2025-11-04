#!/usr/bin/env python3
"""
Quality Graph — Reindex Vectors

Recomputes embeddings for existing task vectors using the current embedding
backend. Intended for migrations (e.g., hashing backend upgrade) and recovery
operations. Supports dry-run mode and optional backups.
"""

from __future__ import annotations

import argparse
import json
import logging
import shutil
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Tuple

try:
    from .embeddings import (
        EMBEDDING_DIM,
        EmbeddingComputationError,
        TaskEmbedder,
        assess_embedding_quality,
        compute_task_embedding,
    )
    from .schema import TaskVector
except ImportError:  # pragma: no cover - script executed directly
    from embeddings import (  # type: ignore
        EMBEDDING_DIM,
        EmbeddingComputationError,
        TaskEmbedder,
        assess_embedding_quality,
        compute_task_embedding,
    )
    from schema import TaskVector  # type: ignore

logger = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Recompute quality graph embeddings in-place.")
    parser.add_argument("workspace_root", type=str, help="Path to workspace root.")
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Only process the first N vectors (useful for testing).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Do not write changes; print summary only.",
    )
    parser.add_argument(
        "--backup",
        action="store_true",
        help="Create timestamped backup of task_vectors.jsonl before rewriting.",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Override output path (defaults to task_vectors.jsonl).",
    )
    parser.add_argument(
        "--embedding-mode",
        type=str,
        choices=["tfidf", "neural"],
        default=None,
        help="Override embedding mode.",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress progress logging (only errors).",
    )
    return parser.parse_args()


def load_vectors(path: Path) -> List[TaskVector]:
    if not path.exists():
        raise FileNotFoundError(f"Quality graph corpus not found: {path}")

    vectors: List[TaskVector] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, 1):
            line = line.strip()
            if not line:
                continue
            vectors.append(TaskVector.model_validate_json(line))
    return vectors


@dataclass
class ReindexResult:
    processed: int
    updated: int
    skipped: int
    failures: List[Tuple[str, str]]


def recompute_embeddings(
    vectors: List[TaskVector],
    *,
    limit: int | None,
    embedder: TaskEmbedder,
) -> Tuple[List[TaskVector], ReindexResult]:
    updated_vectors: List[TaskVector] = []
    failures: List[Tuple[str, str]] = []

    processed = 0
    updated = 0
    for vector in vectors:
        if limit is not None and processed >= limit:
            break

        processed += 1
        metadata = {
            "title": vector.title,
            "description": vector.description,
            "files_touched": vector.files_touched,
        }

        try:
            embedding = compute_task_embedding(
                metadata,
                embedder=embedder,
            )
        except EmbeddingComputationError as exc:
            failures.append((vector.task_id, f"embedding computation failed: {exc}"))
            updated_vectors.append(vector)
            continue
        except ValueError as exc:
            failures.append((vector.task_id, f"invalid metadata: {exc}"))
            updated_vectors.append(vector)
            continue

        if embedding.shape[0] != EMBEDDING_DIM:
            failures.append((vector.task_id, f"unexpected embedding dimension {embedding.shape[0]}"))
            updated_vectors.append(vector)
            continue

        new_data = vector.model_dump()
        new_data["embedding"] = embedding.tolist()
        new_data["quality"] = assess_embedding_quality(metadata)
        new_vector = TaskVector(**new_data)
        updated_vectors.append(new_vector)
        updated += 1

    # Append untouched tail when limit used
    if limit is not None:
        updated_vectors.extend(vectors[processed:])

    return updated_vectors, ReindexResult(
        processed=processed,
        updated=updated,
        skipped=0,
        failures=failures,
    )


def write_vectors(path: Path, vectors: Iterable[TaskVector]) -> None:
    tmp_path = path.with_suffix(path.suffix + ".reindex.tmp")
    with tmp_path.open("w", encoding="utf-8") as handle:
        for vector in vectors:
            handle.write(json.dumps(vector.model_dump(mode="json")) + "\n")
    tmp_path.replace(path)


def timestamp_suffix() -> str:
    now = datetime.now(timezone.utc)
    return now.strftime("%Y%m%dT%H%M%SZ")


def main() -> int:
    args = parse_args()
    logging.basicConfig(
        level=logging.ERROR if args.quiet else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    workspace = Path(args.workspace_root).resolve()
    corpus_path = (
        Path(args.output).resolve()
        if args.output
        else workspace / "state" / "quality_graph" / "task_vectors.jsonl"
    )

    try:
        vectors = load_vectors(corpus_path)
    except FileNotFoundError as exc:
        logger.error(str(exc))
        return 1

    logger.info("Loaded %d vectors from %s", len(vectors), corpus_path)
    if args.limit:
        logger.info("Processing limit: %d", args.limit)

    embedder = TaskEmbedder(mode=args.embedding_mode)
    updated_vectors, result = recompute_embeddings(
        vectors,
        limit=args.limit,
        embedder=embedder,
    )

    logger.info(
        "Processed=%d updated=%d failures=%d",
        result.processed,
        result.updated,
        len(result.failures),
    )

    if args.dry_run:
        for task_id, reason in result.failures[:10]:
            logger.warning("Would skip %s (%s)", task_id, reason)
        if len(result.failures) > 10:
            logger.warning("... %d additional failure(s) omitted", len(result.failures) - 10)
        logger.info("Dry-run complete; no files were written.")
        return 0

    if args.backup:
        backup_path = corpus_path.with_suffix(
            corpus_path.suffix + f".bak.{timestamp_suffix()}"
        )
        shutil.copy2(corpus_path, backup_path)
        logger.info("Backup written to %s", backup_path)

    write_vectors(corpus_path, updated_vectors)

    if result.failures:
        logger.warning("Completed with %d failures (see log).", len(result.failures))
        return 2

    logger.info("Reindex complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
