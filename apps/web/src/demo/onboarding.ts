import type { DemoPreferences } from "../lib/demo";
import type { AutomationMode } from "../types/automation";

type DemoChannel = DemoPreferences["primaryChannel"];

export type ConnectorStatus = "ready" | "in_progress" | "action_needed";

export interface ConnectorProgress {
  slug: string;
  label: string;
  status: ConnectorStatus;
  progress: number;
  summary: string;
  timeAgo: string;
  action?: string;
  focus?: boolean;
}

export type AutomationAuditStatus = "approved" | "pending" | "shadow";

export interface AutomationAuditPreview {
  id: string;
  actor: string;
  headline: string;
  detail: string;
  timeAgo: string;
  status: AutomationAuditStatus;
}

const CHANNEL_BLUEPRINT: Record<
  DemoChannel,
  {
    label: string;
    readySummary: string;
    progressSummary: string;
    progressAction?: string;
    actionSummary: string;
    actionCall: string;
  }
> = {
  meta: {
    label: "Meta Ads",
    readySummary:
      "Advantage+ budgets mapped, offline conversions streaming via CAPI, and weather affinity audiences tagged.",
    progressSummary:
      "OAuth verified. Waiting for the next offline conversions drop to finish lookback backfills.",
    progressAction: "Upload yesterday’s purchase export or confirm CAPI webhook delivery.",
    actionSummary:
      "Meta account invited but not yet accepted. Weather-based budget ramps are paused until access is granted.",
    actionCall: "Share the secure OAuth invite with marketing-ops@brand.com.",
  },
  google: {
    label: "Google Ads",
    readySummary:
      "Search and Performance Max accounts synced with geo labels and weather surge scripts staged.",
    progressSummary:
      "Campaign structure indexed. Awaiting conversions upload to unlock weather-aware bidding.",
    progressAction: "Enable the Google Ads conversions API or drop the offline conversions CSV.",
    actionSummary:
      "Google Ads OAuth scopes pending. Tracking protection warning persists for Smart Bidding alignment.",
    actionCall: "Approve the Google Ads manager link from finance@weathervane.",
  },
  email: {
    label: "Klaviyo Email",
    readySummary:
      "Lifecycle flows listen to weather affinities and sample preheader/copy variants are queued.",
    progressSummary:
      "Email + SMS scopes authenticated. Segment export permissions still waiting for admin approval.",
    progressAction: "Grant metrics.read and events.write scopes so WeatherVane can sync segments.",
    actionSummary:
      "Klaviyo workspace invite unopened. Weather-triggered automations remain in draft mode.",
    actionCall: "Have lifecycle@brand.com accept the invite to finalize webhook setup.",
  },
  pos: {
    label: "Shopify POS",
    readySummary:
      "Store clusters mapped and unit-level sell-through streaming for retail uplift forecasting.",
    progressSummary:
      "Registers paired. Waiting for store-to-market mapping to route weather nudges correctly.",
    progressAction: "Upload the store location reference sheet so we can align segments.",
    actionSummary:
      "POS reader pairing incomplete. Weather-aware signage and prompts are still in shadow mode.",
    actionCall: "Finish pairing remaining readers inside Shopify → Devices.",
  },
};

const CHANNEL_ORDER: DemoChannel[] = ["meta", "google", "email", "pos"];

const MODE_BLUEPRINT: Record<
  AutomationMode,
  {
    label: string;
    first: {
      status: AutomationAuditStatus;
      actor: string;
      headline: (channelLabel: string) => string;
      detail: (channelLabel: string) => string;
      minutesAgo: number;
    };
    third: {
      status: AutomationAuditStatus;
      actor: string;
      headline: string;
      detail: string;
      minutesAgo: number;
    };
  }
> = {
  manual: {
    label: "Manual · read-only proofs",
    first: {
      status: "pending",
      actor: "WeatherVane Planner",
      headline: (channelLabel) => `Approval queued for ${channelLabel} ramp`,
      detail: (channelLabel) =>
        `Heat spike uplift detected. ${channelLabel} push will wait for marketing-ops sign-off.`,
      minutesAgo: 9,
    },
    third: {
      status: "approved",
      actor: "Ops analytics",
      headline: "Approval audit export staged",
      detail: "CSV + signed hash stored for exec review. Compliance Slack alert dispatched.",
      minutesAgo: 180,
    },
  },
  assist: {
    label: "Assist · one-click approvals",
    first: {
      status: "pending",
      actor: "Assist queue",
      headline: (channelLabel) => `Assist ready: ${channelLabel} ramp in morning review`,
      detail: (channelLabel) =>
        `${channelLabel} push simulated. Approvers will confirm before the 7am guardrail window.`,
      minutesAgo: 6,
    },
    third: {
      status: "approved",
      actor: "Approver sync",
      headline: "Approved pushes logged to retention vault",
      detail: "Signed webhook + audit bundle archived in S3 for the exec_review packet.",
      minutesAgo: 120,
    },
  },
  autopilot: {
    label: "Autopilot · guardrails enforced",
    first: {
      status: "approved",
      actor: "Autopilot engine",
      headline: (channelLabel) => `Autopilot executed ${channelLabel} ramp`,
      detail: (channelLabel) =>
        `${channelLabel} budgets rebalanced +12% within delta guardrails. Shadow rollback primed.`,
      minutesAgo: 4,
    },
    third: {
      status: "shadow",
      actor: "Telemetry monitor",
      headline: "Shadow rollback rehearsal logged",
      detail: "Autopilot replayed ramp in shadow to validate rollback path & retention hooks.",
      minutesAgo: 90,
    },
  },
};

const GUARDRAIL_DETAIL = "Guardrails · max Δ 12% · ROAS floor 1.6× · change windows: weekdays";

function formatRelative(minutes: number): string {
  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${Math.round(minutes)}m ago`;
  }
  const hours = minutes / 60;
  if (hours < 24) {
    return `${Math.round(hours)}h ago`;
  }
  const days = hours / 24;
  return `${Math.round(days)}d ago`;
}

export function getChannelLabel(channel: DemoChannel): string {
  return CHANNEL_BLUEPRINT[channel].label;
}

export function getAutomationModeLabel(mode: AutomationMode): string {
  return MODE_BLUEPRINT[mode].label;
}

export function buildConnectorProgress(preferences: DemoPreferences): ConnectorProgress[] {
  const connectors: ConnectorProgress[] = [
    {
      slug: "shopify-core",
      label: "Shopify commerce data",
      status: "ready",
      progress: 100,
      summary: "Orders, returns, discounts, and inventory syncing nightly (last full ingest 47m ago).",
      timeAgo: formatRelative(47),
    },
  ];

  const channel = preferences.primaryChannel;
  const channelDescriptor = CHANNEL_BLUEPRINT[channel];

  connectors.push({
    slug: `${channel}-primary`,
    label: channelDescriptor.label,
    status: "ready",
    progress: 100,
    summary: channelDescriptor.readySummary,
    timeAgo: formatRelative(12),
    focus: true,
  });

  const otherChannels = CHANNEL_ORDER.filter((entry) => entry !== channel);

  if (otherChannels.length > 0) {
    const descriptor = CHANNEL_BLUEPRINT[otherChannels[0]];
    connectors.push({
      slug: `${otherChannels[0]}-progress`,
      label: descriptor.label,
      status: "in_progress",
      progress: 68,
      summary: descriptor.progressSummary,
      action: descriptor.progressAction,
      timeAgo: formatRelative(95),
    });
  }

  if (otherChannels.length > 1) {
    const descriptor = CHANNEL_BLUEPRINT[otherChannels[1]];
    connectors.push({
      slug: `${otherChannels[1]}-action`,
      label: descriptor.label,
      status: "action_needed",
      progress: 32,
      summary: descriptor.actionSummary,
      action: descriptor.actionCall,
      timeAgo: formatRelative(190),
    });
  }

  return connectors;
}

export function buildAutomationAuditPreview(
  preferences: DemoPreferences,
): AutomationAuditPreview[] {
  const channelLabel = getChannelLabel(preferences.primaryChannel);
  const modeBlueprint = MODE_BLUEPRINT[preferences.automationComfort];

  return [
    {
      id: "audit-1",
      actor: modeBlueprint.first.actor,
      headline: modeBlueprint.first.headline(channelLabel),
      detail: modeBlueprint.first.detail(channelLabel),
      timeAgo: formatRelative(modeBlueprint.first.minutesAgo),
      status: modeBlueprint.first.status,
    },
    {
      id: "audit-2",
      actor: "Guardrail engine",
      headline: "Guardrail simulation passed",
      detail: `${GUARDRAIL_DETAIL} · ${channelLabel}`,
      timeAgo: formatRelative(24),
      status: "shadow",
    },
    {
      id: "audit-3",
      actor: modeBlueprint.third.actor,
      headline: modeBlueprint.third.headline,
      detail: modeBlueprint.third.detail,
      timeAgo: formatRelative(modeBlueprint.third.minutesAgo),
      status: modeBlueprint.third.status,
    },
  ];
}
