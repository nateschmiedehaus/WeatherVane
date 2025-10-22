import type { CSSProperties } from "react";

import { aeroThemeTokens } from "./aero";
import { calmThemeTokens } from "./calm";
import type { SurfaceName, SurfaceTokenKey, ThemeName, ThemeSurfaceTokens } from "./types";

const themeRegistry: Record<ThemeName, ThemeSurfaceTokens> = Object.freeze({
  aero: aeroThemeTokens,
  calm: calmThemeTokens,
});

const surfaceAliases: Record<SurfaceName, SurfaceTokenKey> = {
  plan: "plan",
  experiments: "plan",
  automations: "automations",
  marketing: "marketing",
};

export function getSurfaceTokens(theme: ThemeName, surface: SurfaceName): CSSProperties {
  const resolvedSurface = surfaceAliases[surface];
  const tokens = themeRegistry[theme][resolvedSurface];
  return tokens;
}
