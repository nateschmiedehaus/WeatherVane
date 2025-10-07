import Head from "next/head";
import { Layout } from "../components/Layout";
import styles from "../styles/plan.module.css";

const sampleRows = [
  {
    date: "2024-06-21",
    geo: "PNW_RAIN_COOL",
    category: "Rain Jackets",
    channel: "Meta",
    spend: "$1.24k",
    change: "+12%",
    roas: "3.0×",
    driver: "Rain anomaly +45%"
  },
  {
    date: "2024-06-21",
    geo: "TX_HEAT_SPIKE",
    category: "Sunscreen",
    channel: "Google",
    spend: "$2.05k",
    change: "+8%",
    roas: "4.2×",
    driver: "Feels-like > 100°F"
  }
];

export default function PlanPage() {
  return (
    <Layout>
      <Head>
        <title>WeatherVane · Plan</title>
      </Head>
      <section className={styles.header}>
        <div>
          <h2>7-day weather-aware plan</h2>
          <p>
            Rolling horizon with expected revenue bands, weather drivers, and guardrail checks. Adjust
            totals or forecast intensity to see instant reflows.
          </p>
        </div>
        <div className={styles.actions}>
          <button type="button">Adjust budget</button>
          <button type="button" className={styles.secondary}>
            Download CSV
          </button>
        </div>
      </section>
      <section className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Geo Group</th>
              <th scope="col">Category</th>
              <th scope="col">Channel</th>
              <th scope="col">Spend</th>
              <th scope="col">Δ vs current</th>
              <th scope="col">Exp. ROAS</th>
              <th scope="col">Driver</th>
            </tr>
          </thead>
          <tbody>
            {sampleRows.map((row) => (
              <tr key={`${row.date}-${row.geo}-${row.channel}`}>
                <td>{row.date}</td>
                <td>{row.geo}</td>
                <td>{row.category}</td>
                <td>{row.channel}</td>
                <td>{row.spend}</td>
                <td>{row.change}</td>
                <td>{row.roas}</td>
                <td>{row.driver}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </Layout>
  );
}
