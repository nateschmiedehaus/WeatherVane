import type {
  ReportHeroTile,
  ReportNarrativeCard,
  ReportsResponse,
  ReportTrendPoint,
} from "../types/reports";

export interface HeroViewModel {
  id: string;
  label: string;
  valueLabel: string;
  deltaLabel: string | null;
  narrative: string;
}

export interface TrendRow {
  dateLabel: string;
  spendLabel: string;
  weatherLabel: string;
  guardrailLabel: string;
}

export interface ReportShareOptions {
  horizonDays?: number;
  focusNarrativeId?: string;
  includeTrend?: boolean;
}

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 1,
});

const decimalFormatter = new Intl.NumberFormat(undefined, {
  style: "decimal",
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number, unit: string = "usd"): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  if (unit === "usd") {
    return currencyFormatter.format(value);
  }
  if (unit === "percent") {
    return percentFormatter.format(value / 100);
  }
  if (unit === "multiple") {
    return `${decimalFormatter.format(value)}×`;
  }
  return decimalFormatter.format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return percentFormatter.format(value / 100);
}

export function formatReportDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function heroDelta(tile: ReportHeroTile): string | null {
  if (tile.delta_value !== null && tile.delta_value !== undefined) {
    if (tile.unit === "usd") {
      return `${tile.delta_value >= 0 ? "+" : "-"}${formatCurrency(Math.abs(tile.delta_value), "usd")}`;
    }
    if (tile.unit === "multiple") {
      return `${tile.delta_value >= 0 ? "+" : "-"}${decimalFormatter.format(Math.abs(tile.delta_value))}`;
    }
  }
  if (tile.delta_pct !== null && tile.delta_pct !== undefined) {
    return `${tile.delta_pct >= 0 ? "+" : "-"}${formatPercent(Math.abs(tile.delta_pct))}`;
  }
  return null;
}

export function deriveHeroView(report: ReportsResponse): HeroViewModel[] {
  return report.hero_tiles.map((tile) => ({
    id: tile.id,
    label: tile.label,
    valueLabel: formatCurrency(tile.value, tile.unit),
    deltaLabel: heroDelta(tile),
    narrative: tile.narrative,
  }));
}

export function buildNarrativeSummary(card: ReportNarrativeCard): string {
  const spend = formatCurrency(card.spend, "usd");
  const revenue = formatCurrency(card.expected_revenue, "usd");
  return `${card.headline}: ${card.weather_driver}. ${spend} → ${revenue} with ${card.confidence.toLowerCase()} confidence.`;
}

export function buildTrendRows(points: ReportTrendPoint[]): TrendRow[] {
  return points.map((point) => ({
    dateLabel: formatReportDate(point.date),
    spendLabel: formatCurrency(point.recommended_spend, "usd"),
    weatherLabel: `${decimalFormatter.format(point.weather_index)} index`,
    guardrailLabel: formatPercent(point.guardrail_score),
  }));
}

function selectNarratives(
  report: ReportsResponse,
  focusNarrativeId: string | undefined,
): ReportNarrativeCard[] {
  if (!focusNarrativeId) {
    return report.narratives.slice(0, 3);
  }
  const match = report.narratives.find((card) => card.id === focusNarrativeId);
  if (!match) {
    return report.narratives.slice(0, 3);
  }
  const others = report.narratives
    .filter((card) => card.id !== focusNarrativeId)
    .slice(0, 2);
  return [match, ...others];
}

export function buildReportSharePayload(
  report: ReportsResponse,
  options: ReportShareOptions = {},
): string {
  const lines: string[] = [];
  lines.push(`Executive Weather Report — ${formatReportDate(report.generated_at)}`);

  const horizonLabel =
    typeof options.horizonDays === "number"
      ? `${options.horizonDays}-day outlook`
      : `${report.trend.cadence} cadence`;
  lines.push(`Scope: ${horizonLabel}`);
  lines.push("");
  lines.push("Hero metrics:");
  deriveHeroView(report).forEach((hero) => {
    const delta = hero.deltaLabel ? ` (${hero.deltaLabel})` : "";
    lines.push(`• ${hero.label}: ${hero.valueLabel}${delta} — ${hero.narrative}`);
  });

  const narratives = selectNarratives(report, options.focusNarrativeId);
  if (narratives.length) {
    lines.push("");
    lines.push("Storyline highlights:");
    narratives.forEach((card) => {
      lines.push(`• ${buildNarrativeSummary(card)}`);
    });
  }

  if (options.includeTrend && report.trend.points.length) {
    lines.push("");
    lines.push("Trend snapshot (spend · weather · guardrails):");
    buildTrendRows(report.trend.points.slice(-3)).forEach((row) => {
      lines.push(`• ${row.dateLabel} — ${row.spendLabel}, ${row.weatherLabel}, ${row.guardrailLabel}`);
    });
  }

  lines.push("");
  lines.push(
    `Scheduler: ${report.schedule.status.toUpperCase()} — ${report.schedule.note ?? "Ready to deliver weekly exports."}`,
  );
  lines.push(
    `Success spotlight: ${report.success.headline} (${formatCurrency(report.success.metric_value, report.success.metric_unit)})`,
  );
  lines.push(`CTA: ${report.success.cta_label} → ${report.success.cta_href}`);

  return lines.join("\n");
}
