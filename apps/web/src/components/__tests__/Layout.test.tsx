import React, { ReactNode, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../ThemeToggle", () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

vi.mock("../NavTabs", () => ({
  NavTabs: () => <nav data-testid="nav-tabs" />,
}));

vi.mock("../DemoTourDrawer", () => ({
  DemoTourDrawer: () => <div data-testid="demo-drawer" />,
}));

import { Layout } from "../Layout";
import { MOTION_TOKEN_KEYS, REDUCED_MOTION_TOKENS } from "../../hooks/useMotionTokens";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type MatchMediaListener = (event: MediaQueryListEvent) => void;

interface MatchMediaMock extends MediaQueryList {
  setMatches(value: boolean): void;
}

function createMatchMediaMock(initialMatches: boolean): MatchMediaMock {
  const listeners = new Set<MatchMediaListener>();

  const media: MatchMediaMock = {
    matches: initialMatches,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      if (type !== "change") {
        return;
      }
      const handler =
        typeof listener === "function" ? listener : (listener as EventListenerObject).handleEvent;
      if (typeof handler === "function") {
        listeners.add(handler as MatchMediaListener);
      }
    },
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      if (type !== "change") {
        return;
      }
      const handler =
        typeof listener === "function" ? listener : (listener as EventListenerObject).handleEvent;
      if (typeof handler === "function") {
        listeners.delete(handler as MatchMediaListener);
      }
    },
    addListener: (listener: EventListenerOrEventListenerObject) => {
      const handler =
        typeof listener === "function" ? listener : (listener as EventListenerObject).handleEvent;
      if (typeof handler === "function") {
        listeners.add(handler as MatchMediaListener);
      }
    },
    removeListener: (listener: EventListenerOrEventListenerObject) => {
      const handler =
        typeof listener === "function" ? listener : (listener as EventListenerObject).handleEvent;
      if (typeof handler === "function") {
        listeners.delete(handler as MatchMediaListener);
      }
    },
    dispatchEvent: () => false,
    setMatches: (value: boolean) => {
      if (media.matches === value) {
        return;
      }
      media.matches = value;
      const event = { matches: value, media: media.media } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
      if (typeof media.onchange === "function") {
        media.onchange(event);
      }
    },
  };

  return media;
}

function renderLayout(children: ReactNode = null) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<Layout>{children}</Layout>);
  });

  const shell = container.firstElementChild as HTMLElement | null;

  return {
    container,
    root,
    shell,
    cleanup: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe("Layout motion tokens", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    document.documentElement.removeAttribute("data-reduced-motion");
    for (const token of MOTION_TOKEN_KEYS) {
      document.documentElement.style.removeProperty(token);
    }
  });

  it("applies reduced-motion token overrides when the system preference is set", () => {
    const media = createMatchMediaMock(true);
    vi.spyOn(window, "matchMedia").mockReturnValue(media);

    const { shell, cleanup } = renderLayout(<p>content</p>);

    try {
      expect(window.matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
      expect(shell?.dataset.reducedMotion).toBe("true");
      expect(document.documentElement.dataset.reducedMotion).toBe("true");

      for (const [token, value] of Object.entries(REDUCED_MOTION_TOKENS)) {
        expect(document.documentElement.style.getPropertyValue(token)).toBe(value);
      }
    } finally {
      cleanup();
    }
  });

  it("updates and restores motion token overrides when preference changes", () => {
    const media = createMatchMediaMock(false);
    vi.spyOn(window, "matchMedia").mockReturnValue(media);

    const { shell, cleanup } = renderLayout();

    try {
      expect(shell?.dataset.reducedMotion).toBe("false");
      for (const token of MOTION_TOKEN_KEYS) {
        expect(document.documentElement.style.getPropertyValue(token)).toBe("");
      }

      act(() => {
        media.setMatches(true);
      });

      expect(shell?.dataset.reducedMotion).toBe("true");
      expect(document.documentElement.dataset.reducedMotion).toBe("true");

      for (const [token, value] of Object.entries(REDUCED_MOTION_TOKENS)) {
        expect(document.documentElement.style.getPropertyValue(token)).toBe(value);
      }

      act(() => {
        media.setMatches(false);
      });

      expect(shell?.dataset.reducedMotion).toBe("false");
      expect(document.documentElement.dataset.reducedMotion).toBe("false");

      for (const token of MOTION_TOKEN_KEYS) {
        expect(document.documentElement.style.getPropertyValue(token)).toBe("");
      }
    } finally {
      cleanup();
    }
  });
});
