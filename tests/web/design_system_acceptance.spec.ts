/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react-dom/test-utils";
import { createElement, Fragment } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";

const { fetchStoriesMock, fetchReportsMock } = vi.hoisted(() => ({
  fetchStoriesMock: vi.fn(),
  fetchReportsMock: vi.fn(),
}));

declare global {
  // Signal to React that the environment supports `act` to silence noisy warnings in JSDOM runs.
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../apps/web/src/lib/api", () => ({
  __esModule: true,
  fetchStories: fetchStoriesMock,
  fetchReports: fetchReportsMock,
}));

vi.mock("next/head", () => ({
  __esModule: true,
  default: ({ children }: { children?: unknown }) => createElement(Fragment, {}, children as any),
}));

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...rest
  }: {
    children: unknown;
    href: string | { pathname?: string };
  }) => {
    const destination =
      typeof href === "string" ? href : href?.pathname ?? String(href ?? "#");
    return createElement("a", { href: destination, ...rest }, children);
  },
}));

vi.mock("next/router", () => ({
  __esModule: true,
  useRouter: () => ({
    pathname: "/stories",
    prefetch: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("../../apps/web/src/components/ThemeToggle", () => ({
  __esModule: true,
  ThemeToggle: () => createElement("div", { "data-mock": "theme-toggle" }),
}));

vi.mock("../../apps/web/src/components/NavTabs", () => ({
  __esModule: true,
  NavTabs: () => createElement("nav", { "data-mock": "nav-tabs" }),
}));

vi.mock("../../apps/web/src/components/DemoTourDrawer", () => ({
  __esModule: true,
  DemoTourDrawer: () => createElement("aside", { "data-mock": "demo-tour" }),
}));

import StoriesPage from "../../apps/web/src/pages/stories";
import ReportsPage from "../../apps/web/src/pages/reports";
import type { StoriesResponse } from "../../apps/web/src/types/stories";
import type { ReportsResponse } from "../../apps/web/src/types/reports";

function setupContainer(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root };
}

async function advanceMicrotasks(iterations = 5) {
  for (let index = 0; index < iterations; index += 1) {
    // Flush queued microtasks to let async effects settle before assertions.
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

const sampleStoriesResponse: StoriesResponse = {
  tenant_id: "demo-tenant",
  generated_at: "2025-05-01T12:30:00Z",
  stories: [
    {
      title: "Heat advisory drives boardwalk traffic",
      summary:
        "Boardwalk and waterfront locations are pacing 14% above plan; boost premium cold beverage placements.",
      detail:
        "Temperatures will hold in the low 90s through the weekend. Extend evening staffing to capture elevated boardwalk foot traffic and highlight weather-driven bundles. Coordinate with paid social to amplify boardwalk footage if dew point exceeds 70°F.",
      icon: "🌤",
      confidence: "HIGH",
      plan_date: "2025-05-02",
      category: "Performance marketing",
      channel: "Paid Social",
    },
  ],
  context_tags: ["Boardwalk focus", "Heat surge"],
  context_warnings: [
    {
      code: "DATA_LAG",
      message: "Attribution refresh is lagging 6 hours behind weather feed.",
      severity: "warning",
    },
  ],
  data_context: {
    metadata: {
      weather_source: "noaa",
    },
  },
};

const sampleReportsResponse: ReportsResponse = {
  tenant_id: "demo-tenant",
  generated_at: "2025-05-01T10:00:00Z",
  hero_tiles: [
    {
      id: "roi",
      label: "Incremental ROI",
      value: 2.6,
      unit: "multiple",
      narrative: "Automation engine pushes are compounding lift across warm-weather categories.",
      delta_pct: 14.2,
      delta_value: 0.3,
    },
  ],
  narratives: [
    {
      id: "narrative-1",
      headline: "Waterfront patios outperformed control by 18%",
      summary:
        "Warm weather lifted waterfront spend efficiency, and Automation engine shifted budget to capitalize on higher conversion.",
      weather_driver: "Heatwave rolling through coastal metros",
      spend: 12500,
      expected_revenue: 32750,
      confidence: "HIGH",
      plan_date: "2025-05-02",
      category: "Paid Social",
      channel: "Meta",
    },
  ],
  trend: {
    cadence: "weekly",
    points: [
      {
        date: "2025-04-28",
        recommended_spend: 8200,
        weather_index: 1.18,
        guardrail_score: 0.82,
      },
    ],
  },
  schedule: {
    status: "active",
    cadence: "weekly",
    recipients: ["ops@weathervane.test"],
    delivery_format: "email",
    next_delivery_at: "2025-05-08T15:00:00Z",
    last_sent_at: "2025-05-01T15:00:00Z",
    can_edit: true,
    time_zone: "America/New_York",
    note: "Weekly executive briefing for Sarah and revenue partners.",
  },
  success: {
    headline: "Executive memo converted prospective retail partner",
    summary: "Sarah’s memo secured buy-in for the summer boardwalk showcase expansion.",
    metric_label: "Incremental revenue",
    metric_value: 78000,
    metric_unit: "usd",
    cta_label: "Review in Plan",
    cta_href: "/plan",
    persona: "executive",
  },
  context_tags: ["High guardrail confidence"],
  context_warnings: [
    {
      code: "REPORT_BACKLOG",
      message: "Allocator guardrail telemetry is refreshing on a slower interval.",
      severity: "warning",
    },
  ],
  data_context: {
    metadata: {
      delivery_channel: "email",
    },
  },
};

describe("Design system acceptance – Stories page", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    ({ container, root } = setupContainer());
    fetchStoriesMock.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders skip navigation, main landmark, and story metadata tokens", async () => {
    fetchStoriesMock.mockResolvedValueOnce(sampleStoriesResponse);

    await act(async () => {
      root.render(createElement(StoriesPage));
    });
    await advanceMicrotasks();

    const skipLink = container.querySelector('a[href="#main-content"]');
    expect(skipLink).toBeTruthy();
    expect(skipLink?.className).toContain("ds-pill");

    const main = container.querySelector("main#main-content");
    expect(main).toBeTruthy();

    const contextRegion = container.querySelector('[role="region"][aria-labelledby]');
    expect(contextRegion).toBeTruthy();

    const confidenceChip = container.querySelector('[data-confidence="HIGH"]');
    expect(confidenceChip).toBeTruthy();

    const ctaButtons = container.querySelectorAll(".ds-button");
    expect(ctaButtons.length).toBeGreaterThan(0);
    const primaryButton = Array.from(ctaButtons).find(
      (element) => element.getAttribute("data-variant") === "primary",
    );
    expect(primaryButton).toBeTruthy();

    const title = container.querySelector(".ds-title");
    expect(title?.textContent).toContain("Weekly weather stories");
  });

  it("announces copy interactions through the design system status pattern", async () => {
    fetchStoriesMock.mockResolvedValueOnce(sampleStoriesResponse);
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    try {
      await act(async () => {
        root.render(createElement(StoriesPage));
      });
      await advanceMicrotasks();

      const copyButton = Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("Copy briefing"),
      );
      expect(copyButton).toBeTruthy();

      vi.useFakeTimers();
      await act(async () => {
        copyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await advanceMicrotasks();

      expect(writeText).toHaveBeenCalledTimes(1);
      expect(copyButton?.getAttribute("data-state")).toBe("success");

      const status = Array.from(container.querySelectorAll('[role="status"]')).find((element) =>
        element.textContent?.includes("Briefing copied to clipboard."),
      );
      expect(status).toBeTruthy();
      expect(status?.classList.contains("ds-status")).toBe(true);
      expect(status?.getAttribute("aria-live")).toBe("polite");
      expect(status?.getAttribute("data-tone")).toBe("success");

      await act(async () => {
        vi.advanceTimersByTime(4000);
      });
      await advanceMicrotasks();

      expect(copyButton?.getAttribute("data-state")).toBeNull();
    } finally {
      vi.useRealTimers();
      if (originalClipboard) {
        Object.defineProperty(navigator, "clipboard", originalClipboard);
      } else {
        // Reset the shim so other tests do not inherit it.
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: undefined,
        });
      }
    }
  });

  it("marks the copy pathway as critical when clipboard access fails", async () => {
    fetchStoriesMock.mockResolvedValueOnce(sampleStoriesResponse);
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    try {
      await act(async () => {
        root.render(createElement(StoriesPage));
      });
      await advanceMicrotasks();

      const copyButton = Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("Copy briefing"),
      );
      expect(copyButton).toBeTruthy();

      await act(async () => {
        copyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await advanceMicrotasks();

      expect(writeText).toHaveBeenCalledTimes(1);
      expect(copyButton?.getAttribute("data-state")).toBe("error");

      const status = Array.from(container.querySelectorAll('[role="status"]')).find((element) =>
        element.textContent?.includes("Copy failed"),
      );
      expect(status).toBeTruthy();
      expect(status?.classList.contains("ds-status")).toBe(true);
      expect(status?.getAttribute("data-tone")).toBe("critical");
    } finally {
      if (originalClipboard) {
        Object.defineProperty(navigator, "clipboard", originalClipboard);
      } else {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: undefined,
        });
      }
    }
  });

  it("sets critical tone when copy fails in the reports share flow", async () => {
    fetchReportsMock.mockResolvedValueOnce(sampleReportsResponse);
    const writeText = vi.fn().mockRejectedValue(new Error("blocked"));
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    try {
      await act(async () => {
        root.render(createElement(ReportsPage));
      });
      await advanceMicrotasks();

      const copyButton = Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("Copy executive briefing"),
      );
      expect(copyButton).toBeTruthy();

      await act(async () => {
        copyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await advanceMicrotasks();

      expect(writeText).toHaveBeenCalledTimes(1);
      expect(copyButton?.getAttribute("data-state")).toBe("error");

      const status = Array.from(container.querySelectorAll('[role="status"]')).find((element) =>
        element.textContent?.includes("Share failed"),
      );
      expect(status).toBeTruthy();
      expect(status?.classList.contains("ds-status")).toBe(true);
      expect(status?.getAttribute("data-tone")).toBe("critical");
    } finally {
      if (originalClipboard) {
        Object.defineProperty(navigator, "clipboard", originalClipboard);
      } else {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: undefined,
        });
      }
    }
  });
});

describe("Design system acceptance – Reports page", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    ({ container, root } = setupContainer());
    fetchReportsMock.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders executive report layout with design system components", async () => {
    fetchReportsMock.mockResolvedValueOnce(sampleReportsResponse);

    await act(async () => {
      root.render(createElement(ReportsPage));
    });
    await advanceMicrotasks();

    const skipLink = container.querySelector('a[href="#main-content"]');
    expect(skipLink).toBeTruthy();

    const heroHeading = container.querySelector(".ds-display-small");
    expect(heroHeading?.textContent).toContain("Executive Reports");

    const trendTable = container.querySelector("table");
    expect(trendTable?.querySelectorAll("thead th")).toHaveLength(4);

    const contextRegion = container.querySelector('[role="region"][aria-labelledby]');
    expect(contextRegion).toBeTruthy();

    const scheduleStatus = container.querySelector("[data-state]");
    expect(scheduleStatus?.textContent).toContain("ACTIVE");

    const shareButtons = container.querySelectorAll(".ds-button");
    expect(shareButtons.length).toBeGreaterThanOrEqual(3);
    const primaryShare = Array.from(shareButtons).find((button) =>
      button.textContent?.includes("Copy executive briefing"),
    );
    expect(primaryShare?.getAttribute("data-variant")).toBe("primary");
  });

  it("surfaced share feedback through the status region when copying", async () => {
    fetchReportsMock.mockResolvedValueOnce(sampleReportsResponse);
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    try {
      await act(async () => {
        root.render(createElement(ReportsPage));
      });
      await advanceMicrotasks();

      const copyButton = Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("Copy executive briefing"),
      );
      expect(copyButton).toBeTruthy();

      await act(async () => {
        copyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await advanceMicrotasks();

      expect(writeText).toHaveBeenCalledTimes(1);

      const status = Array.from(container.querySelectorAll('[role="status"]')).find((element) =>
        element.textContent?.includes("Briefing copied to clipboard."),
      );
      expect(status).toBeTruthy();
      expect(status?.classList.contains("ds-status")).toBe(true);
      expect(status?.getAttribute("data-tone")).toBe("success");
      expect(status?.getAttribute("aria-live")).toBe("polite");
    } finally {
      if (originalClipboard) {
        Object.defineProperty(navigator, "clipboard", originalClipboard);
      } else {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: undefined,
        });
      }
    }
  });
});
