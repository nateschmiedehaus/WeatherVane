import type { GuardrailSettings } from "../types/automation";

export type GuardrailNarrativeTone = "info" | "success" | "caution" | "critical";

export interface GuardrailNarrative {
  id: string;
  title: string;
  summary: string;
  rationale: string;
  example?: string;
  tone: GuardrailNarrativeTone;
}

interface GuardrailNarrativeOptions {
  sampleDailySpend?: number | null;
  metadata?: unknown;
}

const DEFAULT_SAMPLE_DAILY_SPEND = 5000;

export function buildGuardrailNarratives(
  guardrails: GuardrailSettings,
  options?: GuardrailNarrativeOptions,
): GuardrailNarrative[] {
  const sampleDailySpend = computeSampleDailySpend(guardrails, options);
  const narratives: GuardrailNarrative[] = [];

  const deltaPct = Number.isFinite(guardrails.max_daily_budget_delta_pct)
    ? guardrails.max_daily_budget_delta_pct
    : 0;
  const hasDelta = deltaPct > 0;
  const lowerBound = Math.max(
    guardrails.min_daily_spend ?? 0,
    roundCurrency(sampleDailySpend * (1 - Math.min(deltaPct, 100) / 100)),
  );
  const upperBound = roundCurrency(sampleDailySpend * (1 + deltaPct / 100));

  narratives.push({
    id: "max-daily-delta",
    title: "Daily budget change limit",
    summary: hasDelta
      ? `WeatherVane caps automated pushes at ±${formatPercentage(deltaPct)} each day.`
      : "Automation engine changes are paused — budgets stay at current levels until you lift the cap.",
    rationale: hasDelta
      ? "Prevents shocking budget swings while still letting Automation engine react to demand."
      : "Use this safeguard during finance freezes or when every change needs manual approval.",
    example: hasDelta
      ? `Example: On a ${formatCurrency(sampleDailySpend)} day, Automation engine can raise spend to about ${formatCurrency(upperBound)} or pull back to ${formatCurrency(lowerBound)} in a single window.`
      : undefined,
    tone: hasDelta ? "info" : "caution",
  });

  const minSpend = Number.isFinite(guardrails.min_daily_spend)
    ? guardrails.min_daily_spend
    : 0;
  const hasMinSpend = minSpend > 0;

  narratives.push({
    id: "min-daily-spend",
    title: "Minimum daily spend",
    summary: hasMinSpend
      ? `WeatherVane never reduces combined daily spend below ${formatCurrency(minSpend)}.`
      : "No minimum spend set — Automation engine may pause campaigns entirely if performance collapses.",
    rationale: hasMinSpend
      ? "Protects evergreen coverage and keeps platforms in learning while Automation engine trims budgets."
      : "Set a floor when you need always-on market presence or finance requires a baseline investment.",
    example: hasMinSpend
      ? `If performance dips, Automation engine stops pulling back once spend hits ${formatCurrency(minSpend)} so core campaigns keep pacing.`
      : undefined,
    tone: hasMinSpend ? "success" : "caution",
  });

  const roasFloor = guardrails.roas_floor ?? null;
  const hasRoasFloor = typeof roasFloor === "number" && Number.isFinite(roasFloor) && roasFloor > 0;
  narratives.push({
    id: "roas-floor",
    title: "ROAS floor",
    summary: hasRoasFloor
      ? `Requires at least ${roasFloor.toFixed(2)}× return before Automation engine scales spend.`
      : "No ROAS floor set — profitability relies on spend and CPA guardrails alone.",
    rationale: hasRoasFloor
      ? "Protects margin by pausing aggressive pushes when efficiency drops below your target."
      : "Add a ROAS floor when finance needs minimum payback before budgets expand.",
    example: hasRoasFloor
      ? `For a ${formatCurrency(sampleDailySpend)} day, Automation engine expects about ${formatCurrency(
          sampleDailySpend * roasFloor,
        )} in attributed revenue to keep scaling.`
      : undefined,
    tone: hasRoasFloor ? "info" : "caution",
  });

  const cpaCeiling = guardrails.cpa_ceiling ?? null;
  const hasCpaCeiling =
    typeof cpaCeiling === "number" && Number.isFinite(cpaCeiling) && cpaCeiling > 0;
  narratives.push({
    id: "cpa-ceiling",
    title: "CPA ceiling",
    summary: hasCpaCeiling
      ? `Stops pushes when cost per acquisition rises above ${formatCurrency(cpaCeiling)}.`
      : "No CPA ceiling set — Automation engine will lean on ROAS or budget caps to control downside.",
    rationale: hasCpaCeiling
      ? "Keeps acquisition costs aligned with unit economics and pauses spend before campaigns erode profit."
      : "Add a ceiling when finance tracks strict unit economics or when campaigns fluctuate heavily.",
    example: hasCpaCeiling
      ? `Automation engine pauses additional pushes once conversions cost more than ${formatCurrency(
          cpaCeiling,
        )} until performance recovers.`
      : undefined,
    tone: hasCpaCeiling ? "info" : "caution",
  });

  const windows = Array.isArray(guardrails.change_windows)
    ? guardrails.change_windows.map((window) => window.trim()).filter((window) => window.length > 0)
    : [];
  const hasWindows = windows.length > 0;
  narratives.push({
    id: "change-windows",
    title: "Change windows",
    summary: hasWindows
      ? `Automation engine only executes pushes during: ${formatWindowList(windows)}.`
      : "No change windows defined — Automation engine can push at any hour.",
    rationale: hasWindows
      ? "Aligns automation with finance sign-off windows and reduces off-hours surprises."
      : "Define windows to coordinate with finance freezes, storefront syncs, or analyst coverage.",
    example: hasWindows
      ? "Pushes outside these windows fall back to Assist so humans can review first."
      : undefined,
    tone: hasWindows ? "success" : "caution",
  });

  return narratives;
}

function computeSampleDailySpend(
  guardrails: GuardrailSettings,
  options?: GuardrailNarrativeOptions,
): number {
  const fromOptions =
    options && typeof options.sampleDailySpend === "number" && options.sampleDailySpend > 0
      ? options.sampleDailySpend
      : undefined;
  const fromMetadata =
    options && typeof options.metadata !== "undefined"
      ? extractSpendFromMetadata(options.metadata)
      : undefined;
  const fromGuardrails =
    guardrails.min_daily_spend && guardrails.min_daily_spend > 0
      ? guardrails.min_daily_spend * 2
      : undefined;

  const candidate = Math.max(
    fromOptions ?? 0,
    fromMetadata ?? 0,
    fromGuardrails ?? 0,
    DEFAULT_SAMPLE_DAILY_SPEND,
  );

  return roundCurrency(candidate);
}

function extractSpendFromMetadata(metadata: unknown): number | undefined {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }
  const seen = new Set<unknown>();
  const stack: unknown[] = [metadata];
  let best: number | undefined;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== "object" || seen.has(current)) {
      continue;
    }
    seen.add(current);
    if (Array.isArray(current)) {
      for (const item of current) {
        if (typeof item === "object" && item !== null) {
          stack.push(item);
        }
      }
      continue;
    }
    for (const [key, value] of Object.entries(current)) {
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        const lowered = key.toLowerCase();
        if (lowered.includes("spend") || lowered.includes("budget")) {
          best = typeof best === "number" ? Math.max(best, value) : value;
        }
      } else if (value && typeof value === "object") {
        stack.push(value);
      }
    }
  }

  return best;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: amount >= 1000 ? 0 : 2,
  }).format(amount);
}

function roundCurrency(amount: number): number {
  return Math.max(0, Math.round((Number.isFinite(amount) ? amount : 0) * 100) / 100);
}

function formatWindowList(windows: string[]): string {
  if (windows.length === 1) {
    return windows[0];
  }
  if (windows.length === 2) {
    return `${windows[0]} and ${windows[1]}`;
  }
  return `${windows.slice(0, -1).join(", ")}, and ${windows.at(-1)}`;
}

function formatPercentage(value: number): string {
  return `${roundCurrency(Math.abs(value))}%`;
}
