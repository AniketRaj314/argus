import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Check,
  CircleDollarSign,
  Eye,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { ArgusMark } from "./components/ArgusLogo";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: { absolute: "ARGUS: Every API key. Accounted for." },
  description: "Secure OpenAI API usage intelligence for teams sharing one organization.",
};

const watchlist = [
  { initial: "A", name: "Atlas production", key: "key_demo••••A91F", spend: "$284.12", tone: "mint" },
  { initial: "R", name: "Research sandbox", key: "key_demo••••2K8M", spend: "$63.47", tone: "blue" },
  { initial: "I", name: "Image lab", key: "key_demo••••P4LX", spend: "$21.46", tone: "violet" },
];

const activity = [
  { key: "Atlas production", model: "gpt-5.6", meta: "48.2K tokens · 3 req", cost: "$0.84", time: "2m ago" },
  { key: "Research sandbox", model: "gpt-5.6-mini", meta: "12.8K tokens · 1 req", cost: "$0.09", time: "18m ago" },
  { key: "Image lab", model: "gpt-image-2", meta: "1 image · 1 req", cost: "$0.04", time: "34m ago" },
];

export default async function Home() {
  await connection();
  return (
    <main className={styles.page}>
      <div className={styles.glow} aria-hidden="true" />
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="ARGUS home">
          <ArgusMark />
          <span>ARGUS</span>
          <small>API USAGE INTELLIGENCE</small>
        </Link>
        <nav className={styles.nav} aria-label="Primary navigation">
          <a href="#product">Product</a>
          <a href="#workflow">How it works</a>
        </nav>
        <Link href="/app" className={styles.headerCta}>Open ARGUS <ArrowRight size={15} /></Link>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.signal}><span /> LIVE ORGANIZATION VISIBILITY</div>
          <h1>Every API key.<br /><em>Accounted for.</em></h1>
          <p>See spend, tokens, models, and activity across one OpenAI organization, then give every person exactly the view they need.</p>
          <div className={styles.heroActions}>
            <Link href="/app" className={styles.primaryCta}>Open the dashboard <ArrowRight size={17} /></Link>
            <a href="#product" className={styles.secondaryCta}>Explore ARGUS</a>
          </div>
          <div className={styles.heroProof}>
            <span><ShieldCheck size={16} /> Admin credentials stay server-side</span>
            <span><Eye size={16} /> Usage only. Never in the request path</span>
          </div>
        </div>
        <div className={styles.heroOrbit} aria-hidden="true">
          <div className={styles.orbitRing}><div className={styles.orbitCore}><ArgusMark /></div></div>
          <span className={styles.orbitNodeOne}><KeyRound size={16} /></span>
          <span className={styles.orbitNodeTwo}><BarChart3 size={16} /></span>
          <span className={styles.orbitNodeThree}><UsersRound size={16} /></span>
          <div className={styles.orbitReadout}><small>WATCH STATUS</small><strong><i /> All systems visible</strong></div>
        </div>
      </section>

      <section className={styles.trustBar} aria-label="ARGUS capabilities">
        <span><LockKeyhole size={16} /> Server-side by design</span>
        <span><UsersRound size={16} /> Assignment-scoped access</span>
        <span><CircleDollarSign size={16} /> Lifetime credit limits</span>
        <span><Activity size={16} /> Out-of-band monitoring</span>
      </section>

      <section className={styles.product} id="product">
        <div className={styles.sectionIntro}>
          <p>THE SIGNAL, WITHOUT THE NOISE</p>
          <h2>Your organization’s usage,<br />resolved into one clear view.</h2>
          <span>Dense enough for operators. Clear enough for everyone else.</span>
        </div>
        <DashboardPreview />
      </section>

      <section className={styles.features}>
        <article className={styles.featureLead}>
          <p>ONE ORGANIZATION. PRECISE ACCESS.</p>
          <h2>Root sees the whole field.<br /><span>Everyone else sees their lane.</span></h2>
          <div className={styles.featureChecks}>
            <span><Check size={14} /> Multiple API key IDs per account</span>
            <span><Check size={14} /> Account-level lifetime credit limits</span>
            <span><Check size={14} /> Server-enforced role and assignment checks</span>
          </div>
        </article>
        <article className={styles.featureCard}>
          <div className={styles.featureIcon}><KeyRound size={21} /></div>
          <small>KEY CONTROL</small>
          <h3>Sync once. Assign precisely.</h3>
          <p>Pull visible API Key IDs from OpenAI, give each account one or many keys, and manage every assignment from a single admin surface.</p>
        </article>
        <article className={styles.featureCard}>
          <div className={styles.featureIcon}><WalletCards size={21} /></div>
          <small>CREDIT GUARDRAILS</small>
          <h3>Know what remains.</h3>
          <p>Set a total credit allocation for an account and track consumed, remaining, approaching, and exceeded states without interrupting inference traffic.</p>
        </article>
        <article className={styles.featureCard}>
          <div className={styles.featureIcon}><BarChart3 size={21} /></div>
          <small>USAGE INTELLIGENCE</small>
          <h3>From cost to cause.</h3>
          <p>Move between 7-day, 30-day, and all-time views, then break the signal down by key, model, service, tokens, requests, and activity.</p>
        </article>
      </section>

      <section className={styles.workflow} id="workflow">
        <div className={styles.sectionIntro}>
          <p>HOW ARGUS WORKS</p>
          <h2>Three moves. Full visibility.</h2>
        </div>
        <div className={styles.steps}>
          <article><b>01</b><div><RefreshCw size={20} /><h3>Sync identifiers</h3><p>ARGUS reads project API Key IDs using your server-held OpenAI Admin key.</p></div></article>
          <article><b>02</b><div><UsersRound size={20} /><h3>Assign access</h3><p>Create accounts, attach the right keys, and optionally set a total credit limit.</p></div></article>
          <article><b>03</b><div><Activity size={20} /><h3>Read the signal</h3><p>Each signed-in person sees only the usage their server-side assignments allow.</p></div></article>
        </div>
      </section>

      <section className={styles.finalCta}>
        <ArgusMark />
        <p>THE WATCH STARTS HERE</p>
        <h2>Bring every key into view.</h2>
        <span>Your OpenAI traffic stays exactly where it is. ARGUS watches the usage around it.</span>
        <Link href="/app" className={styles.primaryCta}>Open ARGUS <ArrowRight size={17} /></Link>
      </section>

      <footer className={styles.footer}>
        <Link href="/" className={styles.brand}><ArgusMark /><span>ARGUS</span></Link>
        <p>Secure OpenAI API usage intelligence.</p>
        <div><Link href="/health">System health</Link><Link href="/app">Sign in</Link><span>v1.2.1</span></div>
      </footer>
    </main>
  );
}

function DashboardPreview() {
  return (
    <div className={styles.previewFrame} aria-label="Illustrative ARGUS dashboard preview">
      <div className={styles.previewTopbar}>
        <div className={styles.previewBrand}><ArgusMark /><strong>ARGUS</strong><span>DEMO SIGNAL</span></div>
        <div className={styles.previewNav}><b>Overview</b><span>Tracked keys</span><span>Accounts</span><span>Audit trail</span></div>
        <div className={styles.previewUser}><ShieldCheck size={14} /><span>Secure</span><i>AR</i></div>
      </div>
      <div className={styles.previewBody}>
        <aside className={styles.previewWatchlist}>
          <header><span><KeyRound size={13} /> Key watchlist</span><small>3 active</small></header>
          <div className={styles.watchRows}>{watchlist.map((item) => <div className={styles.watchRow} key={item.name}>
            <i data-tone={item.tone}>{item.initial}</i><span><strong>{item.name}</strong><small>{item.key}</small></span><b>{item.spend}</b>
          </div>)}</div>
          <footer><span><i /> Live data</span><b>$369.05 total</b></footer>
        </aside>
        <div className={styles.previewCenter}>
          <div className={styles.previewMetrics}>
            <div><CircleDollarSign size={16} /><span><small>ALL-TIME SPEND</small><strong>$369.05</strong><em>↗ 18.4%</em></span></div>
            <div><Activity size={16} /><span><small>TOTAL TOKENS</small><strong>180.3M</strong><em>78% cached</em></span></div>
            <div><BarChart3 size={16} /><span><small>API REQUESTS</small><strong>3.3K</strong><em>3 active keys</em></span></div>
          </div>
          <div className={styles.previewChart}>
            <div className={styles.chartHeading}><span><small>SPEND VELOCITY</small><strong>$369.05</strong><em>↗ $48.12 in the last 7 days</em></span><b>DAILY COST</b></div>
            <svg viewBox="0 0 760 245" role="img" aria-label="Illustrative daily spend chart">
              <defs>
                <linearGradient id="argusDemoArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3ee887" stopOpacity=".28" /><stop offset="1" stopColor="#3ee887" stopOpacity="0" /></linearGradient>
              </defs>
              <g className={styles.chartGrid}><path d="M40 35H740M40 95H740M40 155H740M40 215H740" /></g>
              <path className={styles.chartAreaPath} d="M40 205 C85 200 92 181 125 193 S177 205 210 172 S257 126 295 150 S330 205 365 184 S414 65 449 101 S476 205 515 166 S563 145 594 178 S645 196 672 125 S710 76 740 174 L740 220 L40 220 Z" />
              <path className={styles.chartLinePath} d="M40 205 C85 200 92 181 125 193 S177 205 210 172 S257 126 295 150 S330 205 365 184 S414 65 449 101 S476 205 515 166 S563 145 594 178 S645 196 672 125 S710 76 740 174" />
              <g className={styles.chartLabels}><text x="40" y="240">Jul 26</text><text x="210" y="240">Aug 02</text><text x="380" y="240">Aug 09</text><text x="550" y="240">Aug 16</text><text x="700" y="240">Aug 23</text></g>
            </svg>
          </div>
        </div>
        <aside className={styles.previewActivity}>
          <header><span><Activity size={13} /> Recent usage</span><small>Latest</small></header>
          <div>{activity.map((item) => <article key={`${item.key}-${item.model}`}><span>{item.key}<small>{item.time}</small></span><strong>{item.model}</strong><p>{item.meta}<b>{item.cost}</b></p></article>)}</div>
        </aside>
      </div>
    </div>
  );
}
