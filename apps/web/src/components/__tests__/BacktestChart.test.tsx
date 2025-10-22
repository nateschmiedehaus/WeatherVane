import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { BacktestChart } from "../BacktestChart";
import type { BacktestPoint } from "../../types/incrementality";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const CHART_WIDTH = 520;
const CHART_HEIGHT = 200;
const MARGIN_X = 36;
const MARGIN_Y = 20;

interface RenderResult {
  container: HTMLDivElement;
  root: ReturnType<typeof createRoot>;
  shell: HTMLElement | null;
  cleanup(): void;
}

function renderChart(points: BacktestPoint[], title?: string): RenderResult {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<BacktestChart points={points} title={title} />);
  });

  const shell = container.firstElementChild as HTMLElement | null;

  return {
    container,
    root,
    shell,
    cleanup: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function createPoint(overrides: Partial<BacktestPoint>): BacktestPoint {
  return {
    timestamp: "2024-01-01T00:00:00Z",
    horizon_days: null,
    actual: 0,
    predicted: 0,
    error: 0,
    absolute_error: 0,
    cumulative_actual: 0,
    cumulative_predicted: 0,
    cumulative_lift: null,
    cumulative_lift_pct: null,
    ...overrides,
  };
}

function computeGeometry(points: BacktestPoint[]) {
  const actualSeries = points.map((point) => point.actual);
  const predictedSeries = points.map((point) => point.predicted);
  const cumulativeSeries = points
    .map((point) => point.cumulative_lift ?? null)
    .filter((value): value is number => value !== null && value !== undefined);

  const allValues = [...actualSeries, ...predictedSeries];
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  const valueRange = maxValue - minValue || 1;

  const scaleX = (index: number) => {
    if (points.length === 1) {
      return MARGIN_X + (CHART_WIDTH - MARGIN_X * 2) / 2;
    }
    const fraction = index / (points.length - 1);
    return MARGIN_X + fraction * (CHART_WIDTH - MARGIN_X * 2);
  };

  const scaleY = (value: number) => {
    const fraction = (value - minValue) / valueRange;
    return CHART_HEIGHT - MARGIN_Y - fraction * (CHART_HEIGHT - MARGIN_Y * 2);
  };

  const cumulativeExtents =
    cumulativeSeries.length > 0
      ? {
          min: Math.min(...cumulativeSeries),
          max: Math.max(...cumulativeSeries),
        }
      : { min: 0, max: 0 };

  const cumulativeRange = cumulativeExtents.max - cumulativeExtents.min || 1;
  const scaleCumulative = (value: number) => {
    const fraction = (value - cumulativeExtents.min) / cumulativeRange;
    return CHART_HEIGHT - MARGIN_Y - fraction * (CHART_HEIGHT - MARGIN_Y * 2);
  };

  const buildPath = (values: number[], yScale: (value: number) => number) =>
    values
      .map((value, index) => {
        const x = scaleX(index);
        const y = yScale(value);
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");

  const actualPath = buildPath(actualSeries, scaleY);
  const predictedPath = buildPath(predictedSeries, scaleY);

  const cumulativePath =
    cumulativeSeries.length > 0
      ? buildPath(
          points.map((point) => point.cumulative_lift ?? cumulativeExtents.min),
          scaleCumulative,
        )
      : null;

  const lastIndex = points.length - 1;
  const latestPoint = points[lastIndex];

  const safeActual = Number.isFinite(latestPoint.actual)
    ? latestPoint.actual
    : actualSeries.find((value) => Number.isFinite(value)) ?? 0;
  const safePredicted = Number.isFinite(latestPoint.predicted)
    ? latestPoint.predicted
    : predictedSeries.find((value) => Number.isFinite(value)) ?? 0;

  return {
    actualPath,
    predictedPath,
    cumulativePath,
    latestX: scaleX(lastIndex),
    latestActualY: scaleY(safeActual),
    latestPredictedY: scaleY(safePredicted),
  };
}

describe("BacktestChart", () => {
  it("renders a placeholder when there are fewer than two points", () => {
    const points = [createPoint({ actual: 120, predicted: 110, error: 10, absolute_error: 10 })];
    const { shell, cleanup } = renderChart(points, "Backtest timeline");

    try {
      expect(shell?.textContent).toContain(
        "Backtest data will appear once at least two performance snapshots are stored.",
      );
    } finally {
      cleanup();
    }
  });

  it("renders chart geometry using the provided points", () => {
    const points: BacktestPoint[] = [
      createPoint({
        timestamp: "2024-01-01T08:00:00Z",
        actual: 100,
        predicted: 95,
        error: 5,
        absolute_error: 5,
        cumulative_actual: 100,
        cumulative_predicted: 95,
        cumulative_lift: 5,
        cumulative_lift_pct: 0.05,
      }),
      createPoint({
        timestamp: "2024-01-02T08:00:00Z",
        actual: 120,
        predicted: 115,
        error: 5,
        absolute_error: 5,
        cumulative_actual: 220,
        cumulative_predicted: 210,
        cumulative_lift: 10,
        cumulative_lift_pct: 0.045,
      }),
      createPoint({
        timestamp: "2024-01-03T08:00:00Z",
        actual: 140,
        predicted: 130,
        error: 10,
        absolute_error: 10,
        cumulative_actual: 360,
        cumulative_predicted: 340,
        cumulative_lift: 20,
        cumulative_lift_pct: 0.055,
      }),
    ];

    const geometry = computeGeometry(points);
    const { shell, cleanup } = renderChart(points, "Backtest timeline");

    try {
      const svg = shell?.querySelector("svg");
      expect(svg).not.toBeNull();

      const paths = svg?.querySelectorAll("path") ?? [];
      expect(paths).toHaveLength(3);

      expect(paths[0]?.getAttribute("d")).toBe(geometry.cumulativePath);
      expect(paths[1]?.getAttribute("d")).toBe(geometry.actualPath);
      expect(paths[2]?.getAttribute("d")).toBe(geometry.predictedPath);

      const markers = svg?.querySelectorAll("circle") ?? [];
      expect(markers).toHaveLength(2);

      expect(Number(markers[0]?.getAttribute("cx"))).toBeCloseTo(geometry.latestX);
      expect(Number(markers[0]?.getAttribute("cy"))).toBeCloseTo(geometry.latestActualY);
      expect(Number(markers[1]?.getAttribute("cx"))).toBeCloseTo(geometry.latestX);
      expect(Number(markers[1]?.getAttribute("cy"))).toBeCloseTo(geometry.latestPredictedY);

      expect(shell?.textContent).toContain("Cumulative lift:");
    } finally {
      cleanup();
    }
  });

  it("falls back to cumulative lift value when percentage telemetry is unavailable", () => {
    const points: BacktestPoint[] = [
      createPoint({
        timestamp: "2024-02-01T00:00:00Z",
        actual: 80,
        predicted: 78,
        error: 2,
        absolute_error: 2,
        cumulative_actual: 80,
        cumulative_predicted: 78,
        cumulative_lift: 2,
      }),
      createPoint({
        timestamp: "2024-02-02T00:00:00Z",
        actual: 90,
        predicted: 88,
        error: 2,
        absolute_error: 2,
        cumulative_actual: 170,
        cumulative_predicted: 166,
        cumulative_lift: 4.5,
      }),
    ];

    const { shell, cleanup } = renderChart(points, "Backtest timeline");

    try {
      expect(shell?.textContent).toContain("Cumulative lift: 4.5");
    } finally {
      cleanup();
    }
  });
});
