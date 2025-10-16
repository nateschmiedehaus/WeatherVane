import process from 'node:process';

const version = process.env.MOCK_WORKER_VERSION ?? 'v1';

process.send?.({
  type: 'ready',
  startedAt: new Date().toISOString(),
  version,
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
