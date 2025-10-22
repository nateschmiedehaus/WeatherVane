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

export type AutomationAuditEvidenceTone = "success" | "caution" | "info";

export interface AutomationAuditEvidenceLink {
  href: string;
  label: string;
}

export interface AutomationAuditEvidenceItem {
  id: string;
  label: string;
  value: string;
  tone?: AutomationAuditEvidenceTone;
  context?: string;
  link?: AutomationAuditEvidenceLink;
}

export type AutomationAuditActionIntent = "approve" | "rollback" | "view_evidence" | "acknowledge";

export interface AutomationAuditAction {
  id: string;
  label: string;
  intent?: AutomationAuditActionIntent;
  href?: string;
  tooltip?: string;
}

export interface AutomationAuditNarrative {
  why?: string;
  impact?: string;
  impactLabel?: string;
  impactValue?: string;
  impactContext?: string;
  nextStep?: string;
}

export interface AutomationAuditPreview {
  id: string;
  actor: string;
  headline: string;
  detail: string;
  timeAgo: string;
  minutesAgo?: number;
  status: AutomationAuditStatus;
  evidence?: AutomationAuditEvidenceItem[];
  narrative?: AutomationAuditNarrative;
  actions?: AutomationAuditAction[];
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
        `${channelLabel} push simulated. Approvers will confirm before the 7am safety window.`,
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
  automation: {
    label: "Automation engine · safety band enforced",
    first: {
      status: "approved",
      actor: "Automation engine",
      headline: (channelLabel) => `Automation engine executed ${channelLabel} ramp`,
      detail: (channelLabel) =>
        `${channelLabel} budgets rebalanced +12% inside the shared safety band. Shadow rollback primed.`,
      minutesAgo: 4,
    },
    third: {
      status: "shadow",
      actor: "Telemetry monitor",
      headline: "Shadow rollback rehearsal logged",
      detail: "Automation engine replayed ramp in shadow to validate rollback path & retention hooks.",
      minutesAgo: 90,
    },
  },
  autopilot: {
    label: "Autopilot runtime · self-healing",
    first: {
      status: "approved",
      actor: "Autopilot runtime",
      headline: (channelLabel) => `Autopilot executed ${channelLabel} ramp end-to-end`,
      detail: (channelLabel) =>
        `${channelLabel} budgets rebalanced autonomously. Autopilot synced telemetry + rehearsal evidence in real time.`,
      minutesAgo: 3,
    },
    third: {
      status: "pending",
      actor: "Shadow rehearsal desk",
      headline: "Shadow rehearsal ready for promotion",
      detail:
        "Shadow autopilot rehearsal cleared guardrails. Manual promotion recommended to capture exec signature.",
      minutesAgo: 54,
    },
  },
};

const SAFETY_BAND_DETAIL = "Safety band · max Δ 12% · ROAS floor 1.6× · change windows: weekdays";

function buildEvidenceTone(
  tone: string | undefined,
  fallback: AutomationAuditEvidenceTone = "info",
): AutomationAuditEvidenceTone {
  if (tone === "success" || tone === "caution" || tone === "info") {
    return tone;
  }
  return fallback;
}

function buildEvidenceForStatus(
  status: AutomationAuditStatus,
  channelLabel: string,
  mode: AutomationMode,
): AutomationAuditEvidenceItem[] {
  const normalizedMode: Exclude<AutomationMode, "autopilot"> =
    mode === "autopilot" ? "automation" : mode;

  if (status === "approved") {
    const roasValue =
      normalizedMode === "automation" ? "2.3×" : normalizedMode === "assist" ? "2.1×" : "1.9×";
    const budgetDelta =
      normalizedMode === "automation" ? "+10.8%" : normalizedMode === "assist" ? "+9.4%" : "+7.2%";
    const rehearsalContext =
      mode === "autopilot"
        ? "Shadow autopilot replay validated rollback hooks and retention signals."
        : "Shadow automation replay validated rollback hooks and retention signals.";
    return [
      {
        id: "roas-proof",
        label: "ROAS uplift",
        value: roasValue,
        tone: "success",
        context: `Weighted against the ${channelLabel} control cell across the last 14 days.`,
      },
      {
        id: "budget-window",
        label: "Budget shift",
        value: budgetDelta,
        tone: "success",
        context: `Inside the ${SAFETY_BAND_DETAIL.toLowerCase()}. Weather surge forecast accounted for.`,
      },
      {
        id: "rollback-readiness",
        label: "Rollback rehearsal",
        value: "3 passes",
        tone: "info",
        context: rehearsalContext,
        link: {
          label: "Open rehearsal log",
          href: "https://demo.weathervane.ai/audit/rollback/demo",
        },
      },
    ];
  }

  if (status === "pending") {
    const reviewer =
      mode === "manual" ? "Marketing Ops" : mode === "autopilot" ? "Autopilot oversight" : "Ops & Finance";
    const sla = mode === "manual" ? "2h SLA" : mode === "autopilot" ? "30m SLA" : "45m SLA";
    return [
      {
        id: "reviewer",
        label: "Reviewer",
        value: reviewer,
        tone: "info",
        context: `${sla} before the review window closes for the ${channelLabel} push.`,
      },
      {
        id: "confidence-band",
        label: "Confidence",
        value: "88%",
        tone: "success",
        context: "Scenario coverage across heat surge and humidity safety bands for this channel.",
      },
      {
        id: "proof-bundle",
        label: "Proof bundle",
        value: "Signed hash",
        tone: "info",
        context: "Compliance packet ready for download once approvals log is complete.",
        link: {
          label: "Preview bundle",
          href: "https://demo.weathervane.ai/audit/bundles/demo",
        },
      },
    ];
  }

  const variance =
    normalizedMode === "automation" ? "±0.6%" : normalizedMode === "assist" ? "±0.9%" : "±1.1%";
  return [
    {
      id: "simulation-load",
      label: "Simulation",
      value: normalizedMode === "automation" ? "24 runs" : "18 runs",
      tone: "info",
      context: "Safety rehearsal coverage over the last 30 minutes of weather volatility.",
    },
    {
      id: "variance-band",
      label: "Variance",
      value: variance,
      tone: "success",
      context: "Within rollback tolerance threshold. No breach escalations recorded.",
    },
    {
      id: "retention-hook",
      label: "Retention hook",
      value: "Live",
      tone: "success",
      context: "Retention webhooks captured evidence packets for exec review.",
      link: {
        label: "View retention log",
        href: "https://demo.weathervane.ai/audit/retention/demo",
      },
    },
  ];
}

export function mergeEvidenceWithFallback(
  evidence: AutomationAuditEvidenceItem[] | undefined,
  fallback: AutomationAuditEvidenceItem[] | undefined,
): AutomationAuditEvidenceItem[] | undefined {
  if (evidence && evidence.length > 0) {
    return evidence.map((item, index) => {
      const fallbackItem =
        (item.id && fallback?.find((candidate) => candidate.id === item.id)) ?? fallback?.[index];
      const label = item.label || fallbackItem?.label || `Evidence ${index + 1}`;
      const value = item.value || fallbackItem?.value || "";
      return {
        id: item.id || fallbackItem?.id || `evidence-${index}`,
        label,
        value,
        tone: buildEvidenceTone(item.tone, fallbackItem?.tone),
        context: item.context ?? fallbackItem?.context,
        link: item.link ?? fallbackItem?.link,
      };
    });
  }
  return fallback;
}

function createActionId(auditId: string, suffix: string): string {
  const base = auditId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "audit";
  return `${base}-${suffix}`;
}

function findEvidenceById(
  evidence: AutomationAuditEvidenceItem[] | undefined,
  id: string,
): AutomationAuditEvidenceItem | undefined {
  return evidence?.find((item) => item.id === id);
}

function buildAuditNarrative(
  status: AutomationAuditStatus,
  detail: string,
  channelLabel: string,
  _mode: AutomationMode,
  evidence: AutomationAuditEvidenceItem[] | undefined,
): AutomationAuditNarrative {
  if (status === "pending") {
    const reviewer = findEvidenceById(evidence, "reviewer");
    const confidence = findEvidenceById(evidence, "confidence-band");
    return {
      why: detail,
      impactLabel: confidence?.label ?? "Confidence",
      impactValue: confidence?.value ?? "Pending",
      impactContext:
        confidence?.context ??
        "WeatherVane is holding the change until a human reviewer signs off.",
      impact:
        reviewer?.value && reviewer.value.length > 0
          ? `${reviewer.value} still needs to sign off before WeatherVane pushes live.`
          : "A reviewer still needs to approve before WeatherVane pushes live.",
      nextStep:
        reviewer?.value && reviewer.value.length > 0
          ? `${reviewer.value} can approve or request changes from the review queue.`
          : `Approve or request changes before the ${channelLabel} review window closes.`,
    };
  }

  if (status === "approved") {
    const uplift = findEvidenceById(evidence, "roas-proof");
    const budget = findEvidenceById(evidence, "budget-window");
    const rehearsal = findEvidenceById(evidence, "rollback-readiness");
    const primary = uplift ?? budget ?? evidence?.[0];
    return {
      why: detail,
      impactLabel: primary?.label ?? "Impact",
      impactValue: primary?.value ?? "Healthy",
      impactContext:
        primary?.context ??
        `Budget shifts stayed inside the ${SAFETY_BAND_DETAIL.toLowerCase()}.`,
      impact: budget
        ? `${budget.value} shift executed inside the safety band.`
        : "Automation engine executed the plan inside the agreed safety band.",
      nextStep:
        rehearsal?.value && rehearsal.value.length > 0
          ? `Rollback rehearsal ready (${rehearsal.value}); trigger it if live metrics soften.`
          : "Monitor live performance; request a rollback if the trend slips.",
    };
  }

  const simulation = findEvidenceById(evidence, "simulation-load");
  const variance = findEvidenceById(evidence, "variance-band");
  return {
    why: detail,
    impactLabel: simulation?.label ?? "Rehearsal load",
    impactValue: simulation?.value ?? "Shadow",
    impactContext:
      simulation?.context ??
      "Shadow rehearsal validates the rollback path against live weather swings.",
    impact: variance
      ? `Variance holding at ${variance.value}; rehearsal coverage looks stable.`
      : "Rehearsal coverage looks stable across safety checks.",
    nextStep: "Promote the rehearsal once manual spot checks line up with expectations.",
  };
}

function buildAuditActions(
  auditId: string,
  status: AutomationAuditStatus,
  evidence: AutomationAuditEvidenceItem[] | undefined,
): AutomationAuditAction[] {
  const encodedId = encodeURIComponent(auditId);
  const reviewHref = `/automations/review?audit=${encodedId}`;
  const rollbackHref = `/automations/rollback?audit=${encodedId}`;
  const defaultEvidenceHref = `/automations/evidence?audit=${encodedId}`;
  const evidenceLink = evidence?.find((item) => Boolean(item.link?.href))?.link?.href;

  if (status === "pending") {
    return [
      {
        id: createActionId(auditId, "approve"),
        label: "Approve change",
        intent: "approve",
        href: reviewHref,
      },
      {
        id: createActionId(auditId, "rollback"),
        label: "Request rollback",
        intent: "rollback",
        href: rollbackHref,
      },
    ];
  }

  if (status === "approved") {
    return [
      {
        id: createActionId(auditId, "evidence"),
        label: "View evidence",
        intent: "view_evidence",
        href: defaultEvidenceHref,
        tooltip: evidenceLink,
      },
      {
        id: createActionId(auditId, "rollback"),
        label: "Request rollback",
        intent: "rollback",
        href: rollbackHref,
      },
    ];
  }

  const rehearsalLink =
    findEvidenceById(evidence, "rollback-readiness")?.link?.href ?? evidenceLink ?? defaultEvidenceHref;
  return [
    {
      id: createActionId(auditId, "promote"),
      label: "Promote rehearsal",
      intent: "approve",
      href: reviewHref,
    },
    {
      id: createActionId(auditId, "rehearsal-log"),
      label: "Open rehearsal log",
      intent: "view_evidence",
      href: rehearsalLink,
    },
  ];
}

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
  const firstDetail = modeBlueprint.first.detail(channelLabel);
  const thirdDetail = modeBlueprint.third.detail;
  const firstEvidence = buildEvidenceForStatus(
    modeBlueprint.first.status,
    channelLabel,
    preferences.automationComfort,
  );
  const shadowEvidence = buildEvidenceForStatus(
    "shadow",
    channelLabel,
    preferences.automationComfort,
  );
  const thirdEvidence = buildEvidenceForStatus(
    modeBlueprint.third.status,
    channelLabel,
    preferences.automationComfort,
  );

  return [
    {
      id: "audit-1",
      actor: modeBlueprint.first.actor,
      headline: modeBlueprint.first.headline(channelLabel),
      detail: firstDetail,
      timeAgo: formatRelative(modeBlueprint.first.minutesAgo),
      minutesAgo: modeBlueprint.first.minutesAgo,
      status: modeBlueprint.first.status,
      evidence: firstEvidence,
      narrative: buildAuditNarrative(
        modeBlueprint.first.status,
        firstDetail,
        channelLabel,
        preferences.automationComfort,
        firstEvidence,
      ),
      actions: buildAuditActions("audit-1", modeBlueprint.first.status, firstEvidence),
    },
    {
      id: "audit-2",
      actor: "Safety rehearsal engine",
      headline: "Safety rehearsal cleared",
      detail: `Shadow replay covered the ${SAFETY_BAND_DETAIL.toLowerCase()} for ${channelLabel}.`,
      timeAgo: formatRelative(24),
      minutesAgo: 24,
      status: "shadow",
      evidence: shadowEvidence,
      narrative: buildAuditNarrative(
        "shadow",
        `Shadow replay covered the ${SAFETY_BAND_DETAIL.toLowerCase()} for ${channelLabel}.`,
        channelLabel,
        preferences.automationComfort,
        shadowEvidence,
      ),
      actions: buildAuditActions("audit-2", "shadow", shadowEvidence),
    },
    {
      id: "audit-3",
      actor: modeBlueprint.third.actor,
      headline: modeBlueprint.third.headline,
      detail: thirdDetail,
      timeAgo: formatRelative(modeBlueprint.third.minutesAgo),
      minutesAgo: modeBlueprint.third.minutesAgo,
      status: modeBlueprint.third.status,
      evidence: thirdEvidence,
      narrative: buildAuditNarrative(
        modeBlueprint.third.status,
        thirdDetail,
        channelLabel,
        preferences.automationComfort,
        thirdEvidence,
      ),
      actions: buildAuditActions("audit-3", modeBlueprint.third.status, thirdEvidence),
    },
  ];
}
