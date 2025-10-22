import type { CSSProperties } from "react";

import type { ThemeSurfaceTokens } from "./types";

const plan: CSSProperties = {
  "--plan-backdrop": [
    "radial-gradient(circle at 12% 18%, rgba(129, 161, 248, 0.2), transparent 55%)",
    "radial-gradient(circle at 80% 15%, rgba(94, 234, 212, 0.18), transparent 55%)",
    "radial-gradient(circle at 50% 82%, rgba(251, 191, 36, 0.12), transparent 55%)",
    "linear-gradient(135deg, rgba(13, 25, 43, 0.95), rgba(15, 23, 42, 0.8))",
  ].join(",\n    "),
  "--plan-panel-border": "rgba(71, 85, 105, 0.35)",
  "--plan-panel-bg": "var(--surface-panel)",
  "--plan-panel-shadow": [
    "inset 0 0 0 1px rgba(148, 163, 184, 0.1)",
    "var(--shadow-soft)",
  ].join(",\n    "),
  "--plan-elevated-border": "rgba(71, 85, 105, 0.45)",
  "--plan-elevated-bg": "var(--surface-card)",
  "--plan-insight-border": "rgba(79, 70, 229, 0.25)",
  "--plan-insight-bg": "var(--surface-highlight)",
  "--plan-insight-shadow": [
    "inset 0 0 0 1px rgba(148, 163, 184, 0.12)",
    "var(--shadow-elevated)",
  ].join(",\n    "),
  "--plan-daycard-border": "rgba(71, 85, 105, 0.35)",
  "--plan-daycard-bg": "var(--surface-card)",
  "--plan-daycard-shadow": [
    "inset 0 0 0 1px rgba(148, 163, 184, 0.12)",
    "var(--shadow-soft)",
  ].join(",\n    "),
  "--plan-link-color": "rgba(96, 165, 250, 0.95)",
  "--plan-highlight-border": "rgba(59, 130, 246, 0.25)",
  "--plan-highlight-bg": "var(--surface-highlight)",
  "--plan-highlight-shadow": [
    "inset 0 0 0 1px rgba(148, 163, 184, 0.12)",
    "var(--shadow-elevated)",
  ].join(",\n    "),
  "--plan-context-border": "rgba(71, 85, 105, 0.4)",
  "--plan-context-bg": "var(--surface-panel)",
  "--plan-context-shadow": [
    "inset 0 0 0 1px rgba(148, 163, 184, 0.12)",
    "var(--shadow-soft)",
  ].join(",\n    "),
  "--plan-table-hover-bg": "rgba(56, 189, 248, 0.1)",
  "--plan-skeleton-base": "rgba(15, 23, 42, 0.55)",
  "--plan-skeleton-border": "rgba(71, 85, 105, 0.32)",
  "--plan-skeleton-sheen": [
    "linear-gradient(",
    "  135deg,",
    "  rgba(30, 41, 59, 0.35),",
    "  rgba(56, 189, 248, 0.12),",
    "  rgba(30, 41, 59, 0.35)",
    ")",
  ].join("\n"),
};

const automations: CSSProperties = {
  "--automations-backdrop": [
    "radial-gradient(circle at 15% 20%, rgba(147, 197, 253, 0.18), transparent 55%)",
    "radial-gradient(circle at 85% 20%, rgba(165, 243, 252, 0.16), transparent 55%)",
    "radial-gradient(circle at 50% 80%, rgba(94, 234, 212, 0.15), transparent 55%)",
    "linear-gradient(135deg, rgba(13, 25, 43, 0.94), rgba(15, 23, 42, 0.82))",
  ].join(",\n    "),
  "--automations-header-text": "rgba(226, 232, 240, 0.78)",
  "--automations-panel-border": "rgba(71, 85, 105, 0.35)",
  "--automations-panel-bg": "linear-gradient(135deg, rgba(30, 41, 59, 0.62), rgba(15, 23, 42, 0.54))",
  "--automations-panel-shadow": [
    "inset 0 0 0 1px rgba(148, 163, 184, 0.1)",
    "0 20px 44px rgba(15, 23, 42, 0.35)",
  ].join(",\n    "),
  "--automations-muted-text": "rgba(148, 163, 184, 0.85)",
  "--automations-label-text": "rgba(226, 232, 240, 0.92)",
  "--automations-input-bg": "rgba(15, 23, 42, 0.45)",
  "--automations-input-border": "rgba(148, 163, 184, 0.35)",
  "--automations-input-focus-border": "rgba(165, 243, 252, 0.65)",
  "--automations-input-focus-shadow": "0 0 0 3px rgba(56, 189, 248, 0.18)",
  "--automations-mode-active-border": "rgba(129, 230, 217, 0.55)",
  "--automations-mode-active-bg": "linear-gradient(135deg, rgba(56, 189, 248, 0.22), rgba(34, 211, 238, 0.18))",
  "--automations-mode-shadow": "0 20px 45px rgba(56, 189, 248, 0.18)",
  "--automations-primary-button-bg": "linear-gradient(135deg, rgba(59, 130, 246, 0.4), rgba(56, 189, 248, 0.35))",
  "--automations-primary-button-border": "rgba(59, 130, 246, 0.5)",
  "--automations-primary-button-shadow": "0 20px 42px rgba(56, 189, 248, 0.24)",
  "--automations-meta-border": "rgba(71, 85, 105, 0.35)",
  "--automations-meta-bg": "linear-gradient(135deg, rgba(30, 41, 59, 0.6), rgba(15, 23, 42, 0.55))",
  "--automations-meta-shadow": [
    "inset 0 0 0 1px rgba(148, 163, 184, 0.1)",
    "0 18px 38px rgba(15, 23, 42, 0.32)",
  ].join(",\n    "),
};

const marketing: CSSProperties = {
  "--marketing-backdrop": [
    "radial-gradient(circle at 18% 20%, rgba(96, 165, 250, 0.35), transparent 55%)",
    "radial-gradient(circle at 82% 32%, rgba(14, 165, 233, 0.22), transparent 62%)",
    "repeating-linear-gradient(120deg, rgba(148, 163, 184, 0.045) 0 1px, transparent 1px 10px)",
  ].join(",\n    "),
  "--marketing-primary-cta-bg": "linear-gradient(135deg, rgba(96, 165, 250, 0.85), rgba(14, 165, 233, 0.9))",
  "--marketing-primary-cta-shadow": "0 20px 40px -24px rgba(96, 165, 250, 0.6)",
  "--marketing-secondary-cta-bg": "rgba(15, 23, 42, 0.55)",
  "--marketing-secondary-cta-border": "rgba(148, 163, 184, 0.2)",
  "--marketing-secondary-cta-shadow": "inset 0 0 0 1px rgba(148, 163, 184, 0.08)",
  "--marketing-globe-bg": [
    "radial-gradient(circle at 30% 30%, rgba(56, 189, 248, 0.25), transparent 60%)",
    "radial-gradient(circle at 70% 60%, rgba(59, 130, 246, 0.25), transparent 65%)",
  ].join(",\n    "),
  "--marketing-isobars-bg":
    "conic-gradient(from 90deg, transparent 0 20%, rgba(56, 189, 248, 0.35) 25% 30%, transparent 35% 55%, rgba(59, 130, 246, 0.4) 60% 65%, transparent 70% 100%)",
  "--marketing-card-bg": "rgba(15, 23, 42, 0.55)",
  "--marketing-card-border": "rgba(148, 163, 184, 0.2)",
  "--marketing-card-shadow": "0 18px 40px -28px rgba(15, 23, 42, 0.8)",
  "--marketing-muted-card-bg": "rgba(2, 6, 23, 0.6)",
  "--marketing-muted-card-border": "rgba(51, 65, 85, 0.4)",
  "--marketing-story-bg": "rgba(15, 23, 42, 0.68)",
  "--marketing-story-border": "rgba(71, 85, 105, 0.35)",
};

export const aeroThemeTokens: ThemeSurfaceTokens = {
  plan,
  automations,
  marketing,
};
