import { describe, expect, it } from "vitest";

import {
  buildAutomationUpdatePayload,
  validateAutomationSettings,
} from "../../apps/web/src/lib/automationValidation";
import type { AutomationSettings, GuardrailSettings } from "../../apps/web/src/types/automation";

const baseGuardrails: GuardrailSettings = {
  max_daily_budget_delta_pct: 25,
  min_daily_spend: 750,
  roas_floor: 1.8,
  cpa_ceiling: 120,
  change_windows: ["weekdays", "north_america"],
};

const baseSettings: AutomationSettings = {
  mode: "assist",
  pushes_enabled: true,
  daily_push_cap: 6,
  push_window_start_utc: "08:00",
  push_window_end_utc: "18:00",
  guardrails: baseGuardrails,
  consent: {
    status: "granted",
    version: "1.0",
    granted_at: "2025-01-01T00:00:00Z",
    revoked_at: null,
    actor: "ops@weathervane.com",
    channel: "email",
  },
  retention_days: 30,
  last_export_at: null,
  last_delete_at: null,
  last_updated_at: null,
  updated_by: "ops@weathervane.com",
  notes: "Baseline automations configuration",
  data_context_tags: [],
};

function buildSettings(overrides: Partial<AutomationSettings> = {}): AutomationSettings {
  return {
    ...baseSettings,
    ...overrides,
    guardrails: {
      ...baseSettings.guardrails,
      ...(overrides.guardrails ?? {}),
    },
    consent: {
      ...baseSettings.consent,
      ...(overrides.consent ?? {}),
    },
  };
}

describe("validateAutomationSettings", () => {
  it("treats compliant automation settings as valid", () => {
    const result = validateAutomationSettings(buildSettings());

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it("flags missing daily cap when pushes are enabled", () => {
    const result = validateAutomationSettings(
      buildSettings({
        daily_push_cap: 0,
      }),
    );

    expect(result.isValid).toBe(false);
    expect(result.errors.daily_push_cap).toBe(
      "Set a positive daily push cap when automated pushes are enabled.",
    );
  });

  it("requires consistent push window times when either value is provided", () => {
    const result = validateAutomationSettings(
      buildSettings({
        push_window_start_utc: "09:00",
        push_window_end_utc: null,
      }),
    );

    expect(result.isValid).toBe(false);
    expect(result.errors.push_window_start_utc).toBe(
      "Provide both a start and end time or clear the push window.",
    );
    expect(result.errors.push_window_end_utc).toBe(
      "Provide both a start and end time or clear the push window.",
    );
  });
});

describe("buildAutomationUpdatePayload", () => {
  it("preserves field values and surfaces validation errors for inconsistent guardrails", () => {
    const settings = buildSettings({
      push_window_start_utc: "20:00",
      push_window_end_utc: "07:30",
      guardrails: {
        ...baseGuardrails,
        roas_floor: -1,
        change_windows: ["north-america", "invalid token"],
      },
      retention_days: -4,
    });

    const { payload, validation } = buildAutomationUpdatePayload(settings, "ops@weathervane.com");

    expect(validation.isValid).toBe(false);
    expect(validation.errors.push_window_start_utc).toBe("End time must be later than the start time.");
    expect(validation.errors["guardrails.roas_floor"]).toBe("ROAS floor must be a positive number.");
    expect(validation.errors["guardrails.change_windows"]).toBe(
      "Use only letters, numbers, dashes, or underscores for change windows.",
    );
    expect(validation.errors.retention_days).toBe("Retention must be zero or greater.");

    expect(payload.mode).toBe(settings.mode);
    expect(payload.guardrails?.change_windows).toEqual(settings.guardrails.change_windows);
    expect(payload.updated_by).toBe("ops@weathervane.com");
  });
});
