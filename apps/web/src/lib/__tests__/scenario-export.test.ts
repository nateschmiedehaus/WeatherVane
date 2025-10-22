import { describe, expect, it } from "vitest";

import {
  buildScenarioSummaryCsv,
  buildScenarioChannelsCsv,
  buildRecommendationsCsv,
  buildCompleteScenarioCsv,
  buildScenarioExportFilename,
  buildPowerPointData,
  exportPowerPointJson,
} from "../scenario-export";
import type { ScenarioOutcome } from "../scenario-builder";
import type { ScenarioRecommendation } from "../../types/scenario";

describe("scenario-export", () => {
  const mockOutcome: ScenarioOutcome = {
    summary: {
      totalBaseSpend: 10000,
      totalScenarioSpend: 12000,
      deltaSpend: 2000,
      totalBaseRevenue: 30000,
      totalScenarioRevenue: 36000,
      deltaRevenue: 6000,
      baseRoi: 3.0,
      scenarioRoi: 3.0,
      weightedConfidence: "HIGH",
    },
    channels: [
      {
        channel: "Google Ads",
        confidence: "HIGH",
        baseSpend: 5000,
        baseRevenue: 15000,
        scenarioSpend: 6000,
        scenarioRevenue: 18000,
        deltaSpend: 1000,
        deltaRevenue: 3000,
        baseRoi: 3.0,
        scenarioRoi: 3.0,
      },
      {
        channel: "Meta Ads",
        confidence: "MEDIUM",
        baseSpend: 5000,
        baseRevenue: 15000,
        scenarioSpend: 6000,
        scenarioRevenue: 18000,
        deltaSpend: 1000,
        deltaRevenue: 3000,
        baseRoi: 3.0,
        scenarioRoi: 3.0,
      },
    ],
  };

  const mockAdjustments = {
    "Google Ads": 1.2,
    "Meta Ads": 1.2,
  };

  const mockRecommendations: ScenarioRecommendation[] = [
    {
      id: "rec1",
      label: "Test Recommendation",
      description: "Test description",
      tags: ["growth"],
      adjustments: [
        {
          channel: "Google Ads",
          multiplier: 1.15,
          rationale: "High ROI",
          confidence: "HIGH",
        },
      ],
    },
  ];

  describe("buildScenarioSummaryCsv", () => {
    it("should generate CSV with correct headers", () => {
      const csv = buildScenarioSummaryCsv(mockOutcome, "demo-tenant", 7);
      const lines = csv.split("\n");

      expect(lines[0]).toContain("export_type");
      expect(lines[0]).toContain("total_base_spend");
      expect(lines[0]).toContain("weighted_confidence");
    });

    it("should include summary values in second row", () => {
      const csv = buildScenarioSummaryCsv(mockOutcome, "demo-tenant", 7);
      const lines = csv.split("\n");
      const values = lines[1];

      expect(values).toContain("scenario_summary");
      expect(values).toContain("10000");
      expect(values).toContain("12000");
      expect(values).toContain("HIGH");
    });

    it("should handle horizon days parameter", () => {
      const csv = buildScenarioSummaryCsv(mockOutcome, "demo-tenant", 14);
      const lines = csv.split("\n");

      expect(lines[1]).toContain("14");
    });
  });

  describe("buildScenarioChannelsCsv", () => {
    it("should generate CSV with channel headers", () => {
      const csv = buildScenarioChannelsCsv(mockOutcome, mockAdjustments);
      const lines = csv.split("\n");

      expect(lines[0]).toContain("channel");
      expect(lines[0]).toContain("confidence");
      expect(lines[0]).toContain("adjustment_multiplier");
    });

    it("should include all channels", () => {
      const csv = buildScenarioChannelsCsv(mockOutcome, mockAdjustments);
      const lines = csv.split("\n");

      expect(lines).toHaveLength(3); // Header + 2 channels
      expect(csv).toContain("Google Ads");
      expect(csv).toContain("Meta Ads");
    });

    it("should include adjustment multipliers", () => {
      const csv = buildScenarioChannelsCsv(mockOutcome, mockAdjustments);

      expect(csv).toContain("1.2");
    });

    it("should handle missing adjustments with default 1", () => {
      const csv = buildScenarioChannelsCsv(mockOutcome, {});
      const lines = csv.split("\n");

      // Should have 1 (100%) as default multiplier
      expect(lines[1]).toContain(",1");
      expect(lines[2]).toContain(",1");
    });
  });

  describe("buildRecommendationsCsv", () => {
    it("should generate CSV with recommendation headers", () => {
      const csv = buildRecommendationsCsv(mockRecommendations);
      const lines = csv.split("\n");

      expect(lines[0]).toContain("recommendation_id");
      expect(lines[0]).toContain("label");
      expect(lines[0]).toContain("rationale");
    });

    it("should flatten adjustments into rows", () => {
      const csv = buildRecommendationsCsv(mockRecommendations);
      const lines = csv.split("\n");

      expect(lines).toHaveLength(2); // Header + 1 adjustment
      expect(csv).toContain("rec1");
      expect(csv).toContain("Test Recommendation");
      expect(csv).toContain("Google Ads");
    });

    it("should handle multiple adjustments per recommendation", () => {
      const multiAdjustmentRec: ScenarioRecommendation[] = [
        {
          id: "rec2",
          label: "Multi",
          description: "Test",
          tags: [],
          adjustments: [
            {
              channel: "Google Ads",
              multiplier: 1.1,
              rationale: "Reason 1",
              confidence: "HIGH",
            },
            {
              channel: "Meta Ads",
              multiplier: 0.9,
              rationale: "Reason 2",
              confidence: "MEDIUM",
            },
          ],
        },
      ];

      const csv = buildRecommendationsCsv(multiAdjustmentRec);
      const lines = csv.split("\n");

      expect(lines).toHaveLength(3); // Header + 2 adjustments
    });

    it("should handle empty recommendations", () => {
      const csv = buildRecommendationsCsv([]);
      const lines = csv.split("\n");

      expect(lines).toHaveLength(1); // Just header
    });
  });

  describe("buildCompleteScenarioCsv", () => {
    it("should include all sections", () => {
      const csv = buildCompleteScenarioCsv(
        mockOutcome,
        mockRecommendations,
        mockAdjustments,
        "demo-tenant",
        7
      );

      expect(csv).toContain("[SCENARIO SUMMARY]");
      expect(csv).toContain("[CHANNEL DETAILS]");
      expect(csv).toContain("[RECOMMENDATIONS]");
    });

    it("should separate sections with blank lines", () => {
      const csv = buildCompleteScenarioCsv(
        mockOutcome,
        mockRecommendations,
        mockAdjustments,
        "demo-tenant",
        7
      );

      expect(csv).toContain("\n\n");
    });

    it("should omit recommendations section when empty", () => {
      const csv = buildCompleteScenarioCsv(
        mockOutcome,
        [],
        mockAdjustments,
        "demo-tenant",
        7
      );

      expect(csv).not.toContain("[RECOMMENDATIONS]");
    });
  });

  describe("buildScenarioExportFilename", () => {
    it("should generate CSV filename with tenant and timestamp", () => {
      const filename = buildScenarioExportFilename("demo-tenant", "csv");

      expect(filename).toMatch(/^weathervane-scenario-demo-tenant-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.csv$/);
    });

    it("should generate PPTX filename with tenant and timestamp", () => {
      const filename = buildScenarioExportFilename("demo-tenant", "pptx");

      expect(filename).toMatch(/^weathervane-scenario-demo-tenant-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.pptx\.json$/);
    });

    it("should sanitize tenant ID", () => {
      const filename = buildScenarioExportFilename("demo@tenant#123", "csv");

      expect(filename).toContain("demo-tenant-123");
      expect(filename).not.toContain("@");
      expect(filename).not.toContain("#");
    });
  });

  describe("buildPowerPointData", () => {
    it("should generate title slide", () => {
      const slides = buildPowerPointData(
        mockOutcome,
        mockRecommendations,
        mockAdjustments,
        "demo-tenant",
        7
      );

      const titleSlide = slides[0];
      expect(titleSlide.slideType).toBe("title");
      expect(titleSlide.title).toContain("WeatherVane");
      expect(titleSlide.subtitle).toContain("demo-tenant");
      expect(titleSlide.subtitle).toContain("7-day");
    });

    it("should generate summary slide with metrics", () => {
      const slides = buildPowerPointData(
        mockOutcome,
        mockRecommendations,
        mockAdjustments,
        "demo-tenant",
        7
      );

      const summarySlide = slides.find((s) => s.slideType === "summary");
      expect(summarySlide).toBeDefined();
      expect(summarySlide?.content).toHaveLength(6); // 6 metrics
    });

    it("should generate channel detail slide with table", () => {
      const slides = buildPowerPointData(
        mockOutcome,
        mockRecommendations,
        mockAdjustments,
        "demo-tenant",
        7
      );

      const channelSlide = slides.find((s) => s.slideType === "channel_detail");
      expect(channelSlide).toBeDefined();

      const tableContent = channelSlide?.content.find((c) => c.type === "table");
      expect(tableContent).toBeDefined();
    });

    it("should generate chart slide", () => {
      const slides = buildPowerPointData(
        mockOutcome,
        mockRecommendations,
        mockAdjustments,
        "demo-tenant",
        7
      );

      const chartSlide = slides.find((s) => s.slideType === "chart");
      expect(chartSlide).toBeDefined();
      expect(chartSlide?.title).toContain("Spend Allocation");
    });

    it("should generate recommendation slides", () => {
      const slides = buildPowerPointData(
        mockOutcome,
        mockRecommendations,
        mockAdjustments,
        "demo-tenant",
        7
      );

      const recSlides = slides.filter((s) => s.slideType === "recommendation");
      expect(recSlides).toHaveLength(1);
      expect(recSlides[0].title).toBe("Test Recommendation");
    });

    it("should handle multiple recommendations", () => {
      const multiRecs = [
        ...mockRecommendations,
        {
          id: "rec2",
          label: "Second Rec",
          description: "Another test",
          tags: ["balanced"],
          adjustments: [
            {
              channel: "Meta Ads",
              multiplier: 0.9,
              rationale: "Test",
              confidence: "MEDIUM",
            },
          ],
        },
      ];

      const slides = buildPowerPointData(
        mockOutcome,
        multiRecs,
        mockAdjustments,
        "demo-tenant",
        7
      );

      const recSlides = slides.filter((s) => s.slideType === "recommendation");
      expect(recSlides).toHaveLength(2);
    });
  });

  describe("exportPowerPointJson", () => {
    it("should generate valid JSON", () => {
      const slides = buildPowerPointData(
        mockOutcome,
        mockRecommendations,
        mockAdjustments,
        "demo-tenant",
        7
      );
      const json = exportPowerPointJson(slides);

      expect(() => JSON.parse(json)).not.toThrow();
    });

    it("should include version and timestamp", () => {
      const slides = buildPowerPointData(
        mockOutcome,
        mockRecommendations,
        mockAdjustments,
        "demo-tenant",
        7
      );
      const json = exportPowerPointJson(slides);
      const parsed = JSON.parse(json);

      expect(parsed.version).toBe("1.0");
      expect(parsed.generatedAt).toBeDefined();
    });

    it("should include all slides", () => {
      const slides = buildPowerPointData(
        mockOutcome,
        mockRecommendations,
        mockAdjustments,
        "demo-tenant",
        7
      );
      const json = exportPowerPointJson(slides);
      const parsed = JSON.parse(json);

      expect(parsed.slides).toHaveLength(slides.length);
    });

    it("should format JSON with indentation", () => {
      const slides = buildPowerPointData(
        mockOutcome,
        mockRecommendations,
        mockAdjustments,
        "demo-tenant",
        7
      );
      const json = exportPowerPointJson(slides);

      // Check for indentation (pretty-printed JSON)
      expect(json).toContain("\n  ");
    });
  });
});
