import { afterEach, describe, expect, it, vi } from "vitest";

import { trackDashboardEvent } from "../../apps/web/src/lib/analytics";

describe("analytics dispatcher", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("dispatches a custom event and pushes to the dataLayer when available", () => {
    class StubCustomEvent<T = unknown> extends Event {
      detail: T | undefined;
      constructor(type: string, params?: { detail?: T }) {
        super(type);
        this.detail = params?.detail;
      }
    }

    vi.stubGlobal("CustomEvent", StubCustomEvent as unknown as typeof CustomEvent);

    const dispatchSpy = vi.fn();
    const fakeWindow = { dispatchEvent: dispatchSpy } as unknown as Window & {
      dataLayer?: unknown[];
    };
    vi.stubGlobal("window", fakeWindow);

    const dataLayer: unknown[] = [];
    fakeWindow.dataLayer = dataLayer;

    trackDashboardEvent("dashboard.test_event", { active: true, region: "Gulf Coast" });

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const dispatched = dispatchSpy.mock.calls[0]?.[0] as StubCustomEvent;
    expect(dispatched?.type).toBe("analytics:track");
    expect(dispatched?.detail).toMatchObject({
      event: "dashboard.test_event",
      payload: { active: true, region: "Gulf Coast" },
    });

    expect(dataLayer).toHaveLength(1);
    expect(dataLayer[0]).toMatchObject({
      analyticsEvent: "dashboard.test_event",
      active: true,
      region: "Gulf Coast",
    });
  });

  it("fails gracefully when window is not defined", () => {
    vi.stubGlobal("window", undefined);

    expect(() => trackDashboardEvent("dashboard.test_event")).not.toThrow();

    vi.unstubAllGlobals();
  });
});
