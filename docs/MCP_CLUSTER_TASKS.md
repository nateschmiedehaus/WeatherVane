## MCP Clustered Task Playbook

Cluster metadata lets the MCP orchestrator recognise that a group of related roadmap items should be executed together during acceleration runs.

- **Roadmap YAML** – add a `cluster` block on each related task:

  ```yaml
  - id: T4.1.8
    title: Reinforcement-learning shadow mode (safe exploration)
    status: pending
    cluster:
      id: accelerate-allocator
      instructions: "Ship the accelerator cluster (T4.1.8–T4.1.10) in one run."
      tags: [accelerate, allocator]
      max_tasks_per_run: 3
  ```

  The orchestrator sync normalises the data and persists it in task metadata.

- **plan_next tool** – responses now include a `clusters` array summarising membership and shared guidance:

  ```json
  {
    "tasks": [{ "id": "T4.1.8", "title": "...", "status": "pending" }],
    "clusters": [
      {
        "id": "accelerate-allocator",
        "instructions": "Ship the accelerator cluster (T4.1.8–T4.1.10) in one run.",
        "task_ids": ["T4.1.8", "T4.1.9", "T4.1.10"],
        "strategy": "clustered"
      }
    ]
  }
  ```

  Agents can read the `clusters` entry to grab the whole bundle when accelerating, instead of serialising single tasks.

- **task_create tool** – pass the same structure to tag new tasks created on the fly:

  ```json
  {
    "id": "T4.1.11",
    "title": "Allocator telemetry dashboards",
    "cluster": {
      "id": "accelerate-allocator",
      "instructions": "Finish allocator accelerate bundle in one run.",
      "strategy": "clustered"
    }
  }
  ```

### Strategy semantics

- `strategy` defaults to `clustered`, signalling “handle all members in one run”.
- `max_tasks_per_run` and `instructions` give explicit guardrails when the cluster should be partially consumed or explained to humans.
- `tags` are surfaced unmodified so downstream tooling can drive presets (e.g., acceleration vs. polish).

### Operational guidance

1. Mark every task that belongs to a run-level bundle with the same `cluster.id`.
2. Use `plan_next` to fetch active clusters; the summary lists member IDs to feed into follow-up tooling.
3. Update roadmap YAML (or use `task_create`) before starting an accelerated run so metadata is ready when the MCP session boots.
4. When a prerequisite task closes, the orchestrator automatically flips any dependent tasks from `blocked` to `pending`, so accelerated runs can flow straight into the next items without manual plan updates.
