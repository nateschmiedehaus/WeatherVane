import { WeatherCoverageCritic } from "./weather_coverage";

// Test subclass to allow access to protected methods
class TestWeatherCoverageCritic extends WeatherCoverageCritic {
  public testCommand(profile: string): string | null {
    return this.command(profile);
  }
}
import { readFile, writeFile } from "../executor/file_ops.js";
import { parseJsonSafe } from "../utils/json.js";
import { join } from "path";
import { mkdirSync, rmSync } from "fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("WeatherCoverageCritic", () => {
  let critic: TestWeatherCoverageCritic;

  beforeEach(() => {
    // Mock filesystem functions
    vi.mock("../executor/file_ops.js", () => ({
      readFile: vi.fn(),
      writeFile: vi.fn(),
    }));

    critic = new TestWeatherCoverageCritic("/test/workspace");

    // Mock protected methods
    Object.assign(critic, {
      pass: vi.fn().mockImplementation((msg, details) => ({
        code: 0,
        stdout: msg,
        stderr: "",
        details
      })),
      fail: vi.fn().mockImplementation((msg, details) => ({
        code: 1,
        stdout: "",
        stderr: msg,
        details
      }))
    });
  });

  it("should return null command for non-high profile", () => {
    expect(critic.testCommand("medium")).toBeNull();
  });

  it("should return valid command for high profile", () => {
    const command = critic.testCommand("high");
    expect(command).toContain("python -m apps.worker.monitoring.weather_guardrail");
    expect(command).toContain("--tenant-id DEMO");
    expect(command).toContain("--lookback-days 30");
  });

  describe("processOutput", () => {
    it("should pass when report status is ok", async () => {
      const mockReport = {
        status: "ok",
        geocoded_ratio: 0.95,
        weather_coverage: 0.98,
        missing_weather_rows: 0,
        leakage_rows: 0,
        messages: [],
        timestamp: new Date().toISOString()
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockReport));

      const result = await critic["processOutput"]("");
      expect(critic["pass"]).toHaveBeenCalledWith("Weather coverage checks passed", {
        report: mockReport,
        type: "weather_coverage_check"
      });
    });

    it("should fail and trigger investigation on error status", async () => {
      const mockReport = {
        status: "error",
        geocoded_ratio: 0.85,
        weather_coverage: 0.80,
        missing_weather_rows: 100,
        leakage_rows: 50,
        messages: ["Geocoding ratio dropped below threshold"],
        timestamp: new Date().toISOString()
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockReport));

      const result = await critic["processOutput"]("");
      expect(critic["fail"]).toHaveBeenCalledWith(
        "Weather coverage regression detected:\n\nGeocoding ratio dropped below threshold",
        {
          ...mockReport,
          type: "weather_coverage_regression"
        }
      );
    });

    it("should handle file read errors", async () => {
      const errorMessage = "File not found";
      vi.mocked(readFile).mockRejectedValue(new Error(errorMessage));

      const result = await critic["processOutput"]("");
      expect(critic["fail"]).toHaveBeenCalledWith(
        `Failed to process weather coverage report: Error: ${errorMessage}`,
        {
          error: `Error: ${errorMessage}`,
          type: "weather_coverage_error"
        }
      );
    });
  });
});