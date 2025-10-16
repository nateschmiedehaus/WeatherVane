export function isDryRunEnabled(): boolean {
  return process.env.WVO_DRY_RUN === '1';
}

export function createDryRunError(operation: string): Error {
  const error = new Error(
    `Dry-run mode forbids ${operation}. Promote the worker before mutating state.`,
  );
  error.name = 'DryRunViolation';
  return error;
}

export function assertDryRunWriteAllowed(operation: string): void {
  if (isDryRunEnabled()) {
    throw createDryRunError(operation);
  }
}
