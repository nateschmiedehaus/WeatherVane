import { Critic } from "./base.js";
import { join } from "path";
import { readFile } from "../executor/file_ops.js";
import { parseJsonSafe } from "../utils/json.js";
import type { CommandResult } from "../utils/types.js";

interface WeatherGuardrailReport {
  geocoded_ratio: number;
  weather_coverage: number;
  missing_weather_rows: number;
  leakage_rows: number;
  status: "ok" | "warning" | "error";
  messages: string[];
  timestamp: string;
}

const REGRESSION_THRESHOLDS = {
  geocodedRatioDrop: 0.02, // Allow 2% drop in geocoding ratio
  weatherMissingIncrease: 0, // No increase in missing weather allowed
  leakageRowIncrease: 0, // No increase in leakage rows allowed
};

const REPORT_PATH = "experiments/features/weather_guardrail_report.json";
const BASELINE_PATH = "state/analytics/weather_coverage_baseline.json";
const WATCH_PATH = "state/analytics/weather_coverage_watch.json";

const COMMAND =
  'PYTHONPATH=.deps:. python -m apps.worker.monitoring.weather_guardrail --tenant-id DEMO --lookback-days 30 ' +
  `--baseline-path ${BASELINE_PATH} --summary-path ${WATCH_PATH} --report-path ${REPORT_PATH}`;

export class WeatherCoverageCritic extends Critic {
  protected command(profile: string): string | null {
    if (profile !== "high") {
      return null;
    }
    return COMMAND;
  }

  protected async processOutput(output: string): Promise<CommandResult> {
    try {
      // Load and parse the generated report
      const rawContent = await readFile(REPORT_PATH, "utf8");
      const report = parseJsonSafe(rawContent) as WeatherGuardrailReport;

      if (report.status === "error") {
        return this.fail(`Weather coverage regression detected:\n\n${report.messages.join("\n")}`, {
          ...report,
          type: "weather_coverage_regression"
        });
      }

      return this.pass("Weather coverage checks passed", {
        report,
        type: "weather_coverage_check"
      });
    } catch (error) {
      return this.fail(`Failed to process weather coverage report: ${error}`, {
        error: String(error),
        type: "weather_coverage_error"
      });
    }
  }
}
