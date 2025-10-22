import type {
  AutomationSettings,
  AutomationUpdatePayload,
} from "../types/automation";

export type AutomationValidationField =
  | "daily_push_cap"
  | "push_window_start_utc"
  | "push_window_end_utc"
  | "guardrails.max_daily_budget_delta_pct"
  | "guardrails.min_daily_spend"
  | "guardrails.roas_floor"
  | "guardrails.cpa_ceiling"
  | "guardrails.change_windows"
  | "retention_days";

export type AutomationValidationErrors = Partial<Record<AutomationValidationField, string>>;

export interface AutomationValidationResult {
  errors: AutomationValidationErrors;
  isValid: boolean;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseTimeToMinutes(value: string): number | null {
  const match = TIME_PATTERN.exec(value);
  if (!match) {
    return null;
  }
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  return hours * 60 + minutes;
}

function hasInvalidChangeWindows(changeWindows: string[]): boolean {
  return changeWindows.some((token) => !/^[a-z0-9_-]+$/i.test(token));
}

export function validateAutomationSettings(settings: AutomationSettings): AutomationValidationResult {
  const errors: AutomationValidationErrors = {};

  if (!Number.isFinite(settings.daily_push_cap) || settings.daily_push_cap < 0) {
    errors.daily_push_cap = "Daily push cap must be zero or greater.";
  } else if (settings.pushes_enabled && settings.daily_push_cap === 0) {
    errors.daily_push_cap = "Set a positive daily push cap when automated pushes are enabled.";
  }

  const { push_window_start_utc: startTime, push_window_end_utc: endTime } = settings;
  const hasStart = Boolean(startTime);
  const hasEnd = Boolean(endTime);

  if (hasStart !== hasEnd) {
    const message = "Provide both a start and end time or clear the push window.";
    errors.push_window_start_utc = message;
    errors.push_window_end_utc = message;
  } else if (hasStart && hasEnd && startTime && endTime) {
    const startMinutes = parseTimeToMinutes(startTime);
    const endMinutes = parseTimeToMinutes(endTime);

    if (startMinutes === null) {
      errors.push_window_start_utc = "Enter a start time in HH:MM format.";
    }
    if (endMinutes === null) {
      errors.push_window_end_utc = "Enter an end time in HH:MM format.";
    }
    if (
      startMinutes !== null &&
      endMinutes !== null &&
      startMinutes >= endMinutes
    ) {
      const message = "End time must be later than the start time.";
      errors.push_window_start_utc = message;
      errors.push_window_end_utc = message;
    }
  }

  const { guardrails } = settings;
  const maxDelta = guardrails.max_daily_budget_delta_pct;
  if (!Number.isFinite(maxDelta) || maxDelta < 0) {
    errors["guardrails.max_daily_budget_delta_pct"] = "Max daily delta must be zero or greater.";
  } else if (settings.pushes_enabled && maxDelta === 0) {
    errors["guardrails.max_daily_budget_delta_pct"] =
      "Guardrails require a positive daily delta when automated pushes run.";
  }

  const minSpend = guardrails.min_daily_spend;
  if (!Number.isFinite(minSpend) || minSpend < 0) {
    errors["guardrails.min_daily_spend"] = "Minimum daily spend cannot be negative.";
  }

  if (guardrails.roas_floor !== null) {
    if (!Number.isFinite(guardrails.roas_floor) || guardrails.roas_floor <= 0) {
      errors["guardrails.roas_floor"] = "ROAS floor must be a positive number.";
    }
  }

  if (guardrails.cpa_ceiling !== null) {
    if (!Number.isFinite(guardrails.cpa_ceiling) || guardrails.cpa_ceiling <= 0) {
      errors["guardrails.cpa_ceiling"] = "CPA ceiling must be a positive number.";
    }
  }

  if (hasInvalidChangeWindows(guardrails.change_windows)) {
    errors["guardrails.change_windows"] =
      "Use only letters, numbers, dashes, or underscores for change windows.";
  }

  if (!Number.isFinite(settings.retention_days) || settings.retention_days < 0) {
    errors.retention_days = "Retention must be zero or greater.";
  }

  return { errors, isValid: Object.keys(errors).length === 0 };
}

export function buildAutomationUpdatePayload(
  settings: AutomationSettings,
  updatedBy: string,
): { payload: AutomationUpdatePayload; validation: AutomationValidationResult } {
  const validation = validateAutomationSettings(settings);
  const payload: AutomationUpdatePayload = {
    mode: settings.mode,
    pushes_enabled: settings.pushes_enabled,
    daily_push_cap: settings.daily_push_cap,
    push_window_start_utc: settings.push_window_start_utc,
    push_window_end_utc: settings.push_window_end_utc,
    guardrails: settings.guardrails,
    consent: settings.consent,
    retention_days: settings.retention_days,
    notes: settings.notes,
    updated_by: updatedBy,
  };

  return { payload, validation };
}
