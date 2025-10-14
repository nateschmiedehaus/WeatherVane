import json
import os
import subprocess
import textwrap
from pathlib import Path


def _run_state_persistence_script(workspace_root: Path) -> dict:
    repo_root = Path(__file__).resolve().parents[1]
    loader_path = repo_root / "tools" / "wvo_mcp" / "node_modules" / "ts-node" / "esm.mjs"
    if not loader_path.exists():
        raise FileNotFoundError(f"Expected ts-node loader at {loader_path}")

    env = os.environ.copy()
    env["NODE_NO_WARNINGS"] = "1"
    env["TS_NODE_COMPILER_OPTIONS"] = json.dumps({"module": "es2022"})
    node_options = f"--loader={loader_path}"
    existing_node_options = env.get("NODE_OPTIONS", "").strip()
    env["NODE_OPTIONS"] = f"{existing_node_options} {node_options}".strip()

    script = textwrap.dedent(
        f"""
        const moduleUrl = new URL('./tools/wvo_mcp/src/orchestrator/state_machine.ts', import.meta.url);
        const workspaceRoot = {json.dumps(str(workspace_root))};
        const {{ StateMachine }} = await import(moduleUrl);
        const path = await import('node:path');
        const fs = await import('node:fs/promises');
        const {{ SafetyStateStore }} = await import(new URL('./tools/wvo_mcp/src/state/safety_state.ts', import.meta.url));

        const first = new StateMachine(workspaceRoot);
        const safetyStore = new SafetyStateStore(workspaceRoot);
        const upgradeLockPath = path.join(workspaceRoot, 'state', 'upgrade.lock');

        await fs.mkdir(path.dirname(upgradeLockPath), {{ recursive: true }});
        await fs.writeFile(upgradeLockPath, new Date().toISOString(), 'utf8');
        const upgradeLockBefore = await fs.readFile(upgradeLockPath, 'utf8');

        const safetyStateBefore = await safetyStore.write({{
          mode: 'stabilize',
          killSwitchEngaged: true,
          upgradeLockActive: true,
          incidents: [
            {{
              id: 'incident-upgrade',
              timestamp: new Date().toISOString(),
              severity: 'warning',
              summary: 'Upgrade in progress',
              details: {{ source: 'persistence_test' }},
            }},
          ],
          metadata: {{ origin: 'persistence_test' }},
          lastUpdated: null,
        }});

        first.createTask(
          {{
            id: 'T-parent',
            title: 'Persisted parent task',
            type: 'task',
            status: 'pending',
          }},
          'corr:T-parent:create',
        );

        await first.transition('T-parent', 'in_progress', undefined, 'corr:T-parent:start');
        await first.transition('T-parent', 'done', {{ summary: 'complete' }}, 'corr:T-parent:complete');

        first.createTask(
          {{
            id: 'T-child',
            title: 'Child task awaiting parent',
            type: 'task',
            status: 'pending',
          }},
          'corr:T-child:create',
        );

        first.addDependency('T-child', 'T-parent', 'blocks');

        first.recordQuality({{
          timestamp: Date.now(),
          task_id: 'T-parent',
          dimension: 'tests',
          score: 1,
          details: {{ suite: 'state_persistence' }},
        }});

        first.addContextEntry({{
          entry_type: 'learning',
          topic: 'state_persistence',
          content: 'State machine persisted task metadata and dependencies.',
          related_tasks: ['T-parent', 'T-child'],
          confidence: 0.9,
        }});

        const readyBeforeCheckpoint = first.getReadyTasks().map((task) => task.id);

        first.createCheckpoint({{
          session_id: 'session-state-test',
          git_sha: 'abc123',
          state_snapshot: {{ readyBeforeCheckpoint }},
          notes: 'Verifying state persistence across sessions.',
        }});

        first.close();

        const second = new StateMachine(workspaceRoot);
        const tasks = second.getTasks();
        const events = second.getEvents();
        const qualityMetrics = second.getQualityMetrics();
        const contextEntries = second.getContextEntries();
        const latestCheckpoint = second.getLatestCheckpoint();
        const dependencies = second.getDependencies('T-child');
        const scheduling = second.getTasksForScheduling();
        const health = second.getRoadmapHealth();

        const readyIds = scheduling.ready.map((task) => task.id);
        const parentTask = tasks.find((task) => task.id === 'T-parent') ?? null;
        const childTask = tasks.find((task) => task.id === 'T-child') ?? null;

        const upgradeLockExists = await fs.access(upgradeLockPath).then(
          () => true,
          () => false,
        );
        const upgradeLockAfter = upgradeLockExists
          ? await fs.readFile(upgradeLockPath, 'utf8')
          : null;
        const safetyStateAfter = await safetyStore.read();

        const payload = {{
          tasks,
          eventsCount: events.length,
          qualityCount: qualityMetrics.length,
          contextCount: contextEntries.length,
          checkpoint: latestCheckpoint,
          dependencies,
          readyIds,
          parentStatus: parentTask ? parentTask.status : null,
          parentMetadata: parentTask ? parentTask.metadata : null,
          childStatus: childTask ? childTask.status : null,
          health,
          upgradeLockExists,
          upgradeLockBefore,
          upgradeLockAfter,
          safetyStateBefore,
          safetyStateAfter,
        }};

        console.log(JSON.stringify(payload));
        second.close();
        """
    )

    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=repo_root,
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)


def test_state_machine_persists_tasks_and_metadata(tmp_path: Path) -> None:
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()

    payload = _run_state_persistence_script(workspace_root)

    assert payload["eventsCount"] >= 3
    assert payload["qualityCount"] == 1
    assert payload["contextCount"] == 1

    assert payload["parentStatus"] == "done"
    assert payload["childStatus"] == "pending"
    assert payload["parentMetadata"] == {"summary": "complete"}

    assert payload["dependencies"] == [
        {
            "task_id": "T-child",
            "depends_on_task_id": "T-parent",
            "dependency_type": "blocks",
        }
    ]

    assert "T-child" in payload["readyIds"]
    assert payload["checkpoint"]["session_id"] == "session-state-test"
    assert payload["checkpoint"]["state_snapshot"]["readyBeforeCheckpoint"] == ["T-child"]

    assert payload["health"]["totalTasks"] == 2
    assert payload["health"]["completedTasks"] == 1
    assert payload["upgradeLockExists"] is True
    assert payload["upgradeLockBefore"] == payload["upgradeLockAfter"]
    assert payload["upgradeLockBefore"]

    safety_before = payload["safetyStateBefore"]
    safety_after = payload["safetyStateAfter"]

    assert safety_before["killSwitchEngaged"] is True
    assert safety_after == safety_before
    assert safety_after["mode"] == "stabilize"
    assert safety_after["upgradeLockActive"] is True
    assert safety_after["lastUpdated"] is not None
    assert safety_after["incidents"]
    assert safety_after["incidents"][0]["severity"] == "warning"
    assert safety_after["metadata"]["origin"] == "persistence_test"
