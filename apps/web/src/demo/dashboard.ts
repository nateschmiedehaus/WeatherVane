import type { DashboardResponse } from "../types/dashboard";

function iso(date: Date): string {
  return date.toISOString();
}

export function buildDemoDashboard(now: Date = new Date()): DashboardResponse {
  const generatedAt = new Date(now);
  generatedAt.setMilliseconds(0);
  const midnight = new Date(generatedAt);
  midnight.setHours(0, 0, 0, 0);

  const offsets = Array.from({ length: 12 }, (_, idx) => idx);
  const baseSeries = offsets.map((idx) => 92 + Math.sin(idx / 2) * 3);

  return {
    tenant_id: "demo-tenant",
    generated_at: iso(generatedAt),
    guardrails: [
      {
        name: "Budget adherence",
        status: "healthy",
        value: 94.2,
        target: 90,
        unit: "pct",
        delta_pct: 2.4,
        notes: "Daily cap holding steady across channels.",
      },
      {
        name: "ROAS floor",
        status: "watch",
        value: 3.1,
        target: 3,
        unit: "ratio",
        delta_pct: -0.8,
        notes: "Meta creative fatigue pushing ROAS towards floor.",
      },
      {
        name: "CPA ceiling",
        status: "breach",
        value: 54.5,
        target: 50,
        unit: "usd",
        delta_pct: 6.9,
        notes: "Autopilot paused for Apparel South due to storm drag.",
      },
    ],
    spend_trackers: [
      {
        name: "Meta Spend",
        channel: "Paid Social",
        value: 42500,
        change_pct: 5.2,
        target: 43000,
        unit: "usd",
        sparkline: baseSeries,
      },
      {
        name: "Google Revenue",
        channel: "Paid Search",
        value: 132000,
        change_pct: 3.6,
        target: 128000,
        unit: "usd",
        sparkline: offsets.map((idx) => 98 + Math.sin(idx / 1.7) * 4),
      },
      {
        name: "Email Contribution",
        channel: "Lifecycle",
        value: 24000,
        change_pct: -1.5,
        target: 23500,
        unit: "usd",
        sparkline: offsets.map((idx) => 88 + Math.sin(idx / 1.3) * 2.5),
      },
    ],
    weather_events: [
      {
        id: "storm-midwest",
        title: "Severe storm window",
        description: "Cold front with hail risk across Chicago and Detroit markets.",
        severity: "high",
        geo_region: "Midwest USA",
        starts_at: iso(new Date(midnight.getTime() + 6 * 60 * 60 * 1000)),
        ends_at: iso(new Date(midnight.getTime() + 18 * 60 * 60 * 1000)),
        latitude: 41.8781,
        longitude: -87.6298,
        weather_type: "hail",
      },
      {
        id: "heatwave-south",
        title: "Heat surge boosting demand",
        description: "Apparel conversions trending +12% in Austin & Dallas.",
        severity: "medium",
        geo_region: "Texas",
        starts_at: iso(new Date(midnight.getTime() - 12 * 60 * 60 * 1000)),
        ends_at: iso(new Date(midnight.getTime() + 12 * 60 * 60 * 1000)),
        latitude: 30.2672,
        longitude: -97.7431,
        weather_type: "heatwave",
      },
      {
        id: "marine-layer",
        title: "Marine layer dampening store visits",
        description: "Expect slower coastal traffic until the marine layer clears.",
        severity: "low",
        geo_region: "SoCal Coast",
        starts_at: iso(midnight),
        ends_at: iso(new Date(midnight.getTime() + 9 * 60 * 60 * 1000)),
        latitude: 34.0195,
        longitude: -118.4912,
        weather_type: "fog",
      },
    ],
    automation: [
      {
        name: "Assist Guardrails",
        uptime_pct: 99.4,
        incidents_7d: 1,
        last_incident_at: iso(new Date(generatedAt.getTime() - 14 * 60 * 60 * 1000)),
        status: "normal",
        notes: "Operator acknowledged CPA drift within SLA.",
      },
      {
        name: "Autopilot Execution",
        uptime_pct: 96.8,
        incidents_7d: 2,
        last_incident_at: iso(new Date(generatedAt.getTime() - 6 * 60 * 60 * 1000)),
        status: "degraded",
        notes: "Paused Apparel South while storm response recalibrates.",
      },
    ],
    ingestion: [
      {
        name: "Shopify",
        source: "Commerce",
        status: "healthy",
        lag_minutes: 4,
        sla_minutes: 10,
        last_synced_at: iso(new Date(generatedAt.getTime() - 4 * 60 * 1000)),
        notes: "Webhooks flowing normally.",
      },
      {
        name: "Meta Ads",
        source: "Paid Social",
        status: "delayed",
        lag_minutes: 28,
        sla_minutes: 15,
        last_synced_at: iso(new Date(generatedAt.getTime() - 28 * 60 * 1000)),
        notes: "Rate limiting triggered; retry backoff active.",
      },
      {
        name: "Google Ads",
        source: "Paid Search",
        status: "syncing",
        lag_minutes: 12,
        sla_minutes: 20,
        last_synced_at: iso(new Date(generatedAt.getTime() - 12 * 60 * 1000)),
        notes: "Sync resumed after nightly window.",
      },
    ],
    alerts: [
      {
        id: "alert-apparel-south",
        title: "CPA breach: Apparel South",
        detail: "Autopilot paused pushes while CPA exceeds $50 ceiling.",
        severity: "critical",
        occurred_at: iso(new Date(generatedAt.getTime() - 35 * 60 * 1000)),
        acknowledged: false,
        escalated_to: "On-call Operator",
        related_objects: ["campaign:apparel-south", "guardrail:cpa"],
      },
      {
        id: "alert-meta-rate",
        title: "Meta rate limiting",
        detail: "Meta Ads connector backing off; expect refreshed metrics in 15 minutes.",
        severity: "warning",
        occurred_at: iso(new Date(generatedAt.getTime() - 70 * 60 * 1000)),
        acknowledged: true,
        escalated_to: null,
        related_objects: ["connector:meta"],
      },
      {
        id: "alert-weather-brief",
        title: "Brief: Midwest hail window",
        detail: "Share scenario with Priya so promo caps adjust before storm hits.",
        severity: "info",
        occurred_at: iso(new Date(generatedAt.getTime() - 2 * 60 * 60 * 1000)),
        acknowledged: false,
        escalated_to: null,
        related_objects: ["scenario:midwest-hail"],
      },
    ],
    context_tags: ["demo", "fallback"],
    context_warnings: [],
  };
}
