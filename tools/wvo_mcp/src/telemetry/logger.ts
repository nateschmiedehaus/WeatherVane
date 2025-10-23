export function logInfo(message: string, payload?: Record<string, unknown>): void {
  const base = {
    level: "info",
    message,
    timestamp: new Date().toISOString(),
    ...payload,
  };
  process.stderr.write(`${JSON.stringify(base)}\n`);
}

export function logWarning(message: string, payload?: Record<string, unknown>): void {
  const base = {
    level: "warning",
    message,
    timestamp: new Date().toISOString(),
    ...payload,
  };
  process.stderr.write(`${JSON.stringify(base)}\n`);
}

export function logError(message: string, payload?: Record<string, unknown>): void {
  const base = {
    level: "error",
    message,
    timestamp: new Date().toISOString(),
    ...payload,
  };
  process.stderr.write(`${JSON.stringify(base)}\n`);
}

export function logDebug(message: string, payload?: Record<string, unknown>): void {
  const base = {
    level: "debug",
    message,
    timestamp: new Date().toISOString(),
    ...payload,
  };
  process.stderr.write(`${JSON.stringify(base)}\n`);
}
