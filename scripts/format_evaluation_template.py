#!/usr/bin/env python3
"""
Format Evaluation Template

Converts similarity query results into markdown template for manual relevance judgment.

Usage:
    python3 format_evaluation_template.py <workspace_root>

Example:
    python3 format_evaluation_template.py .
"""

import argparse
import json
import sys
from pathlib import Path
from typing import List, Dict, Any


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments"""
    parser = argparse.ArgumentParser(
        description='Format evaluation template from query results',
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
        default='state/evidence/IMP-ADV-01.3/similarity_results.json',
        help='Input results file path',
    )

    parser.add_argument(
        '--output',
        type=str,
        default='state/evidence/IMP-ADV-01.3/evaluation_template.md',
        help='Output template file path',
    )

    return parser.parse_args()


def format_template(results: List[Dict[str, Any]]) -> str:
    """
    Format query results as markdown evaluation template

    Args:
        results: List of query result dictionaries

    Returns:
        Markdown string
    """
    lines = []

    # Header
    lines.append("# Manual Similarity Evaluation")
    lines.append("")
    lines.append("**Task:** IMP-ADV-01.3 - Manual Similarity Evaluation")
    lines.append("**Evaluator:** nathanielschmiedehaus (product owner)")
    lines.append("**Date:** 2025-10-29")
    lines.append("")
    lines.append("## Instructions")
    lines.append("")
    lines.append("For each query task, review the top-5 similar tasks and mark whether each is **relevant**.")
    lines.append("")
    lines.append("**Relevance Criteria:**")
    lines.append("- **Relevant (Yes):** Same domain/feature, reusable approach, useful context")
    lines.append("- **Not Relevant (No):** Unrelated domain, no useful connection")
    lines.append("")
    lines.append("**How to evaluate:**")
    lines.append("1. Read the query task title/description")
    lines.append("2. For each of the 5 similar tasks:")
    lines.append("   - Read its title/description")
    lines.append("   - Decide: Would this task provide useful context for planning/implementing the query task?")
    lines.append("   - Mark `[x]` for Yes or `[ ]` for No")
    lines.append("")
    lines.append("**Example:**")
    lines.append("```")
    lines.append("1. **PERF-TEST-5** (score: 0.92)")
    lines.append("   - Description: Measure API latency")
    lines.append("   - Relevant? [x] Yes [ ] No")
    lines.append("```")
    lines.append("")
    lines.append("---")
    lines.append("")

    # Query sections
    for i, result in enumerate(results, 1):
        query = result.get('query_task', {})
        similar = result.get('similar_tasks', [])

        # Query header
        query_id = query.get('task_id', 'UNKNOWN')
        query_title = query.get('title', 'No title')
        query_desc = query.get('description', 'No description')
        query_files = query.get('files_touched', [])

        lines.append(f"## Query {i}: {query_id}")
        lines.append("")
        lines.append(f"**Title:** {query_title}")
        lines.append("")
        if query_desc:
            lines.append(f"**Description:** {query_desc}")
            lines.append("")
        if query_files:
            files_str = ", ".join(query_files[:3])  # Show first 3 files
            if len(query_files) > 3:
                files_str += f" (+{len(query_files) - 3} more)"
            lines.append(f"**Files:** {files_str}")
            lines.append("")

        # Similar tasks
        if not similar:
            lines.append("*No similar tasks found (corpus too sparse or query too unique)*")
            lines.append("")
        else:
            lines.append("### Top-5 Similar Tasks")
            lines.append("")

            for j, task in enumerate(similar, 1):
                task_id = task.get('task_id', 'UNKNOWN')
                title = task.get('title', 'No title')
                desc = task.get('description', 'No description')
                similarity = task.get('similarity', 0.0)
                files = task.get('files_touched', [])

                lines.append(f"{j}. **{task_id}** (score: {similarity:.3f})")
                lines.append(f"   - Title: {title}")
                if desc and desc != 'No description':
                    # Truncate long descriptions
                    if len(desc) > 200:
                        desc = desc[:200] + "..."
                    lines.append(f"   - Description: {desc}")
                if files:
                    files_str = ", ".join(files[:2])  # Show first 2 files
                    if len(files) > 2:
                        files_str += f" (+{len(files) - 2} more)"
                    lines.append(f"   - Files: {files_str}")
                lines.append(f"   - Relevant? [ ] Yes [ ] No")
                lines.append("")

        lines.append("---")
        lines.append("")

    # Footer
    lines.append("## Evaluation Complete")
    lines.append("")
    lines.append("**Next Steps:**")
    lines.append("1. Save this file with your relevance judgments marked")
    lines.append("2. Run `python3 scripts/calculate_precision.py .` to compute metrics")
    lines.append("3. Review precision@5 score to assess similarity search quality")
    lines.append("")

    return "\n".join(lines)


def write_template(template: str, output_path: Path):
    """Write template to markdown file"""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(template)

    print(f'Wrote evaluation template to {output_path}')


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
            raise FileNotFoundError(f'Results file not found: {input_path}')

        print(f'Workspace: {workspace_root}')
        print(f'Input: {input_path}')
        print(f'Output: {output_path}')
        print()

        # Load results
        with open(input_path, 'r', encoding='utf-8') as f:
            results = json.load(f)

        print(f'Loaded {len(results)} query results')

        # Format template
        template = format_template(results)

        # Write template
        write_template(template, output_path)

        # Summary
        total_results = sum(len(r.get('similar_tasks', [])) for r in results)
        print()
        print('✅ Template formatting complete')
        print(f'   Queries: {len(results)}')
        print(f'   Results to evaluate: {total_results}')

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
