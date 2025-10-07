import Head from "next/head";
import { Layout } from "../components/Layout";
import styles from "../styles/catalog.module.css";

const categories = [
  {
    name: "Rain Jackets",
    weatherTags: ["Rain", "Wind", "Cold"],
    seasonTags: ["Spring", "Fall"],
    status: "Auto-tagged",
    lift: "+26% rainy days"
  },
  {
    name: "Sunscreen",
    weatherTags: ["Heat", "UV"],
    seasonTags: ["Summer"],
    status: "Manual override",
    lift: "+18% heat spikes"
  }
];

export default function CatalogPage() {
  return (
    <Layout>
      <Head>
        <title>WeatherVane · Catalog</title>
      </Head>
      <section className={styles.header}>
        <h2>Catalog & ad tagging</h2>
        <p>
          Approve suggested weather & seasonal tags, sync them back to Shopify metafields, and see
          which ads are available for each run.
        </p>
        <button type="button">Sync tags to Shopify</button>
      </section>
      <section className={styles.list}>
        {categories.map((category) => (
          <article key={category.name}>
            <div>
              <h3>{category.name}</h3>
              <p>{category.lift}</p>
            </div>
            <dl>
              <dt>Weather</dt>
              <dd>{category.weatherTags.join(", ")}</dd>
              <dt>Season</dt>
              <dd>{category.seasonTags.join(", ")}</dd>
              <dt>Status</dt>
              <dd>{category.status}</dd>
            </dl>
            <button type="button" className={styles.manageButton}>
              Manage ads
            </button>
          </article>
        ))}
      </section>
    </Layout>
  );
}
