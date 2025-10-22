import { useEffect, useState } from "react";

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const REDUCED_MOTION_TOKENS: Record<string, string> = {
  "--motion-duration-micro": "0ms",
  "--motion-duration-snappy": "0ms",
  "--motion-duration-short": "40ms",
  "--motion-duration-standard": "80ms",
  "--motion-duration-gentle": "140ms",
  "--motion-duration-extended": "200ms",
  "--motion-duration-expressive": "260ms",
};

const TOKEN_KEYS = Object.keys(REDUCED_MOTION_TOKENS);

function applyMotionTokens(isReduced: boolean) {
  if (typeof document === "undefined") {
    return;
  }

  const rootElement = document.documentElement;
  const { style } = rootElement;

  if (isReduced) {
    for (const [token, value] of Object.entries(REDUCED_MOTION_TOKENS)) {
      style.setProperty(token, value);
    }
  } else {
    for (const token of TOKEN_KEYS) {
      style.removeProperty(token);
    }
  }

  rootElement.dataset.reducedMotion = isReduced ? "true" : "false";
}

type MediaListener = (event: MediaQueryListEvent) => void;

function addMediaListener(media: MediaQueryList, listener: MediaListener) {
  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }

  media.addListener(listener);
  return () => media.removeListener(listener);
}

export function useMotionTokens(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      applyMotionTokens(false);
      return () => {
        applyMotionTokens(false);
      };
    }

    const media = window.matchMedia(MOTION_QUERY);

    const handleChange: MediaListener = (event) => {
      setPrefersReducedMotion(event.matches);
      applyMotionTokens(event.matches);
    };

    setPrefersReducedMotion(media.matches);
    applyMotionTokens(media.matches);

    const removeListener = addMediaListener(media, handleChange);

    return () => {
      removeListener();
      applyMotionTokens(false);
    };
  }, []);

  return prefersReducedMotion;
}

export { TOKEN_KEYS as MOTION_TOKEN_KEYS, REDUCED_MOTION_TOKENS };
