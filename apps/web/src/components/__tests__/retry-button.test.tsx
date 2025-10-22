import React, { act, type ComponentProps, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";

import { RetryButton } from "../RetryButton";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderButton(children: ReactNode, props: ComponentProps<typeof RetryButton> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<RetryButton {...props}>{children}</RetryButton>);
  });

  const button = container.querySelector("button");

  return {
    container,
    root,
    button: button as HTMLButtonElement | null,
    cleanup: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe("RetryButton", () => {
  it("renders the provided content and merges classes", () => {
    const { button, cleanup } = renderButton("Retry now", { className: "extra-class" });

    try {
      expect(button).not.toBeNull();
      expect(button?.textContent).toBe("Retry now");
      expect(button?.className).toContain("ds-body-strong");
      expect(button?.className).toContain("extra-class");
      expect(button?.getAttribute("type")).toBe("button");
    } finally {
      cleanup();
    }
  });

  it("invokes the click handler when activated", () => {
    const onClick = vi.fn();
    const { button, cleanup } = renderButton("Retry now", { onClick });

    try {
      expect(button).not.toBeNull();
      act(() => {
        button?.click();
      });
      expect(onClick).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
    }
  });

  it("renders a loading state with spinner and loading text", () => {
    const { button, cleanup } = renderButton("Retry now", {
      loading: true,
      loadingText: "Retrying...",
    });

    try {
      expect(button).not.toBeNull();
      const spinner = button?.querySelector('[aria-hidden="true"]');
      expect(spinner).not.toBeNull();
      expect(button?.getAttribute("data-loading")).toBe("true");
      expect(button?.getAttribute("aria-busy")).toBe("true");
      expect(button?.disabled).toBe(true);
      expect(button?.textContent).toBe("Retrying...");
    } finally {
      cleanup();
    }
  });

  it("falls back to existing label when loading text is omitted", () => {
    const { button, cleanup } = renderButton("Retry now", { loading: true });

    try {
      expect(button).not.toBeNull();
      expect(button?.textContent).toBe("Retry now");
    } finally {
      cleanup();
    }
  });
});
