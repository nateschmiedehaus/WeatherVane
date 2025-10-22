import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { LiftConfidenceCard } from "../LiftConfidenceCard";
import type { ExperimentLift, ExperimentPayload } from "../../types/plan";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

interface RenderResult {
  container: HTMLDivElement;
  root: ReturnType<typeof createRoot>;
  cleanup(): void;
}

const renderCard = (
  lift: ExperimentLift | null = null,
  experiment: ExperimentPayload | null = null
): RenderResult => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<LiftConfidenceCard lift={lift} experiment={experiment} />);
  });

  return {
    container,
    root,
    cleanup: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
};

describe("LiftConfidenceCard", () => {
  it("renders nothing when no lift and no experiment", () => {
    const { container, cleanup } = renderCard(null, null);
    expect(container.firstChild).toBeNull();
    cleanup();
  });

  it("renders awaiting state when experiment pending", () => {
    const experiment: ExperimentPayload = {
      experiment_id: "exp-1",
      status: "pending",
      metric_name: "roas",
      treatment_geos: ["NYC"],
      control_geos: ["SF"],
    };
    const { container, cleanup } = renderCard(null, experiment);

    expect(container.textContent).toContain("Awaiting results");
    cleanup();
  });

  it("renders with lift data and shows significant badge", () => {
    const lift: ExperimentLift = {
      absolute_lift: 0.15,
      lift_pct: 15.0,
      confidence_low: 0.08,
      confidence_high: 0.22,
      p_value: 0.02,
      sample_size: 1000,
      is_significant: true,
      generated_at: "2025-10-21T00:00:00Z",
    };
    const { container, cleanup } = renderCard(lift);

    expect(container.textContent).toContain("15.0%");
    expect(container.textContent).toContain("8.0%");
    expect(container.textContent).toContain("22.0%");
    expect(container.textContent).toContain("Significant");
    expect(container.textContent).toContain("0.020");

    cleanup();
  });

  it("renders experiment details when provided", () => {
    const lift: ExperimentLift = {
      absolute_lift: 0.1,
      lift_pct: 10.0,
      confidence_low: 0.05,
      confidence_high: 0.15,
      p_value: 0.05,
      sample_size: 500,
      is_significant: false,
    };

    const experiment: ExperimentPayload = {
      experiment_id: "exp-123",
      status: "completed",
      metric_name: "roas",
      treatment_geos: ["NYC", "LA"],
      control_geos: ["SF", "CHI"],
      treatment_spend: 50000,
      control_spend: 50000,
      lift,
    };

    const { container, cleanup } = renderCard(lift, experiment);

    expect(container.textContent).toContain("NYC");
    expect(container.textContent).toContain("LA");
    expect(container.textContent).toContain("SF");
    expect(container.textContent).toContain("CHI");
    expect(container.textContent).toContain("50,000");

    cleanup();
  });

  it("shows non-significant verdict when p-value is high", () => {
    const lift: ExperimentLift = {
      absolute_lift: 0.05,
      lift_pct: 5.0,
      confidence_low: -0.02,
      confidence_high: 0.12,
      p_value: 0.15,
      sample_size: 100,
      is_significant: false,
    };
    const { container, cleanup } = renderCard(lift);

    expect(container.textContent).toContain("does not meet significance threshold");
    cleanup();
  });

  it("renders experiment setup details correctly", () => {
    const experiment: ExperimentPayload = {
      experiment_id: "exp-1",
      status: "completed",
      metric_name: "roas",
      treatment_geos: ["NYC"],
      control_geos: ["SF"],
      treatment_spend: 12345.67,
      control_spend: 9876.54,
      lift: {
        absolute_lift: 0.2,
        lift_pct: 20.0,
        confidence_low: 0.1,
        confidence_high: 0.3,
        p_value: 0.001,
        sample_size: 2000,
        is_significant: true,
      },
    };
    const { container, cleanup } = renderCard(experiment.lift, experiment);

    expect(container.textContent).toContain("Treatment geos");
    expect(container.textContent).toContain("Control geos");
    expect(container.textContent).toContain("Experiment setup");

    cleanup();
  });
});
