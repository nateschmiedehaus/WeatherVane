import process from 'node:process';

const version = process.env.MOCK_WORKER_VERSION ?? 'v1';
const role = process.env.WVO_WORKER_ROLE ?? 'unknown';
const dryRunEnabled = process.env.WVO_DRY_RUN === '1';

process.send?.({
  type: 'ready',
  startedAt: new Date().toISOString(),
  version,
  flags: {
    dryRun: dryRunEnabled,
  },
});

process.on('message', (raw) => {
  if (!raw || typeof raw !== 'object') {
    return;
  }
  const message = raw as { id: string; method: string; params?: unknown };
  if (!message.id || !message.method) {
    return;
  }

  switch (message.method) {
    case 'getVersion': {
      process.send?.({
        id: message.id,
        ok: true,
        result: {
          version,
        },
      });
      break;
    }
    case 'health': {
      process.send?.({
        id: message.id,
        ok: true,
        result: {
          ok: true,
          version,
          role: process.env.WVO_WORKER_ROLE ?? 'unknown',
          dryRun: dryRunEnabled,
          flags: {
            dryRun: dryRunEnabled,
          },
        },
      });
      break;
    }
    case 'runTool': {
      const payload = (message.params ?? {}) as { name?: unknown; input?: unknown; idempotencyKey?: unknown };
      const toolName = typeof payload.name === 'string' ? payload.name : '';

      // Define allowed tools by role
      const orchestratorReadOnlyTools = new Set([
        'orchestrator_status',
        'auth_status',
        'plan_next',
        'fs_read',
        'autopilot_status',
        'heavy_queue_list',
        'codex_commands',
      ]);

      const orchestratorMutatingTools = new Set([
        'plan_update',
        'context_write',
        'context_snapshot',
        'fs_write',
        'cmd_run',
        'heavy_queue_enqueue',
        'heavy_queue_update',
        'artifact_record',
        'critics_run',
        'autopilot_record_audit',
      ]);

      const executorReadOnlyTools = new Set(['fs_read']);
      const executorMutatingTools = new Set(['cmd_run', 'fs_write']);

      // DRY_RUN enforcement
      if (dryRunEnabled) {
        if (role === 'executor') {
          if (!executorReadOnlyTools.has(toolName)) {
            process.send?.({
              id: message.id,
              ok: false,
              error: {
                message: `Dry-run mode forbids tool:${toolName}. Promote the worker before mutating state.`,
                name: 'DryRunViolation',
              },
            });
            break;
          }
        } else {
          // orchestrator role
          if (orchestratorMutatingTools.has(toolName)) {
            process.send?.({
              id: message.id,
              ok: false,
              error: {
                message: `Dry-run mode forbids tool:${toolName}. Promote the worker before mutating state.`,
                name: 'DryRunViolation',
              },
            });
            break;
          }
          if (!orchestratorReadOnlyTools.has(toolName)) {
            process.send?.({
              id: message.id,
              ok: false,
              error: {
                message: `unknown tool ${toolName || 'unknown'}`,
              },
            });
            break;
          }
        }
      }

      // Tool handlers for non-dry-run or allowed tools
      if (toolName === 'cmd_run') {
        process.send?.({
          id: message.id,
          ok: true,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ ok: true, tool: toolName }),
              },
            ],
          },
        });
        break;
      }

      if (toolName === 'fs_read') {
        if (role === 'executor') {
          process.send?.({
            id: message.id,
            ok: false,
            error: {
              message: 'executor_unsupported_tool:fs_read',
            },
          });
        } else {
          process.send?.({
            id: message.id,
            ok: true,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ path: (payload.input as { path?: string })?.path ?? 'mock' }),
                },
              ],
            },
          });
        }
        break;
      }

      if (toolName === 'fs_write') {
        const content = JSON.stringify({ ok: true, tool: toolName });
        process.send?.({
          id: message.id,
          ok: true,
          result: {
            content: [
              {
                type: 'text',
                text: content,
              },
            ],
          },
        });
        break;
      }

      if (toolName === 'plan_update' ||
          toolName === 'context_write' ||
          toolName === 'context_snapshot' ||
          toolName === 'heavy_queue_enqueue' ||
          toolName === 'heavy_queue_update' ||
          toolName === 'artifact_record' ||
          toolName === 'autopilot_record_audit' ||
          toolName === 'critics_run') {
        // Mutating tools that succeed in non-dry-run
        process.send?.({
          id: message.id,
          ok: true,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ ok: true, tool: toolName }),
              },
            ],
          },
        });
        break;
      }

      if (toolName === 'orchestrator_status' ||
          toolName === 'auth_status' ||
          toolName === 'plan_next' ||
          toolName === 'autopilot_status' ||
          toolName === 'heavy_queue_list' ||
          toolName === 'codex_commands') {
        // Read-only tools
        process.send?.({
          id: message.id,
          ok: true,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ ok: true, tool: toolName }),
              },
            ],
          },
        });
        break;
      }

      process.send?.({
        id: message.id,
        ok: false,
        error: {
          message: `unknown tool ${toolName || 'unknown'}`,
        },
      });
      break;
    }
    case 'echo': {
      process.send?.({
        id: message.id,
        ok: true,
        result: message.params ?? null,
      });
      break;
    }
    case 'getEnvVar': {
      const params = (message.params ?? {}) as { name?: unknown };
      const name = typeof params.name === 'string' ? params.name : '';
      process.send?.({
        id: message.id,
        ok: true,
        result: {
          name,
          value: name ? process.env[name] ?? null : null,
        },
      });
      break;
    }
    case 'fail': {
      process.send?.({
        id: message.id,
        ok: false,
        error: {
          message: 'intentional failure',
          code: 'MOCK_FAIL',
        },
      });
      break;
    }
    case 'plan':
    case 'dispatch':
    case 'verify':
    case 'report.mo': {
      // Orchestrator-specific methods
      if (role !== 'orchestrator') {
        process.send?.({
          id: message.id,
          ok: false,
          error: {
            message: `executor_unsupported_method:${message.method}`,
          },
        });
      } else {
        process.send?.({
          id: message.id,
          ok: true,
          result: {
            ok: true,
            method: message.method,
          },
        });
      }
      break;
    }
    default: {
      process.send?.({
        id: message.id,
        ok: false,
        error: {
          message: `unknown method ${message.method}`,
        },
      });
    }
  }
});
