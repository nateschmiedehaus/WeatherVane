import { Critic } from "./base.js";

const COMMAND =
  "PYTHONPATH=.deps:. python -m apps.worker.monitoring.modeling_watch --monitoring-path state/dq_monitoring.json --summary-path state/analytics/modeling_data_watch.json";

export class ModelingDataWatchCritic extends Critic {
  protected command(profile: string): string | null {
    if (profile !== "high") {
      return null;
    }
    return COMMAND;
  }
}
