import { describe, expect, it } from "vitest";

describe("weatherRegionSlug", () => {
  it("normalises whitespace and casing while caching lookups", async () => {
    const { weatherRegionSlug } = await import(
      "../../apps/web/src/lib/dashboard-insights"
    );

    const first = weatherRegionSlug("  North   America  ");
    const second = weatherRegionSlug("north america");

    expect(first).toBe("north-america");
    expect(second).toBe(first);
  });

  it("falls back to the unspecified slug when given empty regions", async () => {
    const { weatherRegionSlug } = await import(
      "../../apps/web/src/lib/dashboard-insights"
    );

    expect(weatherRegionSlug("")).toBe("unspecified-region");
    expect(weatherRegionSlug(null)).toBe("unspecified-region");
  });
});
