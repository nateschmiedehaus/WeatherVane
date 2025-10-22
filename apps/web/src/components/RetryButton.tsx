import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

import styles from "./retry-button.module.css";

export interface RetryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
}

export const RetryButton = forwardRef<HTMLButtonElement, RetryButtonProps>(
  ({ className, type, loading = false, loadingText, disabled, children, ...props }, ref) => {
    const isLoading = Boolean(loading);
    const content = isLoading ? loadingText ?? children : children;

    return (
      <button
        {...props}
        ref={ref}
        type={type ?? "button"}
        className={clsx(
          "ds-body-strong",
          styles.retryButton,
          isLoading && styles.retryButtonLoading,
          className,
        )}
        disabled={disabled || isLoading}
        data-loading={isLoading || undefined}
        aria-busy={isLoading ? true : undefined}
      >
        {isLoading ? (
          <>
            <span aria-hidden className={styles.retryButtonSpinner} />
            <span className={styles.retryButtonLabel}>{content}</span>
          </>
        ) : (
          content
        )}
      </button>
    );
  },
);

RetryButton.displayName = "RetryButton";
