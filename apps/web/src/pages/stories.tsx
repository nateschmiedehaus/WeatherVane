import { useEffect, useState } from "react";
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

  useEffect(() => {
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
            <h2>Weekly weather stories</h2>
            <p>
              Forecast-driven insights for the team. Each story blends anomalies, promo context, and
              incremental impact so you can ship a memo in minutes.
            </p>
          </div>
          <aside className={styles.meta}>
            <dl>
              <div>
                <dt>Generated</dt>
                <dd>{generatedAt}</dd>
              </div>
              <div>
                <dt>Horizon</dt>
                <dd>{HORIZON_DAYS} days</dd>
              </div>
              <div>
                <dt>Total stories</dt>
                <dd>{stories.length}</dd>
              </div>
            </dl>
          </aside>
        </section>

        {loading && <p className={styles.status}>Loading stories…</p>}
        {error && <p className={styles.error}>{error}</p>}

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
                    <h3>{story.title}</h3>
                    <p className={styles.metaLine}>
                      {story.channel} · {story.confidence} · {formatDate(story.plan_date)}
                    </p>
                  </div>
                </header>
                <p className={styles.summary}>{story.summary}</p>
                <footer>{story.detail}</footer>
              </article>
            ))}
            {!stories.length && (
              <article className={styles.placeholder}>
                <h3>No stories yet</h3>
                <p>
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
