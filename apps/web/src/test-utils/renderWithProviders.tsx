import "@testing-library/jest-dom/vitest";
import { render, type RenderOptions } from "@testing-library/react";
import type { PropsWithChildren, ReactElement } from "react";
import { ThemeProvider } from "../lib/theme";
import { DemoProvider } from "../lib/demo";

function ensureMatchMedia(): void {
  if (typeof window === "undefined") {
    return;
  }
  if (typeof window.matchMedia === "function") {
    return;
  }
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList;
}

function Providers({ children }: PropsWithChildren) {
  ensureMatchMedia();
  return (
    <ThemeProvider>
      <DemoProvider>{children}</DemoProvider>
    </ThemeProvider>
  );
}

export function renderWithProviders(ui: ReactElement, options?: RenderOptions) {
  ensureMatchMedia();
  return render(ui, { wrapper: Providers, ...options });
}

export function withProviders(ui: ReactElement) {
  ensureMatchMedia();
  return <Providers>{ui}</Providers>;
}
