import type { Metadata } from "next";
import Link from "next/link";
import { ArgusMark } from "../components/ArgusLogo";
import { getHealthSnapshot } from "../../lib/server/health";
import styles from "./health.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "System health — ARGUS" },
  description: "Current ARGUS service health and release information.",
};

function label(value: string) {
  return value.replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export default async function HealthPage() {
  const health = await getHealthSnapshot();
  const healthy = health.status === "operational";
  return <main className={styles.page}>
    <div className={styles.grid} aria-hidden="true" />
    <section className={styles.card}>
      <header className={styles.header}>
        <Link href="/" className={styles.wordmark}><ArgusMark /><span>ARGUS</span></Link>
        <span className={styles.version}>v{health.version}</span>
      </header>

      <div className={styles.hero}>
        <span className={healthy ? styles.statusIcon : `${styles.statusIcon} ${styles.degraded}`}><i /></span>
        <p>SYSTEM STATUS</p>
        <h1>{healthy ? "All eyes operational." : "ARGUS has a blind spot."}</h1>
        <span>{healthy ? "ARGUS and its database are responding normally." : "The application is responding, but a dependency needs attention."}</span>
      </div>

      <div className={styles.checks}>
        <StatusRow name="Application" detail="Web service and health checks" value={health.checks.application} />
        <StatusRow name="Database" detail="Secure persistence layer" value={health.checks.database} />
        <StatusRow name="Usage source" detail="Server-side usage provider" value={health.checks.usageSource} neutral={health.checks.usageSource !== "openai"} />
      </div>

      <dl className={styles.meta}>
        <div><dt>Version</dt><dd>v{health.version}</dd></div>
        <div><dt>Environment</dt><dd>{label(health.environment)}</dd></div>
        <div><dt>Deployment</dt><dd>{label(health.deployment)}</dd></div>
        <div><dt>Revision</dt><dd>{health.revision ?? "Local build"}</dd></div>
        <div><dt>Response</dt><dd>{health.responseTimeMs} ms</dd></div>
        <div><dt>Checked</dt><dd>{new Date(health.checkedAt).toLocaleString("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "medium" })} UTC</dd></div>
      </dl>

      <footer className={styles.footer}>
        <span>No credentials, account data, or key identifiers are exposed here.</span>
        <Link href="/">Return to ARGUS <b>→</b></Link>
      </footer>
    </section>
  </main>;
}

function StatusRow({ name, detail, value, neutral = false }: { name: string; detail: string; value: string; neutral?: boolean }) {
  const good = ["operational", "connected", "openai"].includes(value);
  return <div className={styles.check}>
    <span className={good ? styles.goodDot : neutral ? styles.neutralDot : styles.badDot} />
    <div><strong>{name}</strong><small>{detail}</small></div>
    <b>{label(value)}</b>
  </div>;
}
