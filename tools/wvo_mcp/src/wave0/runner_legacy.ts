import { Wave0Runner } from "./runner.js";

export type LegacyWave0Options = {
  singleRun?: boolean;
  targetEpics?: string[];
};

/**
 * Compatibility shim so legacy scripts can continue importing the old runner path
 * while Stage 7 restructures land. Delegates directly to the current Wave0Runner.
 */
export async function runLegacyWave0(options: LegacyWave0Options = {}): Promise<void> {
  const runner = new Wave0Runner(process.cwd(), options);
  await runner.run();
}
