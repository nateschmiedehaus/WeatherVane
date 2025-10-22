import type { CSSProperties } from "react";

import type { ThemeSurfaceTokens } from "./types";

const plan: CSSProperties = {
  "--plan-backdrop": [
    "radial-gradient(circle at 16% 20%, rgba(148, 205, 255, 0.18), transparent 55%)",
    "radial-gradient(circle at 82% 18%, rgba(103, 232, 249, 0.16), transparent 56%)",
    "radial-gradient(circle at 50% 82%, rgba(125, 211, 252, 0.14), transparent 60%)",
    "linear-gradient(138deg, rgba(6, 16, 30, 0.95), rgba(8, 23, 36, 0.86))",
  ].join(",\n    "),
  "--plan-panel-border": "rgba(94, 109, 130, 0.28)",
  "--plan-panel-bg": "linear-gradient(135deg, rgba(14, 28, 46, 0.68), rgba(7, 18, 31, 0.58))",
  "--plan-panel-shadow": [
    "inset 0 0 0 1px rgba(148, 191, 233, 0.14)",
    "0 26px 48px rgba(6, 17, 29, 0.42)",
  ].join(",\n    "),
  "--plan-elevated-border": "rgba(90, 113, 136, 0.34)",
  "--plan-elevated-bg": "rgba(7, 16, 28, 0.52)",
  "--plan-insight-border": "rgba(129, 140, 248, 0.3)",
  "--plan-insight-bg": "linear-gradient(150deg, rgba(12, 27, 45, 0.7), rgba(9, 21, 36, 0.55))",
  "--plan-insight-shadow": [
    "inset 0 0 0 1px rgba(148, 191, 233, 0.12)",
    "0 26px 46px rgba(6, 17, 29, 0.38)",
  ].join(",\n    "),
  "--plan-daycard-border": "rgba(90, 113, 136, 0.34)",
  "--plan-daycard-bg": "linear-gradient(145deg, rgba(12, 27, 45, 0.64), rgba(7, 18, 31, 0.56))",
  "--plan-daycard-shadow": [
    "inset 0 0 0 1px rgba(148, 191, 233, 0.12)",
    "0 24px 42px rgba(6, 17, 29, 0.36)",
  ].join(",\n    "),
  "--plan-link-color": "rgba(125, 211, 252, 0.92)",
  "--plan-highlight-border": "rgba(56, 189, 248, 0.35)",
  "--plan-highlight-bg": "linear-gradient(155deg, rgba(14, 29, 50, 0.72), rgba(8, 21, 36, 0.6))",
  "--plan-highlight-shadow": [
    "inset 0 0 0 1px rgba(148, 191, 233, 0.12)",
    "0 28px 50px rgba(6, 17, 29, 0.4)",
  ].join(",\n    "),
  "--plan-context-border": "rgba(90, 113, 136, 0.32)",
  "--plan-context-bg": "linear-gradient(135deg, rgba(12, 26, 43, 0.64), rgba(7, 18, 31, 0.54))",
  "--plan-context-shadow": [
    "inset 0 0 0 1px rgba(148, 191, 233, 0.12)",
    "0 22px 42px rgba(6, 17, 29, 0.38)",
  ].join(",\n    "),
  "--plan-table-hover-bg": "rgba(56, 189, 248, 0.16)",
  "--plan-skeleton-base": "rgba(7, 16, 28, 0.55)",
  "--plan-skeleton-border": "rgba(90, 113, 136, 0.3)",
  "--plan-skeleton-sheen": [
    "linear-gradient(",
    "  135deg,",
    "  rgba(12, 27, 45, 0.35),",
    "  rgba(56, 189, 248, 0.16),",
    "  rgba(12, 27, 45, 0.35)",
    ")",
  ].join("\n"),
};

const automations: CSSProperties = {
  "--automations-backdrop": [
    "radial-gradient(circle at 18% 18%, rgba(148, 205, 255, 0.18), transparent 55%)",
    "radial-gradient(circle at 82% 26%, rgba(103, 232, 249, 0.16), transparent 58%)",
    "radial-gradient(circle at 50% 80%, rgba(125, 211, 252, 0.14), transparent 60%)",
    "linear-gradient(138deg, rgba(6, 16, 30, 0.95), rgba(8, 23, 36, 0.88))",
  ].join(",\n    "),
  "--automations-header-text": "rgba(224, 242, 254, 0.82)",
  "--automations-panel-border": "rgba(94, 109, 130, 0.28)",
  "--automations-panel-bg": "linear-gradient(135deg, rgba(14, 27, 44, 0.68), rgba(7, 17, 30, 0.58))",
  "--automations-panel-shadow": [
    "inset 0 0 0 1px rgba(148, 191, 233, 0.14)",
    "0 24px 46px rgba(8, 19, 33, 0.4)",
  ].join(",\n    "),
  "--automations-muted-text": "rgba(186, 209, 234, 0.78)",
  "--automations-label-text": "rgba(232, 244, 255, 0.94)",
  "--automations-input-bg": "rgba(7, 16, 28, 0.52)",
  "--automations-input-border": "rgba(102, 123, 146, 0.34)",
  "--automations-input-focus-border": "rgba(125, 211, 252, 0.6)",
  "--automations-input-focus-shadow": "0 0 0 3px rgba(56, 189, 248, 0.24)",
  "--automations-mode-active-border": "rgba(99, 179, 237, 0.58)",
  "--automations-mode-active-bg": "linear-gradient(135deg, rgba(56, 189, 248, 0.26), rgba(14, 165, 233, 0.2))",
  "--automations-mode-shadow": "0 24px 48px rgba(56, 189, 248, 0.22)",
  "--automations-primary-button-bg": "linear-gradient(135deg, rgba(14, 165, 233, 0.45), rgba(125, 211, 252, 0.38))",
  "--automations-primary-button-border": "rgba(56, 189, 248, 0.52)",
  "--automations-primary-button-shadow": "0 24px 48px rgba(56, 189, 248, 0.26)",
  "--automations-meta-border": "rgba(82, 105, 130, 0.3)",
  "--automations-meta-bg": "linear-gradient(135deg, rgba(12, 27, 45, 0.64), rgba(8, 19, 33, 0.58))",
  "--automations-meta-shadow": [
    "inset 0 0 0 1px rgba(148, 191, 233, 0.12)",
    "0 20px 40px rgba(6, 18, 30, 0.38)",
  ].join(",\n    "),
};

const marketing: CSSProperties = {
  "--marketing-backdrop": [
    "radial-gradient(circle at 20% 22%, rgba(148, 205, 255, 0.32), transparent 60%)",
    "radial-gradient(circle at 78% 36%, rgba(103, 232, 249, 0.2), transparent 64%)",
    "repeating-linear-gradient(120deg, rgba(148, 191, 233, 0.08) 0 1px, transparent 1px 12px)",
  ].join(",\n    "),
  "--marketing-primary-cta-bg": "linear-gradient(135deg, rgba(125, 211, 252, 0.85), rgba(14, 165, 233, 0.88))",
  "--marketing-primary-cta-shadow": "0 20px 40px -24px rgba(125, 211, 252, 0.42)",
  "--marketing-secondary-cta-bg": "rgba(7, 16, 28, 0.6)",
  "--marketing-secondary-cta-border": "rgba(94, 109, 130, 0.32)",
  "--marketing-secondary-cta-shadow": "inset 0 0 0 1px rgba(148, 191, 233, 0.12)",
  "--marketing-globe-bg": [
    "radial-gradient(circle at 30% 30%, rgba(125, 211, 252, 0.3), transparent 60%)",
    "radial-gradient(circle at 70% 60%, rgba(148, 205, 255, 0.28), transparent 65%)",
  ].join(",\n    "),
  "--marketing-isobars-bg":
    "conic-gradient(from 90deg, transparent 0 20%, rgba(103, 232, 249, 0.35) 25% 30%, transparent 35% 55%, rgba(125, 211, 252, 0.38) 60% 65%, transparent 70% 100%)",
  "--marketing-card-bg": "rgba(7, 18, 31, 0.58)",
  "--marketing-card-border": "rgba(102, 123, 146, 0.35)",
  "--marketing-card-shadow": "0 18px 40px -28px rgba(7, 18, 31, 0.78)",
  "--marketing-muted-card-bg": "rgba(5, 12, 24, 0.62)",
  "--marketing-muted-card-border": "rgba(82, 105, 130, 0.4)",
  "--marketing-story-bg": "rgba(12, 27, 45, 0.68)",
  "--marketing-story-border": "rgba(102, 123, 146, 0.34)",
};

export const calmThemeTokens: ThemeSurfaceTokens = {
  plan,
  automations,
  marketing,
};
