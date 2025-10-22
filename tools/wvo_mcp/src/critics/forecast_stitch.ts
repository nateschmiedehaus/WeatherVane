import { Critic } from "./base.js";

const COMMAND =
  'PYTHONPATH=.deps:. python -m apps.worker.monitoring.forecast_stitch --summary-path state/analytics/forecast_stitch_watch.json';

export class ForecastStitchCritic extends Critic {
  protected command(profile: string): string | null {
    // Run on all profiles
    return COMMAND;
  }
}
