import { useCallback, useEffect, useState } from "react";
import Head from "next/head";

import { Layout } from "../components/Layout";
import { ContextPanel } from "../components/ContextPanel";
import styles from "../styles/stories.module.css";
import { fetchStories } from "../lib/api";
import type { StoriesResponse, WeatherStory } from "../types/stories";

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-tenant";
const HORIZON_DAYS = Number(process.env.NEXT_PUBLIC_PLAN_HORIZON ?? "7");

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function StoriesPage() {
  const [response, setResponse] = useState<StoriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

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
            <button type="button" onClick={handleRetry} className={`${styles.retryButton} ds-body-strong`}>
              Retry loading stories
            </button>
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
            {stories.map((story) => (
              <article key={`${story.plan_date}-${story.category}-${story.channel}`}>
                <header>
                  <span className={styles.icon} aria-hidden>
                    {story.icon ?? "🌤"}
                  </span>
                  <div>
                    <h3 className="ds-title">{story.title}</h3>
                    <p className={`${styles.metaLine} ds-caption`}>
                      {story.channel} · {story.confidence} · {formatDate(story.plan_date)}
                    </p>
                  </div>
                </header>
                <p className={`${styles.summary} ds-body`}>{story.summary}</p>
                <footer className="ds-body">{story.detail}</footer>
              </article>
            ))}
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
