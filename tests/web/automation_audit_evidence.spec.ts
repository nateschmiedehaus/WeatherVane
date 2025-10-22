import { describe, expect, it } from "vitest";

import {
  buildAutomationAuditPreview,
  type AutomationAuditEvidenceItem,
} from "@web/demo/onboarding";
import type { DemoPreferences } from "@web/lib/demo";
import { normaliseAuditEvidence } from "@web/hooks/useOnboardingProgress";
import type { OnboardingAuditEvidenceResponse } from "@web/types/onboarding";

describe("automation audit evidence packets", () => {
  it("builds award-level evidence highlights for the demo autopilot channel", () => {
    const preferences: DemoPreferences = {
      primaryChannel: "meta",
      automationComfort: "autopilot",
    };

    const audits = buildAutomationAuditPreview(preferences);
    const primary = audits[0];

    expect(primary.evidence?.length).toBeGreaterThanOrEqual(3);

    const labels = primary.evidence?.map((item) => item.label);
    expect(labels).toContain("ROAS uplift");
    expect(labels).toContain("Budget shift");

    const rehearsal = primary.evidence?.find((item) => item.id === "rollback-readiness");
    expect(rehearsal?.link?.href).toContain("/audit/rollback/");
    expect(rehearsal?.context).toMatch(/Shadow autopilot replay/i);
  });

  it("merges live audit packets with fallback context and preserves narrative tone", () => {
    const preferences: DemoPreferences = {
      primaryChannel: "meta",
      automationComfort: "assist",
    };
    const demoAudits = buildAutomationAuditPreview(preferences);
    const fallbackEvidence = demoAudits[0].evidence as AutomationAuditEvidenceItem[];

    const livePacket: OnboardingAuditEvidenceResponse[] = [
      {
        id: fallbackEvidence[0].id,
        label: fallbackEvidence[0].label,
        value: "2.5×",
        tone: "success",
        context: "Live uplift vs. control over the last 6 hours.",
      },
      {
        id: "net-new-proof",
        label: "Lift p95",
        value: "+14%",
        tone: "info",
        link_href: "https://demo.weathervane.ai/audit/lift95/demo",
        link_label: "Download packet",
      },
      {
        id: fallbackEvidence[2].id,
        label: fallbackEvidence[2].label,
        value: "2 passes",
        tone: "info",
        context: null,
        link_href: fallbackEvidence[2].link?.href,
      },
    ];

    const merged = normaliseAuditEvidence(livePacket, fallbackEvidence) ?? [];

    expect(merged).toHaveLength(3);
    expect(merged[0].value).toBe("2.5×");
    expect(merged[1].label).toBe("Lift p95");
    expect(merged[1].link?.label).toBe("Download packet");

    const rehearse = merged.find((item) => item.id === fallbackEvidence[2].id);
    expect(rehearse?.context).toBe(fallbackEvidence[2].context);
    expect(rehearse?.tone).toBe("info");
  });

  it("builds trust-first narratives with actionable next steps", () => {
    const preferences: DemoPreferences = {
      primaryChannel: "meta",
      automationComfort: "autopilot",
    };

    const audits = buildAutomationAuditPreview(preferences);
    const primary = audits[0];
    const rehearsal = audits[2];

    expect(primary.narrative?.impactLabel).toBe("ROAS uplift");
    expect(primary.narrative?.impactValue).toBe("2.3×");
    expect(primary.narrative?.nextStep).toMatch(/Rollback rehearsal ready/i);
    expect(primary.actions?.[0].intent).toBe("view_evidence");
    expect(primary.actions?.[0].href).toMatch(/\/automations\/evidence/);
    expect(primary.actions?.[1].intent).toBe("rollback");

    expect(rehearsal.actions?.[0].intent).toBe("approve");
    expect(rehearsal.narrative?.why).toMatch(/shadow/i);
  });
});
