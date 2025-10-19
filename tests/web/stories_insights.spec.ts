import { describe, expect, it } from "vitest";

import {
  buildStoryHighlights,
  buildStorySharePayload,
  formatStoryDate,
} from "../../apps/web/src/lib/stories-insights";
import type { WeatherStory } from "../../apps/web/src/types/stories";

const baseStory: WeatherStory = {
  title: "Harbor winds accelerate coastal demand",
  summary:
    "Coastal foot traffic is trending 12% above baseline; anchor promotions will convert curious tourists.",
  detail:
    "Run back-to-back promenade showcases with weather-driven playlists. Expect signage traffic spikes near the marina in the afternoon. Bundle premium rainwear merchandising alongside clearance swimwear to capture the swing in demand. Escalate social promos if gusts exceed 25 mph.",
  icon: "🌊",
  confidence: "high",
  plan_date: "2025-05-04T00:00:00Z",
  category: "merchandising",
  channel: "Retail",
};

describe("buildStoryHighlights", () => {
  it("extracts distinct highlight sentences and enforces the limit", () => {
    const highlights = buildStoryHighlights(baseStory.detail, { limit: 3 });
    expect(highlights).toHaveLength(3);
    expect(highlights[0]).toContain("promenade showcases");
    expect(highlights[1]).toContain("signage traffic");
    expect(highlights[2]).toContain("rainwear merchandising");
  });

  it("returns an empty list when detail is missing", () => {
    expect(buildStoryHighlights(null)).toEqual([]);
    expect(buildStoryHighlights("")).toEqual([]);
  });
});

describe("buildStorySharePayload", () => {
  it("hydrates a briefing payload with computed highlights", () => {
    const payload = buildStorySharePayload(baseStory, { horizonDays: 7 });

    expect(payload).toContain(baseStory.title);
    expect(payload).toContain("Harbor winds accelerate coastal demand — Retail (high)");
    expect(payload).toContain("Highlights:");
    expect(payload.split("\n").filter((line) => line.startsWith("• "))).toHaveLength(3);
    expect(payload).toContain("Horizon: 7 days");
  });

  it("honours provided highlights and formatting helpers", () => {
    const customHighlights = ["Coordinate with the allocator", "Record briefing for Stories"];
    const payload = buildStorySharePayload(baseStory, { highlights: customHighlights });

    customHighlights.forEach((highlight) => {
      expect(payload).toContain(`• ${highlight}`);
    });
    expect(payload).not.toContain("Horizon:");
    expect(payload).toContain(formatStoryDate(baseStory.plan_date));
  });
});
