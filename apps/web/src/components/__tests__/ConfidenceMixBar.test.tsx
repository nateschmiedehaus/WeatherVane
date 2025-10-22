import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { ConfidenceMixBar } from "../ConfidenceMixBar";
import type { ConfidenceMixSegment } from "../../lib/plan-insights";

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

const renderBar = (segments: ConfidenceMixSegment[], total: number): RenderResult => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<ConfidenceMixBar segments={segments} total={total} />);
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

describe("ConfidenceMixBar", () => {
  it("renders segments with accessible summary", () => {
    const segments: ConfidenceMixSegment[] = [
      { level: "HIGH", count: 6, percentage: 60 },
      { level: "MEDIUM", count: 3, percentage: 30 },
      { level: "LOW", count: 1, percentage: 10 },
    ];
    const { container, cleanup } = renderBar(segments, 10);

    const bar = container.querySelector('[role="img"]');
    expect(bar).not.toBeNull();
    expect(bar?.getAttribute("aria-label")).toContain("6 high confidence slices");

    const legendItems = container.querySelectorAll("dd");
    expect(legendItems.length).toBe(3);
    expect(legendItems[0].textContent).toContain("60.0%");

    cleanup();
  });

  it("shows fallback when telemetry has not landed", () => {
    const segments: ConfidenceMixSegment[] = [
      { level: "HIGH", count: 0, percentage: 0 },
      { level: "MEDIUM", count: 0, percentage: 0 },
      { level: "LOW", count: 0, percentage: 0 },
    ];
    const { container, cleanup } = renderBar(segments, 0);

    expect(container.textContent).toContain("Awaiting telemetry");

    cleanup();
  });
});

