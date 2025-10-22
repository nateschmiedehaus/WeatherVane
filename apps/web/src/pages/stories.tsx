import { useCallback, useEffect, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";

import { Layout } from "../components/Layout";
import { ContextPanel } from "../components/ContextPanel";
import { RetryButton } from "../components/RetryButton";
import styles from "../styles/stories.module.css";
import { fetchStories } from "../lib/api";
import type { StoriesResponse, WeatherStory } from "../types/stories";
import {
  buildStoryHighlights,
  buildStorySharePayload,
  formatStoryDate,
} from "../lib/stories-insights";

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-tenant";
const HORIZON_DAYS = Number(process.env.NEXT_PUBLIC_PLAN_HORIZON ?? "7");

export default function StoriesPage() {
  const [response, setResponse] = useState<StoriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [copiedStoryKey, setCopiedStoryKey] = useState<string | null>(null);
  const [copyErrorStoryKey, setCopyErrorStoryKey] = useState<string | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);

  const fetchStoriesData = useCallback(() => {
    let active = true;
    setLoading(true);
    fetchStories(TENANT_ID, HORIZON_DAYS)
      .then((res) => {
        if (!active) return;
        setResponse(res);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message ?? "Failed to load weather stories");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const cancel = fetchStoriesData();
    return cancel;
  }, [fetchStoriesData, reloadCount]);

  const handleRetry = () => setReloadCount((value) => value + 1);
  const handleCopyStory = useCallback(async (story: WeatherStory) => {
    const storyKey = `${story.plan_date}-${story.category}-${story.channel}`;
    if (copyTimeoutRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = null;
    }
    try {
      const payload = buildStorySharePayload(story, { horizonDays: HORIZON_DAYS });
      const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
      if (!clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await clipboard.writeText(payload);
      setCopyErrorStoryKey(null);
      setCopiedStoryKey(storyKey);
      if (typeof window !== "undefined") {
        copyTimeoutRef.current = window.setTimeout(() => {
          setCopiedStoryKey((current) => (current === storyKey ? null : current));
          copyTimeoutRef.current = null;
        }, 4000);
      }
    } catch (copyError) {
      console.error("Failed to copy story briefing", copyError);
      setCopiedStoryKey(null);
      setCopyErrorStoryKey(storyKey);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = null;
      }
    };
  }, []);

  const stories: WeatherStory[] = response?.stories ?? [];
  const generatedAt = response?.generated_at
    ? new Date(response.generated_at).toLocaleString()
    : "—";
  const contextTags = response?.context_tags ?? [];
  const contextWarnings = response?.context_warnings ?? [];
  const metadata = (response?.data_context?.metadata as { [key: string]: unknown } | undefined) ?? {};
  const weatherSource = (metadata as { weather_source?: string }).weather_source ?? "unknown";
  return (
    <Layout>
      <Head>
        <title>WeatherVane · Stories</title>
      </Head>
      <div className={styles.root}>
        <section className={styles.header}>
          <div>
            <h2 className="ds-title">Weekly weather stories</h2>
            <p className="ds-body">
              Forecast-driven insights for the team. Each story blends anomalies, promo context, and
              incremental impact so you can ship a memo in minutes.
            </p>
          </div>
          <aside className={styles.meta}>
            <dl>
              <div>
                <dt className="ds-caption">Generated</dt>
                <dd className="ds-body-strong">{generatedAt}</dd>
              </div>
              <div>
                <dt className="ds-caption">Horizon</dt>
                <dd className="ds-body-strong">{HORIZON_DAYS} days</dd>
              </div>
              <div>
                <dt className="ds-caption">Total stories</dt>
                <dd className="ds-body-strong">{stories.length}</dd>
              </div>
            </dl>
          </aside>
        </section>

        {loading && (
          <p className={`${styles.status} ds-body`} role="status" aria-live="polite">
            Loading stories…
          </p>
        )}
        {error && (
          <div className={styles.error} role="alert">
            <p className="ds-body">{error}</p>
            <RetryButton onClick={handleRetry}>Retry loading stories</RetryButton>
          </div>
        )}

        {!loading && !error && (
          <section className={styles.contextSection}>
            <ContextPanel tags={contextTags} warnings={contextWarnings} />
            <div className={styles.contextMeta}>
              <span className={styles.metaLabel}>Weather source</span>
              <span className={styles.metaValue}>{weatherSource}</span>
            </div>
          </section>
        )}

        {!loading && !error && (
          <section className={styles.grid}>
            {stories.map((story) => {
              const storyKey = `${story.plan_date}-${story.category}-${story.channel}`;
              const highlights = buildStoryHighlights(story.detail, { limit: 3 });
              const planHref = `/plan?source=stories&focus=${encodeURIComponent(
                story.category,
              )}&date=${encodeURIComponent(story.plan_date)}`;
              const isCopied = copiedStoryKey === storyKey;
              const hasCopyError = copyErrorStoryKey === storyKey;
              const statusMessage = isCopied
                ? "Briefing copied to clipboard."
                : hasCopyError
                  ? "Copy failed. Use Cmd/Ctrl+C to share manually."
                  : "";
              const statusTone = isCopied ? "success" : hasCopyError ? "critical" : "muted";

              return (
                <article key={storyKey}>
                  <header>
                    <span className={styles.icon} aria-hidden>
                      {story.icon ?? "🌤"}
                    </span>
                    <div>
                      <h3 className="ds-title">{story.title}</h3>
                      <div className={styles.chipRow}>
                        <span className={styles.chip} data-variant="channel">
                          {story.channel}
                        </span>
                        <span
                          className={styles.chip}
                          data-variant="confidence"
                          data-confidence={story.confidence}
                        >
                          {story.confidence} confidence
                        </span>
                        <span className={styles.chip} data-variant="date">
                          {formatStoryDate(story.plan_date)}
                        </span>
                      </div>
                    </div>
                  </header>
                  <p className={`${styles.summary} ds-body`}>{story.summary}</p>

                  {highlights.length > 0 ? (
                    <>
                      <ul className={styles.highlightList}>
                        {highlights.map((highlight) => (
                          <li key={highlight}>{highlight}</li>
                        ))}
                      </ul>
                      {story.detail.trim() ? (
                        <details className={styles.detailDisclosure}>
                          <summary className="ds-caption">Full briefing</summary>
                          <p className={`${styles.detail} ds-body`}>{story.detail}</p>
                        </details>
                      ) : null}
                    </>
                  ) : story.detail.trim() ? (
                    <p className={`${styles.detail} ds-body`}>{story.detail}</p>
                  ) : null}

                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      onClick={() => handleCopyStory(story)}
                      className="ds-button"
                      data-state={isCopied ? "success" : hasCopyError ? "error" : undefined}
                      data-variant="primary"
                    >
                      {isCopied ? "Copied briefing" : "Copy briefing"}
                    </button>
                    <Link href={planHref} className="ds-button" data-variant="ghost">
                      Open in Plan
                    </Link>
                  </div>
                  <div
                    className={statusMessage ? "ds-status" : "sr-only"}
                    data-tone={statusMessage ? statusTone : undefined}
                    role="status"
                    aria-live="polite"
                  >
                    {statusMessage || " "}
                  </div>
                </article>
              );
            })}
            {!stories.length && (
              <article className={styles.placeholder}>
                <h3 className="ds-title">No stories yet</h3>
                <p className="ds-body">
                  Run the pipeline to generate weather-driven narratives. Stories will highlight the
                  highest-confidence opportunities across your catalog.
                </p>
              </article>
            )}
          </section>
        )}
      </div>
    </Layout>
  );
}
