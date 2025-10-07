import Head from "next/head";
import { Layout } from "../components/Layout";
import styles from "../styles/automations.module.css";

const policies = [
  {
    name: "Guardrails",
    description: "Max 15% budget change per day, ROAS floor 2.5×, CPA ceiling $45.",
    status: "Active"
  },
  {
    name: "Automation Level",
    description: "Assist — require approvals before pushing changes.",
    status: "Pending approval"
  },
  {
    name: "Alerts",
    description: "Slack #ads-performance, email to growth@brand.com",
    status: "Configured"
  }
];

export default function AutomationsPage() {
  return (
    <Layout>
      <Head>
        <title>WeatherVane · Automations</title>
      </Head>
      <section className={styles.header}>
        <h2>Automations & guardrails</h2>
        <p>
          Choose the automation mode, define ramp limits, and route alerts. Every push is logged with
          before/after values so finance and agencies stay aligned.
        </p>
      </section>
      <section className={styles.panel}>
        {policies.map((policy) => (
          <article key={policy.name}>
            <header>
              <h3>{policy.name}</h3>
              <span>{policy.status}</span>
            </header>
            <p>{policy.description}</p>
            <button type="button">Edit</button>
          </article>
        ))}
      </section>
    </Layout>
  );
}
