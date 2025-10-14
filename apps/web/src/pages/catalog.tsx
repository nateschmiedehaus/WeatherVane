import { useCallback, useEffect, useState } from "react";
import Head from "next/head";

import { Layout } from "../components/Layout";
import { ContextPanel } from "../components/ContextPanel";
import styles from "../styles/catalog.module.css";
import { fetchCatalog } from "../lib/api";
import type { CatalogCategory, CatalogResponse } from "../types/catalog";

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-tenant";
const HORIZON_DAYS = Number(process.env.NEXT_PUBLIC_PLAN_HORIZON ?? "7");

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function CatalogPage() {
  const [response, setResponse] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  const fetchCatalogData = useCallback(() => {
    let active = true;
    setLoading(true);
    fetchCatalog(TENANT_ID, HORIZON_DAYS)
      .then((res) => {
        if (!active) return;
        setResponse(res);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message ?? "Failed to load catalog");
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
    const cancel = fetchCatalogData();
    return cancel;
  }, [fetchCatalogData, reloadCount]);

  const handleRetry = () => setReloadCount((value) => value + 1);

  const categories: CatalogCategory[] = response?.categories ?? [];
  const generatedAt = response?.generated_at ? formatDate(response.generated_at) : "—";
  const contextTags = response?.context_tags ?? [];
  const contextWarnings = response?.context_warnings ?? [];
  const metadata = (response?.data_context?.metadata as { [key: string]: unknown } | undefined) ?? {};
  const weatherSource = (metadata as { weather_source?: string }).weather_source ?? "unknown";
  const datasetRows = (metadata as { dataset_rows?: Record<string, unknown> }).dataset_rows ?? {};

  return (
    <Layout>
      <Head>
        <title>WeatherVane · Catalog</title>
      </Head>
      <div className={styles.root}>
        <section className={styles.header}>
          <div>
            <h2 className="ds-title">Catalog &amp; ad tagging</h2>
            <p className="ds-body">
              Approve suggested weather & seasonal tags, sync them back to Shopify metafields, and see
              which ads are available for each run.
            </p>
          </div>
          <aside className={styles.meta}>
            <dl>
              <div>
                <dt className="ds-caption">Generated</dt>
                <dd className="ds-body-strong">{generatedAt}</dd>
              </div>
              <div>
                <dt className="ds-caption">Entries</dt>
                <dd className="ds-body-strong">{categories.length}</dd>
              </div>
            </dl>
            <button type="button" className={`${styles.metaButton} ds-pill ds-body-strong`}>
              Sync tags to Shopify
            </button>
          </aside>
        </section>

        {loading && (
          <p className={`${styles.status} ds-body`} role="status" aria-live="polite">
            Loading catalog tags…
          </p>
        )}
        {error && (
          <div className={styles.error} role="alert">
            <p className="ds-body">{error}</p>
            <button type="button" onClick={handleRetry} className={`${styles.retryButton} ds-body-strong`}>
              Retry loading catalog
            </button>
          </div>
        )}

        {!loading && !error && (
          <section className={styles.contextSection}>
            <ContextPanel tags={contextTags} warnings={contextWarnings} />
            <div className={styles.contextMeta}>
              <div className={styles.metaRow}>
                <span className={`${styles.metaLabel} ds-caption`}>Weather source</span>
                <span className={`${styles.metaValue} ds-body-strong`}>{weatherSource}</span>
              </div>
              {Object.keys(datasetRows).length > 0 && (
                <dl className={styles.datasetStats}>
                  {Object.entries(datasetRows).map(([name, value]) => (
                    <div key={name}>
                      <dt className="ds-caption">{name}</dt>
                      <dd className="ds-body-strong">
                        {typeof value === "number" ? value.toLocaleString() : String(value ?? "—")}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </section>
        )}

        {!loading && !error && (
          <section className={styles.list}>
            {categories.map((category) => (
              <article key={`${category.geo_group_id}-${category.name}-${category.channel}`}>
                <header>
                  <div>
                    <h3 className="ds-title">{category.name}</h3>
                    <p className={`${styles.metaLine} ds-caption`}>
                      {category.geo_group_id} · {category.channel}
                    </p>
                  </div>
                  <span className={`${styles.statusBadge} ds-caption`}>{category.status}</span>
                </header>
                <dl>
                  <div>
                    <dt className="ds-caption">Weather tags</dt>
                    <dd className="ds-body">{category.weather_tags.join(", ")}</dd>
                  </div>
                  <div>
                    <dt className="ds-caption">Season tags</dt>
                    <dd className="ds-body">{category.season_tags.join(", ") || "—"}</dd>
                  </div>
                  <div>
                    <dt className="ds-caption">Lift</dt>
                    <dd className="ds-body">{category.lift}</dd>
                  </div>
                </dl>
                <button type="button" className={`${styles.manageButton} ds-pill ds-body-strong`}>
                  Manage ads
                </button>
              </article>
            ))}
            {!categories.length && (
              <article className={styles.placeholder}>
                <h3 className="ds-title">No tagged categories yet</h3>
                <p className="ds-body">
                  Run tagging to discover weather-season combinations that move revenue. Approved tags
                  sync back to Shopify and drive ad pairing suggestions.
                </p>
              </article>
            )}
          </section>
        )}
      </div>
    </Layout>
  );
}
