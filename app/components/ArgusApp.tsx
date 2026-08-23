"use client";

import Link from "next/link";
import {
  Activity, ArrowDownRight, ArrowUpRight, BarChart3, Check, ChevronDown,
  CircleDollarSign, Copy, Eye, EyeOff, FileClock, Gauge, KeyRound, Layers3, LoaderCircle,
  LockKeyhole, LogOut, Menu, MoreHorizontal, Pencil, Plus, RefreshCcw, Search, ShieldCheck,
  Sparkles, Trash2, TriangleAlert, Users, WalletCards, X, Zap,
} from "lucide-react";
import { FormEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip,
  XAxis, YAxis,
} from "recharts";
import { ArgusMark } from "./ArgusLogo";

type Account = {
  id: string; email: string; displayName: string; role: "root" | "user";
  status: "active" | "disabled"; createdAt: number; lastLoginAt: number | null; keyCount?: number;
  creditLimitCents?: number | null; budgetLimitCents?: number | null; budgetSpentCents?: number | null;
  sharedKeyCount?: number;
};
type TrackedKey = { id: string; keyId: string; label: string; projectId: string | null; status?: "active" | "archived"; assignedNames?: string[]; assignmentCount?: number; createdAt?: number };
type Bootstrap = { configured: boolean; authenticated: boolean; csrfToken?: string; account?: Account; keys?: TrackedKey[] };
type Dashboard = {
  source: "openai" | "demo" | "empty"; generatedAt: number; rangeDays: number;
  range: RangeOption; rangeStart: number; granularity: "day" | "month";
  summary: { totalSpend: number; previousSpend: number | null; inputTokens: number; outputTokens: number; cachedTokens: number; requests: number; activeKeys: number };
  daily: Array<{ timestamp: number; label: string; spend: number; inputTokens: number; outputTokens: number; requests: number }>;
  models: Array<{ name: string; inputTokens: number; outputTokens: number; requests: number; totalTokens: number }>;
  keys: Array<{ id: string; keyId: string; label: string; spend: number; tokens: number; requests: number; lastActiveAt: number | null }>;
  services: Array<{ name: string; requests: number }>;
  recent: Array<{ id: string; timestamp: number; keyLabel: string; model: string; tokens: number; requests: number; spend: number }>;
  notices: string[];
  budget: { limitCents: number; spentCents: number | null; remainingCents: number | null; percentUsed: number | null; trackingStart: number; status: "healthy" | "warning" | "exceeded" | "unavailable" } | null;
};
type AuditEvent = { id: string; action: string; targetType: string; targetId: string | null; metadata: Record<string, unknown>; createdAt: number; actorName: string; actorEmail: string | null };
type Assignment = { accountId: string; apiKeyId: string; assignedAt: number };
type Tab = "overview" | "keys" | "accounts" | "audit";
type RangeOption = 7 | 30 | "all";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const dateTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const dateOnly = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const modelColors = ["#3ee887", "#68a6ff", "#a78bfa", "#fbad4f", "#39d6d1", "#f2718b"];

async function requestJson<T>(url: string, init?: RequestInit, csrfToken?: string): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("X-Argus-Request", "1");
  if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  if (init?.body) headers.set("Content-Type", "application/json");
  const response = await fetch(url, { ...init, headers, credentials: "same-origin", cache: "no-store" });
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error || "Request failed.");
  return body as T;
}

export function ArgusApp() {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try { setBootstrap(await requestJson<Bootstrap>("/api/bootstrap")); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "ARGUS could not start."); }
  }, []);
  // This initial request synchronizes the client with the server-owned session.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  if (!bootstrap && !error) return <FullScreenLoader />;
  if (!bootstrap) return <FatalState message={error} onRetry={load} />;
  if (!bootstrap.authenticated) return <AuthScreen configured={bootstrap.configured} onComplete={load} />;
  return <DashboardShell initial={bootstrap} onSignedOut={load} />;
}

function FullScreenLoader() {
  return <main className="boot-screen"><div className="boot-mark"><ArgusMark /><LoaderCircle className="spin" size={20} /></div><p>Bringing ARGUS online…</p></main>;
}

function FatalState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <main className="boot-screen"><div className="empty-icon"><Activity /></div><h1>ARGUS is out of view</h1><p>{message}</p><button className="button primary" onClick={onRetry}><RefreshCcw size={16} /> Try again</button></main>;
}

function AuthScreen({ configured, onComplete }: { configured: boolean; onComplete: () => void }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await requestJson(configured ? "/api/auth/login" : "/api/setup", { method: "POST", body: JSON.stringify(values) });
      onComplete();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Request failed."); }
    finally { setBusy(false); }
  }
  return <main className="auth-page">
    <div className="auth-ambient ambient-one" /><div className="auth-ambient ambient-two" />
    <section className="auth-brand">
      <div className="wordmark light"><ArgusMark /> <span>ARGUS</span></div>
      <div className="auth-copy">
        <p className="eyebrow"><span className="status-dot" /> API USAGE INTELLIGENCE</p>
        <h1>Every key.<br />Under watch.</h1>
        <p className="auth-lede">Track spend, tokens, models, and activity across your OpenAI organization, with every view scoped to the right person.</p>
      </div>
      <div className="auth-security"><ShieldCheck size={18} /><span><strong>Server-side by design.</strong> Admin credentials never reach this browser.</span></div>
    </section>
    <section className="auth-panel">
      <div className="auth-form-wrap">
        <div className="mobile-wordmark wordmark light"><ArgusMark /> <span>ARGUS</span></div>
        <p className="eyebrow">{configured ? "SECURE ACCESS" : "ONE-TIME SETUP"}</p>
        <h2>{configured ? "Welcome back" : "Create the root account"}</h2>
        <p className="muted">{configured ? "Sign in to view your assigned usage." : "This first account controls access and key assignments."}</p>
        <form onSubmit={submit} className="auth-form">
          {!configured && <label>Display name<input name="displayName" autoComplete="name" placeholder="Aniket Raj" required /></label>}
          <label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></label>
          <label>Password<div className="password-wrap"><input name="password" type={visible ? "text" : "password"} autoComplete={configured ? "current-password" : "new-password"} placeholder="••••••••••••" required /><button type="button" aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible((value) => !value)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
          {!configured && <><label>Server setup token<input name="setupToken" type="password" autoComplete="off" placeholder="From server configuration" required /></label><p className="field-note"><LockKeyhole size={14} /> Used once and checked only on the server.</p></>}
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="button primary auth-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <ShieldCheck size={18} />}{configured ? "Sign in to ARGUS" : "Initialize ARGUS"}</button>
        </form>
        <p className="auth-footnote">Protected with HttpOnly sessions, role-based access, origin checks, and audit logging.</p>
      </div>
    </section>
  </main>;
}

function DashboardShell({ initial, onSignedOut }: { initial: Bootstrap; onSignedOut: () => void }) {
  const account = initial.account!;
  const [csrfToken, setCsrfToken] = useState(initial.csrfToken ?? "");
  const [visibleKeys, setVisibleKeys] = useState(initial.keys ?? []);
  const [tab, setTab] = useState<Tab>("overview");
  const [mobileNav, setMobileNav] = useState(false);
  const [profileMenu, setProfileMenu] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [range, setRange] = useState<RangeOption>(30);
  const [selectedKey, setSelectedKey] = useState("all");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [keyRollupCache, setKeyRollupCache] = useState<{ range: RangeOption | null; keys: Dashboard["keys"] }>({ range: null, keys: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adminVersion, setAdminVersion] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const refreshBootstrap = useCallback(async () => {
    const data = await requestJson<Bootstrap>("/api/bootstrap");
    const nextKeys = data.keys ?? [];
    setCsrfToken(data.csrfToken ?? ""); setVisibleKeys(nextKeys);
    setSelectedKey((current) => current === "all" || nextKeys.some((key) => key.id === current) ? current : "all");
  }, []);
  const loadDashboard = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ range: String(range) });
      if (selectedKey !== "all") query.set("key", selectedKey);
      const nextDashboard = await requestJson<Dashboard>(`/api/dashboard?${query}`, { signal });
      setDashboard(nextDashboard);
      setKeyRollupCache((current) => {
        if (selectedKey === "all") return { range, keys: nextDashboard.keys };
        const cachedKeys = current.range === range ? current.keys : [];
        const merged = new Map(cachedKeys.map((key) => [key.id, key]));
        for (const key of nextDashboard.keys) merged.set(key.id, key);
        return { range, keys: [...merged.values()] };
      });
    } catch (reason) {
      if (!signal?.aborted) setError(reason instanceof Error ? reason.message : "Usage could not be loaded.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [range, selectedKey]);
  useEffect(() => {
    const controller = new AbortController();
    // This request synchronizes dashboard state with the selected server query.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDashboard(controller.signal);
    return () => controller.abort();
  }, [loadDashboard, adminVersion, refreshVersion]);

  function selectRange(value: RangeOption) { if (value !== range) { setLoading(true); setRange(value); } }
  function selectKey(value: string) { if (value !== selectedKey) { setLoading(true); setSelectedKey(value); } }
  function refreshDashboard() { setLoading(true); setRefreshVersion((value) => value + 1); }

  async function logout() {
    try { await requestJson("/api/auth/logout", { method: "POST" }, csrfToken); onSignedOut(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not sign out."); }
  }
  const nav: Array<{ id: Tab; label: string; icon: ReactNode }> = [
    { id: "overview", label: "Overview", icon: <Gauge size={17} /> },
    { id: "keys", label: account.role === "root" ? "Tracked keys" : "My keys", icon: <KeyRound size={17} /> },
    ...(account.role === "root" ? [
      { id: "accounts" as Tab, label: "Accounts", icon: <Users size={17} /> },
      { id: "audit" as Tab, label: "Audit trail", icon: <FileClock size={17} /> },
    ] : []),
  ];
  return <div className="app-shell">
    <div className={tab === "overview" && loading ? "shell-progress visible" : "shell-progress"} role="progressbar" aria-label="Loading ARGUS data" aria-hidden={tab !== "overview" || !loading}><span /></div>
    <header className="topbar">
      <button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileNav((value) => !value)}><Menu size={20} /></button>
      <div className="wordmark"><Link href="/" className="home-mark" aria-label="Go to ARGUS home"><ArgusMark /></Link><span>ARGUS</span><small>API USAGE INTELLIGENCE</small></div>
      <nav className={mobileNav ? "main-nav open" : "main-nav"} aria-label="Main navigation">
        {nav.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => { setTab(item.id); setMobileNav(false); }}>{item.icon}<span>{item.label}</span></button>)}
      </nav>
      <div className="top-actions">
        <span className="secure-pill"><ShieldCheck size={14} /> Secure</span>
        <div className="profile-menu-wrap" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setProfileMenu(false); }}>
          <button type="button" className="profile-chip" aria-label="Open account menu" aria-haspopup="menu" aria-expanded={profileMenu} onClick={() => setProfileMenu((open) => !open)}><span>{initials(account.displayName)}</span><span className="profile-copy"><strong>{account.displayName}</strong><small>{account.role === "root" ? "Root access" : "Member"}</small></span><ChevronDown size={15} /></button>
          {profileMenu && <div className="profile-menu" role="menu"><div><strong>{account.displayName}</strong><small>{account.email}</small></div><button role="menuitem" onClick={() => { setProfileMenu(false); setPasswordOpen(true); }}><LockKeyhole size={15} /> Change password</button><button role="menuitem" onClick={() => { setProfileMenu(false); void logout(); }}><LogOut size={15} /> Sign out</button></div>}
        </div>
      </div>
    </header>
    <main className="content">
      {tab === "overview" && <Overview dashboard={dashboard} loading={loading} error={error} keys={visibleKeys} keyRollups={keyRollupCache.range === range ? keyRollupCache.keys : []} range={range} selectedKey={selectedKey} onRange={selectRange} onKey={selectKey} onRetry={refreshDashboard} />}
      {tab === "keys" && (account.role === "root"
        ? <AdminKeys csrfToken={csrfToken} onChanged={async () => { await refreshBootstrap(); setAdminVersion((value) => value + 1); }} />
        : <MemberKeys keys={dashboard?.keys ?? []} loading={loading} />)}
      {tab === "accounts" && account.role === "root" && <AdminAccounts csrfToken={csrfToken} onChanged={() => setAdminVersion((value) => value + 1)} />}
      {tab === "audit" && account.role === "root" && <AuditTrail />}
    </main>
    {passwordOpen && <ChangePasswordModal csrfToken={csrfToken} onClose={() => setPasswordOpen(false)} onChanged={() => { setPasswordOpen(false); onSignedOut(); }} />}
  </div>;
}

function Overview({ dashboard, loading, error, keys, keyRollups, range, selectedKey, onRange, onKey, onRetry }: {
  dashboard: Dashboard | null; loading: boolean; error: string; keys: TrackedKey[]; keyRollups: Dashboard["keys"]; range: RangeOption; selectedKey: string;
  onRange: (range: RangeOption) => void; onKey: (key: string) => void; onRetry: () => void;
}) {
  const spendChange = dashboard?.summary.previousSpend ? ((dashboard.summary.totalSpend - dashboard.summary.previousSpend) / dashboard.summary.previousSpend) * 100 : null;
  const totalTokens = (dashboard?.summary.inputTokens ?? 0) + (dashboard?.summary.outputTokens ?? 0);
  const loadingScope = selectedKey === "all" ? "all visible keys" : keys.find((key) => key.id === selectedKey)?.label ?? "selected key";
  const rollups = new Map(keyRollups.map((key) => [key.id, key]));
  for (const key of dashboard?.keys ?? []) rollups.set(key.id, key);
  const keyColorIndexes = new Map(keys.map((key, index) => [key.id, index]));
  const watchlistKeys = [...keys].sort((left, right) => {
    const leftSpend = rollups.get(left.id)?.spend;
    const rightSpend = rollups.get(right.id)?.spend;
    if (leftSpend !== undefined && rightSpend !== undefined && leftSpend !== rightSpend) return rightSpend - leftSpend;
    if (leftSpend !== undefined && rightSpend === undefined) return -1;
    if (leftSpend === undefined && rightSpend !== undefined) return 1;
    return left.label.localeCompare(right.label);
  });
  return <>
    <div className="page-heading">
      <div><p className="eyebrow">ARGUS / OVERVIEW</p><h1>Good {dayPeriod()}, <span>here’s the signal.</span></h1><p>Organization usage, scoped to the keys you’re allowed to see.</p></div>
      <div className="filter-row">
        <div className="range-switch" aria-label="Date range">{([{ value: 7, label: "7D" }, { value: 30, label: "30D" }, { value: "all", label: "ALL" }] as Array<{ value: RangeOption; label: string }>).map((option) => <button key={option.label} onClick={() => onRange(option.value)} className={range === option.value ? "active" : ""}>{option.label}</button>)}</div>
        <button className="icon-button bordered" aria-label="Refresh usage" onClick={onRetry}><RefreshCcw className={loading ? "spin" : ""} size={17} /></button>
      </div>
    </div>
    {loading && dashboard && <div className="data-loading" role="status"><LoaderCircle className="spin" size={16} /><span>Loading usage for <strong>{loadingScope}</strong>…</span></div>}
    {error ? <section className="error-card"><Activity /><div><strong>Usage feed unavailable</strong><p>{error}</p></div><button className="button secondary" onClick={onRetry}>Retry</button></section> : null}
    {dashboard?.notices.map((notice) => <div className="notice" key={notice}><Sparkles size={15} />{notice}</div>)}
    {dashboard?.budget && <BudgetBanner budget={dashboard.budget} />}
    {loading && !dashboard ? <DashboardSkeleton /> : dashboard?.source === "empty" ? <EmptyOverview /> : dashboard && <div className={loading ? "overview-grid refreshing" : "overview-grid"} aria-busy={loading}>
      <aside className="left-rail">
        <section className="panel key-scope-panel">
          <PanelTitle icon={<KeyRound size={17} />} title="Key watchlist" action={selectedKey === "all" ? `${dashboard.summary.activeKeys}/${keys.length} active` : <button type="button" className="watch-clear" aria-label="Show all keys" onClick={() => onKey("all")}>All keys</button>} />
          <div className={selectedKey === "all" ? "key-watch-list" : "key-watch-list has-selection"}>{watchlistKeys.map((key) => {
            const selected = selectedKey === key.id;
            const rollup = rollups.get(key.id);
            return <button key={key.id} type="button" aria-pressed={selected} aria-label={selected ? "Show all keys" : `View ${key.label}`} onClick={() => onKey(selected ? "all" : key.id)} className={selected ? "key-watch active" : selectedKey === "all" ? "key-watch" : "key-watch muted"}>
              <span className="key-sigil" style={{ "--sigil": modelColors[(keyColorIndexes.get(key.id) ?? 0) % modelColors.length] } as React.CSSProperties}>{key.label.slice(0, 1).toUpperCase()}</span>
              <span><strong>{key.label}</strong><small>{maskKey(key.keyId)}</small></span>
              <span className={rollup ? "key-spend" : "key-spend pending"}>{rollup ? money.format(rollup.spend) : "Select"}</span>
            </button>;
          })}</div>
          <div className="panel-footer"><span><span className="live-dot" /> Live from OpenAI</span><small>Refreshed {relativeTime(dashboard.generatedAt)}</small></div>
        </section>
        <section className="panel token-mix">
          <PanelTitle icon={<Layers3 size={17} />} title="Token mix" />
          <div className="donut-wrap"><div className="donut" style={{ background: `conic-gradient(#3ee887 0 ${percent(dashboard.summary.inputTokens, totalTokens)}%, #68a6ff ${percent(dashboard.summary.inputTokens, totalTokens)}% ${percent(totalTokens - dashboard.summary.cachedTokens, totalTokens)}%, #a78bfa 0)` }}><div><strong>{compact.format(totalTokens)}</strong><small>total</small></div></div></div>
          <div className="legend-list"><Legend color="#3ee887" label="Input" value={compact.format(dashboard.summary.inputTokens)} /><Legend color="#68a6ff" label="Output" value={compact.format(dashboard.summary.outputTokens)} /><Legend color="#a78bfa" label="Cached" value={compact.format(dashboard.summary.cachedTokens)} /></div>
        </section>
      </aside>
      <section className="center-stage">
        <div className="metric-strip">
          <MetricCard icon={<CircleDollarSign />} label={range === "all" ? "All-time spend" : `${range}-day spend`} value={money.format(dashboard.summary.totalSpend)} delta={spendChange ?? undefined} />
          <MetricCard icon={<Zap />} label="Total tokens" value={compact.format(totalTokens)} sub={`${percent(dashboard.summary.cachedTokens, dashboard.summary.inputTokens)}% cached`} />
          <MetricCard icon={<Activity />} label="API requests" value={compact.format(dashboard.summary.requests)} sub={`${dashboard.summary.activeKeys} active keys`} />
        </div>
        <section className="panel hero-chart">
          <div className="hero-chart-header"><div><p className="eyebrow">SPEND VELOCITY</p><h2>{money.format(dashboard.summary.totalSpend)}</h2>{spendChange === null ? <p className="delta"><FileClock size={16} />Since {dateOnly.format(dashboard.rangeStart * 1000)}</p> : <p className={spendChange <= 0 ? "delta good" : "delta warn"}>{spendChange <= 0 ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}{Math.abs(spendChange).toFixed(1)}% vs previous {range} days</p>}</div><div className="chart-badge"><BarChart3 size={16} /> {dashboard.granularity === "month" ? "MONTHLY COST" : "DAILY COST"}</div></div>
          <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={dashboard.daily} margin={{ top: 12, right: 0, left: -24, bottom: 0 }}><defs><linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3ee887" stopOpacity={0.42} /><stop offset="100%" stopColor="#3ee887" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#123b47" strokeDasharray="2 6" /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#78919a", fontSize: 11 }} minTickGap={28} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "#78919a", fontSize: 11 }} tickFormatter={(value) => `$${value}`} /><Tooltip content={<SpendTooltip />} /><Area type="monotone" dataKey="spend" stroke="#3ee887" strokeWidth={3} fill="url(#spendFill)" activeDot={{ r: 5, fill: "#eafff2", stroke: "#3ee887", strokeWidth: 3 }} /></AreaChart></ResponsiveContainer></div>
        </section>
        <div className="lower-grid">
          <section className="panel model-card"><PanelTitle icon={<BarChart3 size={17} />} title="Model distribution" action="BY TOKENS" /><div className="model-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={dashboard.models.slice(0, 5)} layout="vertical" margin={{ left: 5, right: 10 }}><XAxis type="number" hide /><YAxis type="category" dataKey="name" width={116} axisLine={false} tickLine={false} tick={{ fill: "#9cb0b8", fontSize: 11 }} /><Tooltip cursor={{ fill: "#092d38" }} content={<ModelTooltip />} /><Bar dataKey="totalTokens" radius={[0, 5, 5, 0]}>{dashboard.models.slice(0, 5).map((_, index) => <Cell key={index} fill={modelColors[index % modelColors.length]} />)}</Bar></BarChart></ResponsiveContainer></div></section>
          <section className="panel services-card"><PanelTitle icon={<Gauge size={17} />} title="API surfaces" action="REQUESTS" /><div className="service-list">{dashboard.services.slice(0, 5).map((service, index) => <div key={service.name}><span className="service-icon" style={{ color: modelColors[index % modelColors.length] }}><ServiceGlyph name={service.name} /></span><span><strong>{service.name}</strong><small>{percent(service.requests, dashboard.summary.requests)}% of requests</small></span><b>{compact.format(service.requests)}</b></div>)}</div></section>
        </div>
      </section>
      <aside className="right-rail">
        <section className="panel activity-panel"><PanelTitle icon={<Activity size={17} />} title="Recent usage" action="LATEST" /><div className="activity-list">{dashboard.recent.length ? dashboard.recent.map((item) => <div className="activity-item" key={item.id}><div className="activity-top"><span>{item.keyLabel}</span><time>{relativeTime(item.timestamp)}</time></div><div className="activity-main"><div><strong>{item.model}</strong><small>{compact.format(item.tokens)} tokens · {item.requests} req</small></div><b>{money.format(item.spend)}</b></div></div>) : <MiniEmpty text="No activity in this range." />}</div></section>
      </aside>
    </div>}
  </>;
}

function BudgetBanner({ budget }: { budget: NonNullable<Dashboard["budget"]> }) {
  const percentUsed = Math.min(100, Math.max(0, budget.percentUsed ?? 0));
  return <section className={`budget-banner ${budget.status}`} aria-label="Total credit limit">
    <div className="budget-mark"><WalletCards size={19} /></div>
    <div className="budget-copy">
      <p className="eyebrow">TOTAL CREDIT ALLOCATION</p>
      <div><strong>{budget.spentCents === null ? "Usage unavailable" : `${cents(budget.spentCents)} of ${cents(budget.limitCents)} used`}</strong><span>Across all assigned keys · all time</span></div>
    </div>
    <div className="budget-meter-wrap">
      <div className="budget-meter"><span style={{ width: `${percentUsed}%` }} /></div>
      <small>{budget.percentUsed === null ? "N/A" : `${Math.round(budget.percentUsed)}%`}</small>
    </div>
    <div className="budget-remaining">
      {budget.status === "exceeded" && <TriangleAlert size={15} />}
      <span>{budget.remainingCents === null ? "Could not load spend" : budget.status === "exceeded" ? `${cents(budget.spentCents! - budget.limitCents)} over limit` : `${cents(budget.remainingCents)} remaining`}</span>
      <small>Monitoring only. Requests are not blocked</small>
    </div>
  </section>;
}

function AdminKeys({ csrfToken, onChanged }: { csrfToken: string; onChanged: () => Promise<void> }) {
  const [keys, setKeys] = useState<TrackedKey[]>([]); const [loading, setLoading] = useState(true); const [syncing, setSyncing] = useState(false); const [error, setError] = useState(""); const [syncNotice, setSyncNotice] = useState(""); const [modal, setModal] = useState(false); const initialSyncAttempted = useRef(false);
  const load = useCallback(async () => { setLoading(true); setError(""); try { const data = await requestJson<{ keys: TrackedKey[] }>("/api/admin/keys"); setKeys(data.keys); return data.keys; } catch (reason) { setError(errorMessage(reason)); return null; } finally { setLoading(false); } }, []);
  const sync = useCallback(async () => {
    setSyncing(true); setError(""); setSyncNotice("");
    try {
      const result = await requestJson<{ projects: number; discovered: number; created: number; restored: number }>("/api/admin/keys/sync", { method: "POST" }, csrfToken);
      const changes = result.created + result.restored;
      setSyncNotice(result.discovered
        ? `${result.discovered} keys found across ${result.projects} project${result.projects === 1 ? "" : "s"}. ${changes ? `${changes} added to the watchlist.` : "Everything is already in sync."}`
        : `No project API keys were returned from ${result.projects} visible project${result.projects === 1 ? "" : "s"}.`);
      await load(); await onChanged();
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setSyncing(false); }
  }, [csrfToken, load, onChanged]);
  useEffect(() => { if (initialSyncAttempted.current) return; initialSyncAttempted.current = true; void (async () => { const current = await load(); if (current?.length === 0) await sync(); })(); }, [load, sync]);
  async function create(values: Record<string, FormDataEntryValue>) { await requestJson("/api/admin/keys", { method: "POST", body: JSON.stringify(values) }, csrfToken); setModal(false); await load(); await onChanged(); }
  async function toggle(key: TrackedKey) { try { await requestJson("/api/admin/keys", { method: "PATCH", body: JSON.stringify({ id: key.id, status: key.status === "active" ? "archived" : "active" }) }, csrfToken); await load(); await onChanged(); } catch (reason) { setError(errorMessage(reason)); } }
  return <ManagementPage eyebrow="ROOT / TRACKED KEYS" title="Tracked keys" description="Synced from OpenAI using the server Admin key. ARGUS stores identifiers and names only, never sk-… secrets." action={<div className="management-actions"><button className="button secondary" onClick={() => setModal(true)}><Plus size={17} /> Add manually</button><button className="button primary" disabled={syncing} onClick={() => void sync()}>{syncing ? <LoaderCircle className="spin" size={17} /> : <RefreshCcw size={17} />} {syncing ? "Syncing…" : "Sync from OpenAI"}</button></div>}>
    {error && <InlineError text={error} />}
    {syncNotice && <div className="notice success"><Check size={15} />{syncNotice}</div>}
    <section className="management-grid">{loading || syncing && !keys.length ? <CardSkeleton count={4} /> : keys.length ? keys.map((key, index) => <article className="entity-card key-card" key={key.id}><div className="entity-card-top"><span className="key-sigil large" style={{ "--sigil": modelColors[index % modelColors.length] } as React.CSSProperties}>{key.label.slice(0, 1).toUpperCase()}</span><Status status={key.status ?? "active"} /></div><h3>{key.label}</h3><CopyValue value={key.keyId} /><dl><div><dt>Project</dt><dd>{key.projectId || "All projects"}</dd></div><div><dt>Assigned to</dt><dd>{key.assignedNames?.join(", ") || "No accounts"}</dd></div></dl><div className="entity-actions"><span>{key.assignmentCount ?? 0} assignments</span><button className="button ghost small" onClick={() => toggle(key)}>{key.status === "active" ? "Archive" : "Restore"}</button></div></article>) : <EmptyCard icon={<KeyRound />} title="No project keys found" text="Sync again, or add a key ID manually if it belongs to a different organization." />}</section>
    {modal && <FormModal title="Add a tracked key" submitLabel="Add to ARGUS" onClose={() => setModal(false)} onSubmit={create}><label>Display label<input name="label" placeholder="Violet production" required minLength={2} /></label><label>OpenAI API Key ID<input name="keyId" placeholder="key_abc123…" required pattern="key_[A-Za-z0-9_-]{4,200}" /></label><label>Project ID <span>(optional)</span><input name="projectId" placeholder="proj_…" /></label><p className="modal-note"><ShieldCheck size={15} /> Enter only the <strong>key_… identifier</strong>, never an sk-… secret.</p></FormModal>}
  </ManagementPage>;
}

function AdminAccounts({ csrfToken, onChanged }: { csrfToken: string; onChanged: () => void }) {
  const [accounts, setAccounts] = useState<Account[]>([]); const [keys, setKeys] = useState<TrackedKey[]>([]); const [assignments, setAssignments] = useState<Assignment[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [createOpen, setCreateOpen] = useState(false); const [manage, setManage] = useState<Account | null>(null);
  const [createRole, setCreateRole] = useState<"user" | "root">("user"); const [createKeyIds, setCreateKeyIds] = useState<string[]>([]); const [pendingAssignments, setPendingAssignments] = useState<string[]>([]);
  const [createBudgetEnabled, setCreateBudgetEnabled] = useState(false); const [createBudgetDollars, setCreateBudgetDollars] = useState("50");
  const [editAccount, setEditAccount] = useState<Account | null>(null); const [editBudgetEnabled, setEditBudgetEnabled] = useState(false); const [editBudgetDollars, setEditBudgetDollars] = useState("");
  const [menuAccountId, setMenuAccountId] = useState<string | null>(null); const [deleteAccount, setDeleteAccount] = useState<Account | null>(null); const [deleting, setDeleting] = useState(false);
  const [budgetLoading, setBudgetLoading] = useState(false);
  const loadBudgets = useCallback(async () => {
    setBudgetLoading(true);
    try {
      const data = await requestJson<{ trackingStart: number; accounts: Array<{ id: string; spentCents: number }> }>("/api/admin/accounts/budgets");
      setAccounts((current) => current.map((account) => {
        const usage = data.accounts.find((item) => item.id === account.id);
        return usage ? { ...account, budgetSpentCents: usage.spentCents } : account;
      }));
    } catch { /* Account management remains available when OpenAI costs are temporarily unavailable. */ }
    finally { setBudgetLoading(false); }
  }, []);
  const load = useCallback(async () => { setLoading(true); setError(""); try { const [a, k, x] = await Promise.all([requestJson<{ accounts: Account[] }>("/api/admin/accounts"), requestJson<{ keys: TrackedKey[] }>("/api/admin/keys"), requestJson<{ assignments: Assignment[] }>("/api/admin/assignments")]); setAccounts(a.accounts); setKeys(k.keys); setAssignments(x.assignments); void loadBudgets(); } catch (reason) { setError(errorMessage(reason)); } finally { setLoading(false); } }, [loadBudgets]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  function openCreate() { setCreateRole("user"); setCreateKeyIds([]); setCreateBudgetEnabled(false); setCreateBudgetDollars("50"); setCreateOpen(true); }
  function openEdit(account: Account) { setEditBudgetEnabled(account.budgetLimitCents !== null); setEditBudgetDollars(account.budgetLimitCents ? (account.budgetLimitCents / 100).toFixed(2) : "50"); setEditAccount(account); }
  async function create(values: Record<string, FormDataEntryValue>) {
    const accountValues = { ...values };
    delete accountValues.creditLimitUsd;
    await requestJson("/api/admin/accounts", { method: "POST", body: JSON.stringify({
      ...accountValues, apiKeyIds: createRole === "user" ? createKeyIds : [],
      creditLimitCents: createRole === "user" && createBudgetEnabled ? dollarsToCents(createBudgetDollars) : null,
    }) }, csrfToken);
    setCreateOpen(false); await load(); onChanged();
  }
  async function update(values: Record<string, FormDataEntryValue>) {
    if (!editAccount) return;
    const password = String(values.password ?? "").trim();
    const changes: Record<string, unknown> = {
      displayName: String(values.displayName), email: String(values.email), status: String(values.status),
      creditLimitCents: editBudgetEnabled ? dollarsToCents(editBudgetDollars) : null,
    };
    if (password) changes.password = password;
    await requestJson("/api/admin/accounts", { method: "PATCH", body: JSON.stringify({ id: editAccount.id, changes }) }, csrfToken);
    setEditAccount(null); await load(); onChanged();
  }
  async function toggle(account: Account) { try { await requestJson("/api/admin/accounts", { method: "PATCH", body: JSON.stringify({ id: account.id, changes: { status: account.status === "active" ? "disabled" : "active" } }) }, csrfToken); await load(); onChanged(); } catch (reason) { setError(errorMessage(reason)); } }
  async function assign(keyId: string, assigned: boolean) {
    if (!manage || pendingAssignments.includes(keyId)) return;
    const accountId = manage.id;
    setPendingAssignments((current) => [...current, keyId]);
    setAssignments((current) => assigned
      ? [...current.filter((item) => !(item.accountId === accountId && item.apiKeyId === keyId)), { accountId, apiKeyId: keyId, assignedAt: Math.floor(Date.now() / 1000) }]
      : current.filter((item) => !(item.accountId === accountId && item.apiKeyId === keyId)));
    setAccounts((current) => current.map((account) => account.id === accountId
      ? { ...account, keyCount: Math.max(0, (account.keyCount ?? 0) + (assigned ? 1 : -1)) }
      : account));
    try {
      await requestJson("/api/admin/assignments", { method: "POST", body: JSON.stringify({ accountId, apiKeyId: keyId, assigned }) }, csrfToken);
      await load(); onChanged();
    } catch (reason) {
      setAssignments((current) => assigned
        ? current.filter((item) => !(item.accountId === accountId && item.apiKeyId === keyId))
        : [...current, { accountId, apiKeyId: keyId, assignedAt: Math.floor(Date.now() / 1000) }]);
      setAccounts((current) => current.map((account) => account.id === accountId
        ? { ...account, keyCount: Math.max(0, (account.keyCount ?? 0) + (assigned ? -1 : 1)) }
        : account));
      setError(errorMessage(reason));
    } finally {
      setPendingAssignments((current) => current.filter((id) => id !== keyId));
    }
  }
  async function removeAccount() {
    if (!deleteAccount) return;
    setDeleting(true); setError("");
    try {
      await requestJson("/api/admin/accounts", { method: "DELETE", body: JSON.stringify({ id: deleteAccount.id }) }, csrfToken);
      setDeleteAccount(null); await load(); onChanged();
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setDeleting(false); }
  }
  const activeKeys = keys.filter((key) => key.status === "active");
  return <ManagementPage eyebrow="ROOT / ACCESS CONTROL" title="Accounts" description="Create people, assign keys, and manage total credit allocations from one control plane." action={<button className="button primary" onClick={openCreate}><Plus size={17} /> Create account</button>}>
    {error && <InlineError text={error} />}
    <section className="table-panel"><div className="table-toolbar"><div className="search-shell"><Search size={16} /><span>Account directory</span></div><span>{budgetLoading && <LoaderCircle className="spin" size={12} />} {accounts.length} total</span></div><div className="responsive-table"><table className="accounts-table"><thead><tr><th>Account</th><th>Role</th><th>Keys</th><th>Total limit</th><th>Last sign-in</th><th>Status</th><th aria-label="Actions" /></tr></thead><tbody>{loading ? <TableSkeleton columns={7} /> : accounts.map((account) => <tr key={account.id}><td><div className="person-cell"><span>{initials(account.displayName)}</span><div><strong>{account.displayName}</strong><small>{account.email}</small></div></div></td><td><span className={account.role === "root" ? "role root" : "role"}>{account.role}</span></td><td>{account.role === "root" ? "All" : <span>{account.keyCount}{account.sharedKeyCount ? <small className="shared-count">{account.sharedKeyCount} shared</small> : null}</span>}</td><td>{account.role === "root" ? <span className="budget-none">Global view</span> : <AccountBudget account={account} loading={budgetLoading} />}</td><td>{account.lastLoginAt ? dateTime.format(account.lastLoginAt * 1000) : "Never"}</td><td><Status status={account.status} /></td><td><div className="row-actions">{account.role !== "root" && <><button className="button ghost small" onClick={() => setManage(account)}>Assign keys</button><div className="account-menu-wrap" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setMenuAccountId(null); }}><button className="icon-button small" aria-label={`Actions for ${account.displayName}`} aria-expanded={menuAccountId === account.id} onClick={() => setMenuAccountId((current) => current === account.id ? null : account.id)}><MoreHorizontal size={17} /></button>{menuAccountId === account.id && <div className="account-menu" role="menu"><button role="menuitem" onClick={() => { setMenuAccountId(null); openEdit(account); }}><Pencil size={14} /> Edit account</button><button role="menuitem" onClick={() => { setMenuAccountId(null); void toggle(account); }}>{account.status === "active" ? "Disable access" : "Enable access"}</button><button className="danger" role="menuitem" onClick={() => { setMenuAccountId(null); setDeleteAccount(account); }}><Trash2 size={14} /> Delete user</button></div>}</div></>}</div></td></tr>)}</tbody></table></div><div className="budget-table-note"><WalletCards size={14} /><span>Total limits never reset. Shared-key spend counts toward each account that can see that key.</span></div></section>
    {createOpen && <FormModal title="Create an account" submitLabel="Create account" onClose={() => setCreateOpen(false)} onSubmit={create}><label>Display name<input name="displayName" required minLength={2} placeholder="Nishant Verma" /></label><label>Email address<input name="email" type="email" required placeholder="nishant@example.com" /></label><label>Temporary password<input name="password" type="password" minLength={12} required placeholder="12+ characters" /></label><label>Role<select name="role" value={createRole} onChange={(event) => setCreateRole(event.target.value as "user" | "root")}><option value="user">User (assigned keys only)</option><option value="root">Root (every tracked key)</option></select></label>{createRole === "user" && <><BudgetFields enabled={createBudgetEnabled} dollars={createBudgetDollars} onEnabled={setCreateBudgetEnabled} onDollars={setCreateBudgetDollars} /><fieldset className="key-picker"><legend>Assign keys now <span>(optional)</span></legend><p>Select every key this person should be able to track.</p><div className="assignment-list compact">{activeKeys.map((key) => { const checked = createKeyIds.includes(key.id); return <label key={key.id}><input type="checkbox" checked={checked} onChange={(event) => setCreateKeyIds((current) => event.target.checked ? [...current, key.id] : current.filter((id) => id !== key.id))} /><span className="fake-check">{checked && <Check size={13} />}</span><span><strong>{key.label}</strong><small>{maskKey(key.keyId)}</small></span></label>; })}</div>{!activeKeys.length && <MiniEmpty text="Add a tracked key first." />}</fieldset></>}<p className="modal-note"><LockKeyhole size={15} /> Ask the user to change this temporary password after sign-in.</p></FormModal>}
    {editAccount && <FormModal title={`Edit ${editAccount.displayName}`} submitLabel="Save changes" onClose={() => setEditAccount(null)} onSubmit={update}><label>Display name<input name="displayName" required minLength={2} defaultValue={editAccount.displayName} /></label><label>Email address<input name="email" type="email" required defaultValue={editAccount.email} /></label><label>Access status<select name="status" defaultValue={editAccount.status}><option value="active">Active</option><option value="disabled">Disabled</option></select></label><label>New password <span>(leave blank to keep current)</span><input name="password" type="password" minLength={12} placeholder="No password change" /></label><BudgetFields enabled={editBudgetEnabled} dollars={editBudgetDollars} onEnabled={setEditBudgetEnabled} onDollars={setEditBudgetDollars} /></FormModal>}
    {manage && <Modal title={`Assign keys to ${manage.displayName}`} onClose={() => setManage(null)}><p className="modal-subtitle">Changes take effect immediately. Total usage is recalculated across every checked key.</p><div className="assignment-list">{activeKeys.map((key) => { const checked = assignments.some((item) => item.accountId === manage.id && item.apiKeyId === key.id); const pending = pendingAssignments.includes(key.id); const shared = assignments.filter((item) => item.apiKeyId === key.id && item.accountId !== manage.id).length; return <label className={pending ? "pending" : ""} key={key.id}><input type="checkbox" checked={checked} disabled={pending} onChange={(event) => void assign(key.id, event.target.checked)} /><span className="fake-check">{pending ? <LoaderCircle className="spin" size={12} /> : checked && <Check size={13} />}</span><span><strong>{key.label}{shared ? <em>{shared} other {shared === 1 ? "account" : "accounts"}</em> : null}</strong><small>{maskKey(key.keyId)}</small></span></label>; })}</div>{!activeKeys.length && <MiniEmpty text="Add a tracked key first." />}<p className="modal-note"><TriangleAlert size={15} /> A shared key’s full spend is counted for every account it is assigned to.</p></Modal>}
    {deleteAccount && <Modal title="Delete user" onClose={() => { if (!deleting) setDeleteAccount(null); }}><div className="confirm-delete"><span className="danger-icon"><Trash2 size={20} /></span><p>Delete <strong>{deleteAccount.displayName}</strong>?</p><small>{deleteAccount.email}</small><p className="modal-subtitle">They will immediately lose access and all key assignments. Their account details will be anonymized while security audit history is retained.</p></div><div className="modal-actions"><button className="button secondary" disabled={deleting} onClick={() => setDeleteAccount(null)}>Cancel</button><button className="button danger" disabled={deleting} onClick={() => void removeAccount()}>{deleting && <LoaderCircle className="spin" size={16} />} Delete user</button></div></Modal>}
  </ManagementPage>;
}

function BudgetFields({ enabled, dollars, onEnabled, onDollars }: { enabled: boolean; dollars: string; onEnabled: (enabled: boolean) => void; onDollars: (dollars: string) => void }) {
  return <fieldset className={enabled ? "budget-fields enabled" : "budget-fields"}>
    <legend>Total credit allocation</legend>
    <label className="budget-toggle"><input aria-label="Set a total credit limit" type="checkbox" checked={enabled} onChange={(event) => onEnabled(event.target.checked)} /><span className="toggle-track"><span /></span><span><strong>Set a total limit</strong><small>One lifetime allocation. No recurring reset</small></span></label>
    {enabled && <label>Total limit (USD)<div className="currency-input"><span>$</span><input name="creditLimitUsd" inputMode="decimal" type="number" min="1" max="1000000" step="0.01" required value={dollars} onChange={(event) => onDollars(event.target.value)} /></div></label>}
    <p><TriangleAlert size={13} /> ARGUS reports approaching or exceeded limits. It does not interrupt OpenAI requests.</p>
  </fieldset>;
}

function ChangePasswordModal({ csrfToken, onClose, onChanged }: { csrfToken: string; onClose: () => void; onChanged: () => void }) {
  const [visible, setVisible] = useState(false);
  async function changePassword(values: Record<string, FormDataEntryValue>) {
    const currentPassword = String(values.currentPassword ?? "");
    const newPassword = String(values.newPassword ?? "");
    const confirmPassword = String(values.confirmPassword ?? "");
    if (newPassword !== confirmPassword) throw new Error("New password confirmation does not match.");
    await requestJson("/api/auth/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword, confirmPassword }) }, csrfToken);
    onChanged();
  }
  return <FormModal title="Change your password" submitLabel="Change password" onClose={onClose} onSubmit={changePassword}>
    <p className="modal-subtitle">Enter your current password, then choose a new one. You’ll sign in again when the change is complete.</p>
    <label>Current password<input name="currentPassword" type={visible ? "text" : "password"} autoComplete="current-password" required /></label>
    <label>New password<input name="newPassword" type={visible ? "text" : "password"} autoComplete="new-password" minLength={12} required placeholder="12+ characters" /></label>
    <label>Confirm new password<input name="confirmPassword" type={visible ? "text" : "password"} autoComplete="new-password" minLength={12} required /></label>
    <button type="button" className="show-passwords" role="switch" aria-checked={visible} onClick={() => setVisible((current) => !current)}><span className="toggle-track" aria-hidden="true"><span /></span><span>Show passwords</span></button>
    <p className="modal-note"><ShieldCheck size={15} /> Use at least 12 characters with uppercase, lowercase, and a number. All active sessions will be signed out.</p>
  </FormModal>;
}

function AccountBudget({ account, loading }: { account: Account; loading: boolean }) {
  if (account.budgetLimitCents === null || account.budgetLimitCents === undefined) return <span className="budget-none">No limit</span>;
  if (loading && account.budgetSpentCents === null) return <div className="account-budget loading"><span className="skeleton-line" /><div className="mini-budget-meter" /></div>;
  const spent = account.budgetSpentCents;
  const percentUsed = spent === null || spent === undefined ? null : (spent / account.budgetLimitCents) * 100;
  const state = percentUsed === null ? "unavailable" : percentUsed >= 100 ? "exceeded" : percentUsed >= 80 ? "warning" : "healthy";
  return <div className={`account-budget ${state}`}><div><strong>{spent === null || spent === undefined ? "N/A" : cents(spent)}</strong><span>/ {cents(account.budgetLimitCents)}</span></div><div className="mini-budget-meter"><span style={{ width: `${Math.min(100, Math.max(0, percentUsed ?? 0))}%` }} /></div></div>;
}

function AuditTrail() {
  const [events, setEvents] = useState<AuditEvent[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); try { setEvents((await requestJson<{ events: AuditEvent[] }>("/api/admin/audit")).events); } catch (reason) { setError(errorMessage(reason)); } finally { setLoading(false); } }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  return <ManagementPage eyebrow="ROOT / SECURITY" title="Audit trail" description="A durable record of sign-ins, account changes, key registration, and assignments." action={<button className="button secondary" onClick={load}><RefreshCcw className={loading ? "spin" : ""} size={16} /> Refresh</button>}>
    {error && <InlineError text={error} />}
    <section className="audit-panel">{loading ? <CardSkeleton count={5} /> : events.length ? <div className="audit-list">{events.map((event) => <article key={event.id}><span className="audit-icon"><AuditGlyph action={event.action} /></span><div><div><strong>{humanAction(event.action)}</strong><time>{dateTime.format(event.createdAt * 1000)}</time></div><p><b>{event.actorName}</b> · {event.targetType}{event.targetId ? ` · ${shortId(event.targetId)}` : ""}</p></div></article>)}</div> : <EmptyCard icon={<FileClock />} title="No audit events yet" text="Security-relevant activity will appear here." />}</section>
  </ManagementPage>;
}

function MemberKeys({ keys, loading }: { keys: Dashboard["keys"]; loading: boolean }) {
  return <ManagementPage eyebrow="ACCESS / MY KEYS" title="Your tracked keys" description="Only keys assigned to your account appear here.">{loading ? <CardSkeleton count={3} /> : <section className="management-grid">{keys.map((key, index) => <article className="entity-card key-card" key={key.id}><div className="entity-card-top"><span className="key-sigil large" style={{ "--sigil": modelColors[index % modelColors.length] } as React.CSSProperties}>{key.label.slice(0, 1)}</span><Status status={key.lastActiveAt ? "active" : "idle"} /></div><h3>{key.label}</h3><CopyValue value={key.keyId} /><dl><div><dt>Spend</dt><dd>{money.format(key.spend)}</dd></div><div><dt>Tokens</dt><dd>{compact.format(key.tokens)}</dd></div><div><dt>Requests</dt><dd>{compact.format(key.requests)}</dd></div></dl></article>)}{!keys.length && <EmptyCard icon={<KeyRound />} title="No assigned keys" text="Ask a root user to assign a tracked key to your account." />}</section>}</ManagementPage>;
}

function ManagementPage({ eyebrow, title, description, action, children }: { eyebrow: string; title: string; description: string; action?: ReactNode; children: ReactNode }) { return <><div className="page-heading management-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</div>{children}</>; }

function FormModal({ title, submitLabel, onClose, onSubmit, children }: { title: string; submitLabel: string; onClose: () => void; onSubmit: (values: Record<string, FormDataEntryValue>) => Promise<void>; children: ReactNode }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(""); try { await onSubmit(Object.fromEntries(new FormData(event.currentTarget))); } catch (reason) { setError(errorMessage(reason)); setBusy(false); } }
  return <Modal title={title} onClose={onClose}><form className="modal-form" onSubmit={submit}>{children}{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy && <LoaderCircle className="spin" size={16} />}{submitLabel}</button></div></form></Modal>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => { const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", escape); return () => window.removeEventListener("keydown", escape); }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><header><div><p className="eyebrow">ARGUS CONTROL</p><h2>{title}</h2></div><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={19} /></button></header>{children}</section></div>;
}

function MetricCard({ icon, label, value, delta, sub }: { icon: ReactNode; label: string; value: string; delta?: number; sub?: string }) { return <article className="metric-card"><div className="metric-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong><small className={delta !== undefined ? (delta <= 0 ? "good" : "warn") : ""}>{delta !== undefined ? <>{delta <= 0 ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}{Math.abs(delta).toFixed(1)}%</> : sub}</small></div></article>; }
function PanelTitle({ icon, title, action }: { icon: ReactNode; title: string; action?: ReactNode }) { return <header className="panel-title"><span>{icon}{title}</span>{typeof action === "string" ? <small>{action}</small> : action}</header>; }
function Legend({ color, label, value }: { color: string; label: string; value: string }) { return <div><span className="legend-dot" style={{ background: color }} /><span>{label}</span><b>{value}</b></div>; }
function Status({ status }: { status: string }) { return <span className={`status ${status}`}><span />{status}</span>; }
function CopyValue({ value }: { value: string }) { const [copied, setCopied] = useState(false); return <button className="copy-value" onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }}><code>{maskKey(value)}</code>{copied ? <Check size={15} /> : <Copy size={15} />}</button>; }
function EmptyCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) { return <article className="empty-card"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{text}</p></article>; }
function MiniEmpty({ text }: { text: string }) { return <div className="mini-empty"><Activity size={20} /><span>{text}</span></div>; }
function InlineError({ text }: { text: string }) { return <div className="notice error"><Activity size={15} />{text}</div>; }
function DashboardSkeleton() { return <div className="dashboard-skeleton"><div /><div /><div /><div /><div /></div>; }
function CardSkeleton({ count }: { count: number }) { return <>{Array.from({ length: count }, (_, index) => <div className="skeleton-card" key={index} />)}</>; }
function TableSkeleton({ columns }: { columns: number }) { return <>{Array.from({ length: 4 }, (_, row) => <tr key={row}>{Array.from({ length: columns }, (_, col) => <td key={col}><span className="skeleton-line" /></td>)}</tr>)}</>; }
function EmptyOverview() { return <section className="empty-overview"><div className="empty-icon"><KeyRound /></div><p className="eyebrow">NO KEYS IN VIEW</p><h2>The watchlist is empty.</h2><p>Add a tracked API Key ID, or ask a root user to assign one to your account.</p></section>; }
function ServiceGlyph({ name }: { name: string }) { return name.includes("Completion") ? <Zap size={16} /> : name.includes("Embedding") ? <Layers3 size={16} /> : name.includes("search") ? <Search size={16} /> : <Sparkles size={16} />; }
function AuditGlyph({ action }: { action: string }) { return action.includes("login") ? <ShieldCheck size={16} /> : action.includes("credit") || action.includes("budget") ? <WalletCards size={16} /> : action.includes("key") ? <KeyRound size={16} /> : <Users size={16} />; }
function SpendTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) { if (!active || !payload?.length) return null; return <div className="chart-tooltip"><small>{label}</small><strong>{money.format(payload[0].value)}</strong></div>; }
function ModelTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Dashboard["models"][number] }> }) { if (!active || !payload?.length) return null; const model = payload[0].payload; return <div className="chart-tooltip"><small>{model.name}</small><strong>{compact.format(model.totalTokens)} tokens</strong><span>{compact.format(model.requests)} requests</span></div>; }
function dayPeriod() { const hour = new Date().getHours(); return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"; }
function initials(value: string) { return value.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function maskKey(value: string) { return value.length <= 12 ? value : `${value.slice(0, 8)}••••${value.slice(-4)}`; }
function shortId(value: string) { return value.length < 18 ? value : `${value.slice(0, 9)}…${value.slice(-4)}`; }
function percent(value: number, total: number) { return total ? Math.round((value / total) * 100) : 0; }
function cents(value: number) { return money.format(value / 100); }
function dollarsToCents(value: string) { const amount = Number(value); if (!Number.isFinite(amount) || amount < 1 || amount > 1_000_000) throw new Error("Enter a total limit between $1 and $1,000,000."); return Math.round(amount * 100); }
function relativeTime(timestamp: number) { const seconds = Math.max(0, Math.floor(Date.now() / 1000) - timestamp); if (seconds < 60) return "just now"; if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`; if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`; return `${Math.floor(seconds / 86_400)}d ago`; }
function humanAction(action: string) { return action.replaceAll(".", " ").replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase()); }
function errorMessage(reason: unknown) { return reason instanceof Error ? reason.message : "Request failed."; }
