import type { CSSProperties } from "react";

export type ThemeName = "aero" | "calm";

export type SurfaceTokenKey = "plan" | "automations" | "marketing";

export type SurfaceName = SurfaceTokenKey | "experiments";

export type ThemeSurfaceTokens = Record<SurfaceTokenKey, CSSProperties>;
