#!/usr/bin/env python3
"""
Benchmark batch vs sequential neural embeddings.

Usage:
    python3 benchmark_batch_embeddings.py --num-tasks 100 --batch-sizes 1,8,16,32,64
"""

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

from embeddings import NeuralBackend, EmbeddingConfigurationError


def generate_sample_tasks(n: int) -> list[dict]:
    """Generate n sample tasks for benchmarking."""
    tasks = []
    for i in range(n):
        tasks.append({
            "title": f"Task {i+1}: Implement feature",
            "description": f"This is task number {i+1}. It involves implementing a new feature with proper testing and documentation.",
            "files_touched": ["src/main.py", "tests/test_main.py", "docs/README.md"],
        })
    return tasks


def benchmark_sequential(backend: NeuralBackend, tasks: list[dict]) -> dict:
    """Benchmark sequential embedding computation."""
    start = time.perf_counter()

    embeddings = []
    for task in tasks:
        emb = backend.compute_embedding(
            title=task["title"],
            description=task["description"],
            files_touched=task["files_touched"],
        )
        embeddings.append(emb)

    elapsed = time.perf_counter() - start
    embeddings_array = np.array(embeddings)

    return {
        "mode": "sequential",
        "num_tasks": len(tasks),
        "total_time_seconds": round(elapsed, 3),
        "time_per_task_ms": round(elapsed * 1000 / len(tasks), 3),
        "embeddings_shape": list(embeddings_array.shape),
    }


def benchmark_batch(backend: NeuralBackend, tasks: list[dict], batch_size: int) -> dict:
    """Benchmark batch embedding computation."""
    start = time.perf_counter()

    embeddings = backend.compute_embeddings_batch(tasks, batch_size=batch_size)

    elapsed = time.perf_counter() - start

    return {
        "mode": "batch",
        "batch_size": batch_size,
        "num_tasks": len(tasks),
        "total_time_seconds": round(elapsed, 3),
        "time_per_task_ms": round(elapsed * 1000 / len(tasks), 3),
        "embeddings_shape": list(embeddings.shape),
    }


def verify_consistency(backend: NeuralBackend, tasks: list[dict], batch_size: int) -> dict:
    """Verify batch and sequential produce same results."""
    # Sequential
    sequential_embs = np.array([
        backend.compute_embedding(
            title=task["title"],
            description=task["description"],
            files_touched=task["files_touched"],
        )
        for task in tasks
    ])

    # Batch
    batch_embs = backend.compute_embeddings_batch(tasks, batch_size=batch_size)

    # Compare
    max_diff = np.max(np.abs(sequential_embs - batch_embs))
    mean_diff = np.mean(np.abs(sequential_embs - batch_embs))

    return {
        "max_difference": float(max_diff),
        "mean_difference": float(mean_diff),
        "consistent": bool(max_diff < 1e-6),
    }


def main():
    parser = argparse.ArgumentParser(description="Benchmark batch neural embeddings")
    parser.add_argument("--num-tasks", type=int, default=100, help="Number of tasks to benchmark")
    parser.add_argument("--batch-sizes", type=str, default="1,8,16,32,64", help="Comma-separated batch sizes")
    parser.add_argument("--output", type=str, help="Output JSON file for results")
    parser.add_argument("--verify-consistency", action="store_true", help="Verify batch matches sequential")

    args = parser.parse_args()

    batch_sizes = [int(x) for x in args.batch_sizes.split(",")]

    print(f"Benchmarking neural embeddings with {args.num_tasks} tasks")
    print(f"Batch sizes: {batch_sizes}")
    print()

    # Check model availability
    try:
        backend = NeuralBackend()
        backend._ensure_model()
    except EmbeddingConfigurationError as e:
        print(f"Error: {e}")
        print()
        print("To run this benchmark, ensure:")
        print("  1. sentence-transformers is installed")
        print("  2. Model is downloaded or QUALITY_GRAPH_EMBED_ALLOW_DOWNLOAD=1")
        print()
        print("Example:")
        print("  QUALITY_GRAPH_EMBED_ALLOW_DOWNLOAD=1 python3 benchmark_batch_embeddings.py")
        sys.exit(1)

    # Generate sample tasks
    print("Generating sample tasks...")
    tasks = generate_sample_tasks(args.num_tasks)
    print(f"Generated {len(tasks)} tasks")
    print()

    # Run benchmarks
    results = {
        "num_tasks": args.num_tasks,
        "benchmarks": [],
    }

    for batch_size in batch_sizes:
        print(f"Running benchmark: batch_size={batch_size}...", end=" ", flush=True)

        if batch_size == 1:
            # Sequential baseline
            result = benchmark_sequential(backend, tasks)
            print(f"{result['time_per_task_ms']}ms/task (sequential)")
        else:
            # Batch mode
            result = benchmark_batch(backend, tasks, batch_size=batch_size)
            baseline_time = results["benchmarks"][0]["time_per_task_ms"]
            speedup = baseline_time / result["time_per_task_ms"]
            print(f"{result['time_per_task_ms']}ms/task ({speedup:.1f}x speedup)")

        results["benchmarks"].append(result)

    print()

    # Verify consistency if requested
    if args.verify_consistency:
        print("Verifying batch vs sequential consistency...")
        sample_tasks = tasks[:5]  # Use small sample for verification
        consistency = verify_consistency(backend, sample_tasks, batch_size=32)
        results["consistency"] = consistency

        if consistency["consistent"]:
            print(f"✅ Consistent (max diff: {consistency['max_difference']:.2e})")
        else:
            print(f"❌ Inconsistent (max diff: {consistency['max_difference']:.2e})")
        print()

    # Calculate speedups
    baseline_time = results["benchmarks"][0]["time_per_task_ms"]
    print("Summary:")
    print("-" * 60)
    for result in results["benchmarks"]:
        if result["mode"] == "sequential":
            print(f"Sequential: {result['time_per_task_ms']}ms/task (baseline)")
        else:
            speedup = baseline_time / result["time_per_task_ms"]
            print(f"Batch {result['batch_size']:2d}:    {result['time_per_task_ms']}ms/task ({speedup:.1f}x speedup)")
    print("-" * 60)

    # Save results
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w") as f:
            json.dump(results, f, indent=2)
        print(f"\nResults saved to: {output_path}")


if __name__ == "__main__":
    main()
