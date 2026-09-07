"use client";

import "./live.css";
import { useEffect, useRef, useState } from "react";
import { AuthenticationRequiredError, arrayValue, boolValue, fetchDashboardSnapshot, fetchExportRecipients, logout, metricValue, numberValue, objectValue, qualityValue, requestTradeExport, textValue, type DashboardQuery, type DashboardSection, type DashboardSnapshot, type JsonRecord, type MetricValue, type Quality } from "./live-data";

const TZ = "Asia/Jerusalem";
const SHOW_CONTROL_CARD = false; // "שליטה במכונה" hidden for now — flip to true to restore
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const num = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 4 });
const dateTime = (value: unknown) => { const stamp = Date.parse(textValue(value)); return Number.isFinite(stamp) ? new Date(stamp).toLocaleString("he-IL", { timeZone: TZ, hour12: false }) : "—"; };
const secondsLabel = (value: unknown) => { const seconds = numberValue(value); if (seconds === null) return "לא זמין"; if (seconds < 60) return `${Math.round(seconds)} שנ׳`; if (seconds < 3600) return `${Math.floor(seconds / 60)} דק׳`; return `${Math.floor(seconds / 3600)} שע׳`; };
const bytes = (value: unknown) => { let raw = numberValue(value); if (raw === null) return "לא זמין"; const units = ["B", "KB", "MB", "GB", "TB"]; let i = 0; while (raw >= 1024 && i < units.length - 1) { raw /= 1024; i++; } return `${raw.toFixed(i > 1 ? 2 : 0)} ${units[i]}`; };
const money = (value: unknown) => numberValue(value) === null ? "—" : usd.format(numberValue(value)!);
const priceOf = (notional: unknown, size: unknown): number | null => { const n = numberValue(notional), s = numberValue(size); return n === null || s === null || s === 0 ? null : n / s; };
const avgPrice = (notional: unknown, size: unknown) => { const price = priceOf(notional, size); return price === null ? "—" : num.format(price); };
const ms = (value: unknown) => { const n = numberValue(value); return n === null ? "—" : n < 1000 ? `${Math.round(n)}ms` : `${(n / 1000).toFixed(1)}s`; };
// Single "סטטוס" cell for the trade-history table. Leads with the technical
// behaviour (the "why"); the cash-flow column already carries the money outcome.
const STATUS_LABEL: Record<string, string> = { HEALTHY: "תקין", DETECTION_DELAY: "איחור זיהוי", EXECUTION_DELAY: "איחור ביצוע", MARKET: "קפיצת שוק", LIQUIDITY: "נזילות", BOOK_FILL_MISMATCH: "פער ספר/מילוי", MIXED: "משולב", UNKNOWN: "לא ידוע" };
// red = a robot/code problem to fix; green = fine; plain = market reality.
const STATUS_TONE: Record<string, string> = { DETECTION_DELAY: "negative", EXECUTION_DELAY: "negative", BOOK_FILL_MISMATCH: "negative", HEALTHY: "positive" };
const exitStatus = (row: JsonRecord) => {
  const root = textValue(row.exit_root_cause);
  if (!root) return "—";
  const tech = textValue(row.exit_technical_behavior);
  const outcome = textValue(row.exit_analysis_outcome);
  const reconstructed = textValue(row.exit_evidence_quality).startsWith("RECONSTRUCTED");
  let label: string;
  let tone = "";
  if (tech === "SETTLEMENT_WAIT") { label = "המתנה לסליקה"; tone = "positive"; }
  else if (outcome === "NO_EXECUTION") { label = "לא בוצע"; tone = "negative"; }
  else if (tech === "MIXED") { label = "משולב"; tone = STATUS_TONE[textValue(row.exit_primary_cause)] ?? ""; }
  else { label = STATUS_LABEL[root] ?? root; tone = STATUS_TONE[root] ?? ""; }
  const bidDrop = numberValue(row.stop_trigger_bid) !== null && numberValue(row.stop_submit_bid) !== null
    ? ` · bid ${num.format(numberValue(row.stop_trigger_bid)!)}→${num.format(numberValue(row.stop_submit_bid)!)}` : "";
  const vwapPair = numberValue(row.stop_expected_vwap) !== null && numberValue(row.stop_actual_vwap) !== null
    ? ` · VWAP צפוי ${num.format(numberValue(row.stop_expected_vwap)!)} בפועל ${num.format(numberValue(row.stop_actual_vwap)!)}` : "";
  return <span className={tone} title={`${root}${row.exit_execution_ms != null ? ` · latch→submit ${ms(row.exit_execution_ms)}` : ""}${bidDrop}${vwapPair}${reconstructed ? " · שוחזר היסטורית" : ""}`}>{label}{reconstructed ? " ~" : ""}</span>;
};

// Compact entry-liquidity ("exit-ability at entry") cell. Measurement only —
// the number is the simulated worst fill price to unload the position now, plus
// how much of the position the visible book could actually absorb.
const entryLiquidityCell = (row: JsonRecord) => {
  const vwap = numberValue(row.entry_sim_exit_vwap);
  const worst = numberValue(row.entry_sim_exit_worst_price);
  const size = numberValue(row.entry_sim_exit_shares);
  const fillable = numberValue(row.entry_sim_exit_fillable_1x);
  if (vwap === null && worst === null && fillable === null) return "—";
  const deep = boolValue(row.entry_liquidity_deep_capture);
  const partial = size !== null && fillable !== null && fillable + 1e-9 < size;
  const tone = deep || partial || (worst !== null && worst < 0.6) ? "negative" : "";
  const sync = boolValue(row.entry_liquidity_synchronous);
  const head = worst !== null ? num.format(worst) : vwap !== null ? num.format(vwap) : "—";
  const ratio = size !== null && fillable !== null ? ` · ${num.format(fillable)}/${num.format(size)}` : "";
  const title = [
    `VWAP יציאה מדומה ${vwap !== null ? num.format(vwap) : "—"}`,
    `מחיר גרוע ${worst !== null ? num.format(worst) : "—"}`,
    row.entry_sim_exit_slippage != null ? `slippage ${num.format(numberValue(row.entry_sim_exit_slippage)!)}` : "",
    `עומק ≥0.66/≥0.60/≥0.55 ${num.format(numberValue(row.entry_depth_066) ?? 0)}/${num.format(numberValue(row.entry_depth_060) ?? 0)}/${num.format(numberValue(row.entry_depth_055) ?? 0)}`,
    row.entry_sim_exit_fillable_3x != null ? `למימוש 3x ${num.format(numberValue(row.entry_sim_exit_fillable_3x)!)} · 5x ${num.format(numberValue(row.entry_sim_exit_fillable_5x) ?? 0)}` : "",
    row.entry_book_age_ms != null ? `גיל ספר ${ms(row.entry_book_age_ms)}` : "",
    `פאזה ${textValue(row.entry_liquidity_phase) || "—"}${sync ? "" : " (ספר לא סנכרוני)"}`,
  ].filter(Boolean).join(" · ");
  return <span className={tone} title={title}>{head}{ratio}{sync ? "" : " ~"}</span>;
};

type DealFilters = { token: string; buyUsdMin: string; buyUsdMax: string; buyPriceMin: string; buyPriceMax: string; sellUsdMin: string; sellUsdMax: string; sellPriceMin: string; sellPriceMax: string; cashFlowSign: "" | "positive" | "negative"; cashFlowMin: string; cashFlowMax: string };
const EMPTY_FILTERS: DealFilters = { token: "", buyUsdMin: "", buyUsdMax: "", buyPriceMin: "", buyPriceMax: "", sellUsdMin: "", sellUsdMax: "", sellPriceMin: "", sellPriceMax: "", cashFlowSign: "", cashFlowMin: "", cashFlowMax: "" };
const activeFilterCount = (filters: DealFilters) => Object.values(filters).filter(Boolean).length;
const parseNum = (raw: string): number | null => { const n = Number(raw.trim()); return raw.trim() !== "" && Number.isFinite(n) ? n : null; };
const inRange = (value: number | null, fromRaw: string, toRaw: string): boolean => {
  const a = parseNum(fromRaw), b = parseNum(toRaw);
  if (a === null && b === null) return true;             // no constraint
  if (value === null) return false;                       // constrained but this row has no such value
  const lo = a !== null && b !== null ? Math.min(a, b) : a; // tolerate an inverted "from/to"
  const hi = a !== null && b !== null ? Math.max(a, b) : b;
  if (lo !== null && value < lo) return false;
  if (hi !== null && value > hi) return false;
  return true;
};
const dealMatchesFilters = (row: JsonRecord, filters: DealFilters): boolean => {
  if (filters.token && !textValue(row.outcomes).split(",").map(v => v.trim()).includes(filters.token)) return false;
  if (!inRange(numberValue(row.buy_notional_usd), filters.buyUsdMin, filters.buyUsdMax)) return false;
  if (!inRange(priceOf(row.buy_notional_usd, row.buy_size), filters.buyPriceMin, filters.buyPriceMax)) return false;
  if (!inRange(numberValue(row.sell_notional_usd), filters.sellUsdMin, filters.sellUsdMax)) return false;
  if (!inRange(priceOf(row.sell_notional_usd, row.sell_size), filters.sellPriceMin, filters.sellPriceMax)) return false;
  if (!inRange(numberValue(row.cash_flow_usd), filters.cashFlowMin, filters.cashFlowMax)) return false;
  const cashFlow = numberValue(row.cash_flow_usd);
  if (filters.cashFlowSign === "positive" && !(cashFlow !== null && cashFlow > 0)) return false;
  if (filters.cashFlowSign === "negative" && !(cashFlow !== null && cashFlow < 0)) return false;
  return true;
};
const FilterIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 5h16l-6 8v6l-4-2v-4z"/></svg>;

function RangeField({ label, hint, step, min, max, from, to, onFrom, onTo }: { label: string; hint?: string; step?: string; min?: number; max?: number; from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void }) {
  return <div className="filter-field range">
    <label>{label}{hint && <span className="hint"> {hint}</span>}</label>
    <div className="range-inputs">
      <span><small>מ־</small><input type="number" inputMode="decimal" step={step} min={min} max={max} value={from} onChange={event => onFrom(event.target.value)}/></span>
      <span><small>עד</small><input type="number" inputMode="decimal" step={step} min={min} max={max} value={to} onChange={event => onTo(event.target.value)}/></span>
    </div>
  </div>;
}
const displayMetric = (metric: MetricValue) => metric.value === null ? "—" : metric.unit === "USD" ? money(metric.value) : textValue(metric.value);
const countdown = (endsAt: unknown, now: number) => { const end = Date.parse(textValue(endsAt)); if (!Number.isFinite(end)) return "—"; const seconds = Math.max(0, Math.ceil((end - now) / 1000)); return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; };
const relTime = (value: unknown, now: number) => { const t = Date.parse(textValue(value)); if (!Number.isFinite(t)) return "—"; const s = Math.max(0, Math.round((now - t) / 1000)); if (s < 10) return "עכשיו"; if (s < 60) return `לפני ${s} שנ׳`; if (s < 3600) return `לפני ${Math.floor(s / 60)} דק׳`; if (s < 86400) return `לפני ${Math.floor(s / 3600)} שע׳`; return new Date(t).toLocaleDateString("he-IL", { timeZone: TZ }); };
const clock = (value: unknown) => { const t = Date.parse(textValue(value)); return Number.isFinite(t) ? new Date(t).toLocaleTimeString("he-IL", { timeZone: TZ, hour12: false }) : "—"; };
const logSeverity = (raw: unknown): "error" | "warning" | "info" => { const s = textValue(raw).toLowerCase(); if (s === "error" || s === "critical" || s === "fatal") return "error"; if (s === "warning" || s === "warn") return "warning"; return "info"; };
const logTitle = (row: JsonRecord) => textValue(row.action) || textValue(row.reason) || textValue(row.category) || "אירוע";

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => <section className={`card ${className}`}>{children}</section>;
const Dot = ({ tone: value = "good" }: { tone?: "good" | "warn" | "danger" | "muted" }) => <span className={`status-dot ${value}`} aria-hidden />;
const Badge = ({ quality }: { quality: Quality }) => <span className={`quality-badge quality-${quality.toLowerCase()}`}>{quality}</span>;
const Metric = ({ label, value, note, valueTone = "" }: { label: string; value: string; note?: string; valueTone?: string }) => <div className="metric"><span>{label}{note && <small className="metric-note">{note}</small>}</span><strong className={valueTone}>{value}</strong></div>;
const Empty = ({ quality = "UNAVAILABLE", reason }: { quality?: Quality; reason: string }) => <div className={`unavailable state-${quality.toLowerCase()}`}><Badge quality={quality}/><b>{quality === "STALE" ? "נתון ישן" : quality === "ERROR" ? "שגיאה" : "אין נתון להצגה"}</b><span>{reason}</span></div>;
const QualityMetric = ({ label, raw }: { label: string; raw: unknown }) => { const metric = metricValue(raw); return <div className="quality-metric"><Metric label={label} value={displayMetric(metric)} note={metric.reason || metric.source}/><Badge quality={metric.quality}/></div>; };
const SectionNotice = ({ label, section, now }: { label: string; section?: DashboardSection; now: number }) => {
  if (!section?.error) return null;
  const age = section.lastSuccessAt === null ? null : Math.max(0, (now - section.lastSuccessAt) / 1000);
  return <div className="section-error" role="status"><Badge quality="STALE"/><div><b>{label} לא עודכן</b><span>{section.error}. {age === null ? "אין נתון קודם זמין." : `מוצג נתון אחרון מלפני ${secondsLabel(age)}.`}</span></div></div>;
};

type LogGroup = { key: string; title: string; component: string; result: string; severity: "error" | "warning" | "info"; count: number; firstAt: string; lastAt: string; from: string; to: string };

function groupActivity(rows: JsonRecord[]): LogGroup[] {
  const groups: LogGroup[] = [];
  for (const row of rows) {
    const title = logTitle(row);
    const component = textValue(row.component);
    const result = textValue(row.result);
    const severity = logSeverity(row.severity);
    const occurred = textValue(row.occurred_at);
    const from = textValue(row.previous_state);
    const to = textValue(row.new_state);
    const sig = `${title}|${component}|${result}|${severity}|${from}|${to}`;
    const last = groups[groups.length - 1];
    if (last && last.key === sig) {
      last.count += 1;
      last.firstAt = occurred || last.firstAt;
    } else {
      groups.push({ key: sig, title, component, result, severity, count: 1, firstAt: occurred, lastAt: occurred, from, to });
    }
  }
  return groups;
}

function ActivityLog({ rows, quality, now }: { rows: JsonRecord[]; quality: Quality; now: number }) {
  const [filter, setFilter] = useState<"all" | "warning" | "error">("all");
  const groups = groupActivity(rows);
  const latest = groups[0];
  const shown = filter === "all" ? groups : groups.filter(g => filter === "error" ? g.severity === "error" : g.severity !== "info");
  const counts = { warning: groups.filter(g => g.severity === "warning").length, error: groups.filter(g => g.severity === "error").length };
  return <Card className="activity-log-card">
    <div className="section-head"><div><h2>פעילות אחרונה</h2><p>אירועים זהים רצופים מקובצים · שעון Asia/Jerusalem</p></div><Badge quality={quality}/></div>
    {latest && <div className={`log-latest ${latest.severity}`}><span className="log-latest-tag">האחרון</span><b>{latest.title}</b><code>{latest.component}{latest.result && ` · ${latest.result}`}</code><time title={dateTime(latest.lastAt)}>{relTime(latest.lastAt, now)}</time></div>}
    <div className="log-filters"><button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>הכל ({groups.length})</button><button className={filter === "warning" ? "on" : ""} onClick={() => setFilter("warning")}>אזהרות ({counts.warning})</button><button className={filter === "error" ? "on" : ""} onClick={() => setFilter("error")}>שגיאות ({counts.error})</button></div>
    {shown.length ? <div className="log-list">{shown.map((g, index) => <div className={`log-row ${g.severity}`} key={`${g.key}-${index}`}>
      <time title={dateTime(g.lastAt)}>{relTime(g.lastAt, now)}</time><i/>
      <div><b>{g.title}{g.count > 1 && <span className="log-count">×{g.count}</span>}</b>
        <code>{g.component}{g.result && ` · ${g.result}`}{g.from && g.to && ` · ${g.from} → ${g.to}`}{g.count > 1 && ` · ${clock(g.firstAt)}–${clock(g.lastAt)}`}</code></div>
    </div>)}</div> : <Empty reason={filter === "all" ? "אין אירועי activity מאומתים לאחר cutover." : "אין אירועים בסינון שנבחר."}/>}
  </Card>;
}

function ExportDialog({ csrf, onClose }: { csrf: string; onClose: () => void }) {
  const [recipients, setRecipients] = useState<string[]>([]);
  const [choice, setChoice] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "sending" | "done" | "error">("loading");
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    fetchExportRecipients().then(list => { if (alive) { setRecipients(list); setChoice(list[0] || ""); setState(list.length ? "ready" : "error"); if (!list.length) setError("רשימת הנמענים אינה זמינה — ודא שהתקנת שירות הייצוא."); } })
      .catch(reason => { if (alive) { setState("error"); setError(reason instanceof Error ? reason.message : "שליפת נמענים נכשלה"); } });
    return () => { alive = false; };
  }, []);
  const submit = async () => {
    if (!choice) return;
    setState("sending");
    try { await requestTradeExport(choice, csrf); setState("done"); }
    catch (reason) { setState("error"); setError(reason instanceof Error ? reason.message : "בקשת הייצוא נכשלה"); }
  };
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={event => event.stopPropagation()}>
    <div className="modal-symbol">XL</div>
    <h2>שליחת היסטוריית עסקאות למייל</h2>
    {state === "done"
      ? <p>הבקשה נכנסה לתור. הקובץ (כל העסקאות, ללא פילטור) יישלח אל <b>{choice}</b> תוך מספר דקות.</p>
      : <p>הקובץ המלא ייוצא ברקע ויישלח כקובץ Excel מצורף. בחר נמען מרשימת מקבלי הדוחות.</p>}
    {state !== "done" && <select value={choice} disabled={state !== "ready"} onChange={event => setChoice(event.target.value)}>
      {recipients.length ? recipients.map(email => <option key={email} value={email}>{email}</option>) : <option value="">{state === "loading" ? "טוען…" : "אין נמענים"}</option>}
    </select>}
    {state === "error" && <p className="modal-error">{error}</p>}
    <div>{state === "done"
      ? <button className="button primary" onClick={onClose}>סגור</button>
      : <><button className="button secondary" onClick={onClose}>ביטול</button><button className="button primary" disabled={state !== "ready" || !choice} onClick={() => void submit()}>{state === "sending" ? "שולח…" : "שלח"}</button></>}</div>
  </div></div>;
}

export default function Home() {
  const [query, setQuery] = useState<DashboardQuery>({ range: "today", page: 1, pageSize: 5000 });
  const [tablePage, setTablePage] = useState(1);
  const [tableSize, setTableSize] = useState(25);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<DealFilters>(EMPTY_FILTERS);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const snapshotRef = useRef<DashboardSnapshot | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "auth" | "error">("loading");
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const queryKey = JSON.stringify(query);

  useEffect(() => { const clock = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(clock); }, []);
  useEffect(() => {
    let stopped = false, active: AbortController | null = null, timer: number | undefined;
    const poll = async () => {
      if (stopped || active) return;
      active = new AbortController(); const timeout = window.setTimeout(() => active?.abort(), 8000);
      try { const data = await fetchDashboardSnapshot(query, active.signal, snapshotRef.current); if (!stopped) { snapshotRef.current = data; setSnapshot(data); setState("ready"); setError(""); } }
      catch (reason) { if (!stopped) { if (reason instanceof AuthenticationRequiredError) setState("auth"); else { setState("error"); setError(reason instanceof Error ? reason.message : "בקשה נכשלה"); } } }
      finally { clearTimeout(timeout); active = null; if (!stopped) timer = window.setTimeout(poll, document.hidden ? 60000 : 10000); }
    };
    const visibility = () => { if (!document.hidden && !active) { if (timer) clearTimeout(timer); void poll(); } };
    document.addEventListener("visibilitychange", visibility); void poll();
    return () => { stopped = true; if (timer) clearTimeout(timer); active?.abort(); document.removeEventListener("visibilitychange", visibility); };
  // queryKey is a stable serialization that prevents duplicate polling on render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  const root = objectValue(snapshot?.overview?.data), account = objectValue(root.account), markets = objectValue(root.markets), health = objectValue(root.health);
  const activity = arrayValue(objectValue(root.activity).items), alerts = arrayValue(objectValue(root.alerts).items);
  const current = objectValue(markets.current);
  const infra = objectValue(snapshot?.infrastructure?.data), disk = objectValue(infra.disk), ram = objectValue(infra.ram), cpu = objectValue(infra.cpu), database = objectValue(infra.database), uptime = objectValue(infra.uptime), services = objectValue(infra.services);
  const dealData = objectValue(snapshot?.externalDeals?.data), deals = arrayValue(dealData.items), summary = objectValue(snapshot?.externalSummary?.data);
  const filteredDeals = deals.filter(row => dealMatchesFilters(row, filters));
  const clientPageCount = Math.max(1, Math.ceil(filteredDeals.length / tableSize));
  const clampedTablePage = Math.min(tablePage, clientPageCount);
  const pageDeals = filteredDeals.slice((clampedTablePage - 1) * tableSize, clampedTablePage * tableSize);
  const setFilter = (patch: Partial<DealFilters>) => { setFilters(value => ({ ...value, ...patch })); setTablePage(1); };
  const csrf = textValue(objectValue(snapshot?.session?.data).csrf_token);
  const total = metricValue(account.total_equity);
  const kill = boolValue(health.kill_switch), paused = boolValue(health.pause_entries);
  const recovery = objectValue(health.auto_recovery), recoveryPause = objectValue(recovery.pause), recoveryBlockers = arrayValue(recovery.current_blockers);
  const refreshAge = snapshot ? Math.max(0, (now - snapshot.receivedAt) / 1000) : null;
  const selectedRange = query.range;
  const setRange = (range: DashboardQuery["range"]) => { setQuery(value => ({ ...value, range })); setTablePage(1); };
  const doLogout = async () => { try { await logout(csrf); window.location.assign("/live/login?next=/live-status/"); } catch (reason) { setError(reason instanceof Error ? reason.message : "ההתנתקות נכשלה"); setState("error"); } };

  return <main dir="rtl">
    <header className="topbar"><div className="brand"><div className="brand-mark">P</div><div><b>Polymarket Robot</b><small>LIVE · READ ONLY</small></div></div><div className="top-statuses"><span className="top-chip data-age">רענון: <b>{refreshAge === null ? "—" : secondsLabel(refreshAge)}</b></span><span className="server-clock"><b>{new Date(now).toLocaleTimeString("en-GB", { timeZone: TZ, hour12: false })}</b><small>Asia/Jerusalem</small></span></div><button className="button secondary" disabled={!csrf} onClick={() => void doLogout()}>התנתקות</button></header>
    <div className="page-shell">
      <div className="page-title"><div><p className="eyebrow">PRODUCTION DATA · CUTOVER {textValue(snapshot?.overview?.meta.cutover_at) || "UNAVAILABLE"}</p><h1>מרכז מצב מסחר</h1><p>מקור יחיד: Dashboard API v1. אין fallback ל־Mock ואין פעולות מסחר.</p></div></div>
      {state === "loading" && <div className="loading-banner">טוען נתוני LIVE מאומתים…</div>}
      {state === "auth" && <div className="auth-banner"><div><b>ה־session אינו בתוקף</b><span>לא הוצג מידע פיננסי ללא אימות.</span></div><a className="button primary" href="/live/login?next=/live-status/">התחברות</a></div>}
      {state === "error" && <div className="alert-banner danger-banner"><div className="alert-icon">!</div><div><b>הרענון נכשל</b><span>{error}. אם מוצגים נתונים קודמים, גילם נשמר ולא אופס.</span></div></div>}
      {state === "ready" && (alerts.length ? <div className="alert-banner"><div className="alert-icon">!</div><div><b>{textValue(alerts[0].severity) || "התראה פעילה"}</b><span>{textValue(alerts[0].message) || textValue(alerts[0].reason_code)}</span></div></div> : <div className="all-good"><Dot/><b>אין התראות פעילות במקור</b></div>)}
      <SectionNotice label="Session" section={snapshot?.sections.session} now={now}/>
      <SectionNotice label="Overview" section={snapshot?.sections.overview} now={now}/>

      <div className="hero-grid">
        <Card className="hero-card hero-equity"><div className="card-head"><span>חשבון ו־Equity</span><Badge quality={total.quality}/></div><div className="money">{displayMetric(total)}</div><QualityMetric label="מזומן זמין" raw={account.cash}/><QualityMetric label="שווי פוזיציות שמרני" raw={account.positions}/><QualityMetric label="שמור בפקודות" raw={account.reserved}/><QualityMetric label="Claimable" raw={account.claimable}/></Card>
        <Card className="hero-card event-card"><div className="card-head"><span>אירוע נוכחי</span><Badge quality={qualityValue(current.quality)}/></div>{current.event_id ? <><h2>Bitcoin Up or Down · 5 Minutes</h2><div className="event-market"><div><span>YES bid / ask</span><b>{money(objectValue(current.yes).best_bid).replace("$", "")} / {money(objectValue(current.yes).best_ask).replace("$", "")}</b></div><div><span>NO bid / ask</span><b>{money(objectValue(current.no).best_bid).replace("$", "")} / {money(objectValue(current.no).best_ask).replace("$", "")}</b></div><div className="countdown"><span>נותר</span><b>{countdown(current.ends_at, now)}</b></div></div><div className="strategy-line"><Dot tone={boolValue(current.stale) ? "warn" : "good"}/><span><b>{boolValue(current.accepting_orders) ? "מקבל פקודות" : "אינו מקבל פקודות"}</b><small>as of {dateTime(current.as_of)}</small></span></div></> : <Empty reason="אין אירוע נוכחי במקור המצומצם."/>}</Card>
        <Card className="hero-card recovery-card"><div className="section-head"><div><h2>Auto Recovery</h2><p>מצב durable וראיות השחרור</p></div></div><div className="recovery-metrics"><Metric label="Trading" value={textValue(recovery.trading_status) || (paused ? "PAUSED" : "ENABLED")}/><Metric label="Recovery" value={textValue(recovery.auto_recovery_status) || "UNKNOWN"}/><Metric label="Pause state" value={textValue(recoveryPause.pause_state) || textValue(recovery.pause_state) || "UNKNOWN"}/><Metric label="Cause" value={textValue(recoveryPause.pause_cause) || textValue(recovery.cause) || "—"}/><Metric label="Owner" value={textValue(recoveryPause.pause_owner) || textValue(recovery.owner) || "NONE"}/><Metric label="Release policy" value={textValue(recoveryPause.release_policy) || textValue(recovery.release_policy) || "UNKNOWN"}/><Metric label="Pause age" value={numberValue(recovery.pause_age_seconds) === null ? "—" : secondsLabel(recovery.pause_age_seconds)}/><Metric label="Blockers" value={recoveryBlockers.length ? recoveryBlockers.map(row => textValue(row.code)).filter(Boolean).join(", ") : "אין"}/><Metric label="Stability" value={String(((numberValue(recovery.stability_elapsed_ms) || 0) / 1000).toFixed(1)) + " / " + String(((numberValue(recovery.stability_target_ms) || 0) / 1000).toFixed(1)) + " שנ׳"}/><Metric label="Last action" value={textValue(recovery.last_recovery_action) || "—"}/><Metric label="Last result" value={textValue(recovery.last_recovery_result) || "—"}/><Metric label="Last auto recovery" value={dateTime(recovery.last_auto_recovery_at)}/><Metric label="Kill Switch" value={kill ? "פעיל" : "לא פעיל"}/></div></Card>
      </div>

      <ActivityLog rows={activity} quality={qualityValue(objectValue(root.activity).quality)} now={now}/>

      <div className={`content-grid${SHOW_CONTROL_CARD ? "" : " single"}`}>
        {SHOW_CONTROL_CARD && <Card className="control-card"><div className="section-head"><div><h2>שליטה במכונה</h2><p>מוצג לצורך הבחנה בלבד</p></div><span className="state-pill warn"><Dot tone="warn"/>READ ONLY</span></div><div className="readonly-callout"><b>אין Command API בדאשבורד</b><span>כל הכפתורים disabled ואינם משנים local state.</span></div><div className="control-actions disabled-actions"><button disabled>הפסק כניסות<small>Pause entries</small></button><button disabled>השבת מסחר<small>שונה מ־Kill Switch</small></button><button disabled>בטל פקודות<small>אינו סוגר פוזיציות</small></button><button disabled>סגור פוזיציות<small>לא מחובר</small></button><button disabled>עצור שירות<small>systemd אינו נגיש</small></button><button className="emergency" disabled>Kill Switch<small>מצב שרת: {kill ? "פעיל" : "לא פעיל"}</small></button></div></Card>}
        <Card className="activity-card"><SectionNotice label="Polymarket summary" section={snapshot?.sections.externalSummary} now={now}/><div className="section-head"><div><h2>פעילות מסחר (תזרים)</h2><p>מקור: רשומות Polymarket עבור ארנק ה־proxy · תזרים = מכירות − קניות − עמלות. אינו כולל תשלומי הכרעה.</p></div><Badge quality={qualityValue(summary.quality)}/></div><div className="money">{money(summary.total_cash_flow_usd)}</div><div className="stats-grid"><Metric label="עסקאות" value={numberValue(summary.deal_count) === null ? "—" : String(summary.deal_count)}/><Metric label="תזרים חיובי" value={numberValue(summary.wins) === null ? "—" : String(summary.wins)}/><Metric label="תזרים שלילי" value={numberValue(summary.losses) === null ? "—" : String(summary.losses)}/><Metric label="אחוז חיובי" value={numberValue(summary.win_rate_percent) === null ? "—" : `${num.format(numberValue(summary.win_rate_percent)!)}%`}/><Metric label="תזרים חיובי ממוצע" value={money(summary.average_win_usd)}/><Metric label="תזרים שלילי ממוצע" value={money(summary.average_loss_usd)}/><Metric label="יחס תזרים" value={numberValue(summary.profit_factor) === null ? "—" : num.format(numberValue(summary.profit_factor)!)}/><Metric label="עמלות" value={money(summary.fees_usd)}/></div></Card>
      </div>

      <Card className="table-card"><SectionNotice label="Polymarket deals" section={snapshot?.sections.externalDeals} now={now}/><div className="section-head"><div><h2>היסטוריית עסקאות</h2><p>מקור: רשומות Polymarket · עסקה = כל הפעולות על אירוע · תזרים = מכירות − קניות − עמלות</p></div><div className="head-actions"><button className="button secondary export-btn" onClick={() => setExportOpen(true)}>שליחת XL למייל</button><button className={`button secondary filter-btn${activeFilterCount(filters) ? " on" : ""}`} onClick={() => setFiltersOpen(value => !value)}><FilterIcon/>סינון{activeFilterCount(filters) > 0 && <span className="log-count">{activeFilterCount(filters)}</span>}</button><div className="controls"><select aria-label="טווח" value={selectedRange} onChange={event => setRange(event.target.value as DashboardQuery["range"])}><option value="today">היום</option><option value="yesterday">אתמול</option><option value="3d">3 ימים</option><option value="7d">7 ימים</option><option value="30d">30 ימים</option><option value="custom">טווח מותאם</option></select>{selectedRange === "custom" && <><input aria-label="מתאריך" type="date" value={query.from || ""} onChange={event => { setQuery(value => ({ ...value, from: event.target.value })); setTablePage(1); }}/><input aria-label="עד תאריך" type="date" value={query.to || ""} onChange={event => { setQuery(value => ({ ...value, to: event.target.value })); setTablePage(1); }}/></>}</div><select aria-label="שורות בעמוד" className="page-size" value={tableSize} onChange={event => { setTableSize(Number(event.target.value)); setTablePage(1); }}><option value={25}>25 בעמוד</option><option value={50}>50 בעמוד</option><option value={100}>100 בעמוד</option></select><Badge quality={qualityValue(dealData.quality)}/></div></div>
      {filtersOpen && <div className="filter-panel">
        <div className="filter-field"><label>טוקן</label><select value={filters.token} onChange={event => setFilter({ token: event.target.value })}><option value="">הכל</option><option value="Up">Up</option><option value="Down">Down</option></select></div>
        <div className="filter-field"><label>תזרים</label><select value={filters.cashFlowSign} onChange={event => setFilter({ cashFlowSign: event.target.value as DealFilters["cashFlowSign"] })}><option value="">הכל</option><option value="positive">חיובי</option><option value="negative">שלילי</option></select></div>
        <RangeField label="תזרים $" from={filters.cashFlowMin} to={filters.cashFlowMax} onFrom={v => setFilter({ cashFlowMin: v })} onTo={v => setFilter({ cashFlowMax: v })}/>
        <RangeField label="קנייה $" from={filters.buyUsdMin} to={filters.buyUsdMax} onFrom={v => setFilter({ buyUsdMin: v })} onTo={v => setFilter({ buyUsdMax: v })}/>
        <RangeField label="מכירה $" from={filters.sellUsdMin} to={filters.sellUsdMax} onFrom={v => setFilter({ sellUsdMin: v })} onTo={v => setFilter({ sellUsdMax: v })}/>
        <RangeField label="מחיר קנייה" hint="(0–1)" step="0.01" min={0} max={1} from={filters.buyPriceMin} to={filters.buyPriceMax} onFrom={v => setFilter({ buyPriceMin: v })} onTo={v => setFilter({ buyPriceMax: v })}/>
        <RangeField label="מחיר מכירה" hint="(0–1)" step="0.01" min={0} max={1} from={filters.sellPriceMin} to={filters.sellPriceMax} onFrom={v => setFilter({ sellPriceMin: v })} onTo={v => setFilter({ sellPriceMax: v })}/>
        <button className="button secondary filter-clear" disabled={!activeFilterCount(filters)} onClick={() => setFilter(EMPTY_FILTERS)}>נקה סינון</button>
      </div>}
      {pageDeals.length ? <div className="table-scroll"><table><thead><tr><th>#</th><th>התחלה</th><th>סיום</th><th>שוק</th><th>טוקן</th><th>פעולות</th><th>קנייה $</th><th>מחיר קנייה</th><th>מכירה $</th><th>מחיר מכירה</th><th>עמלות</th><th>תזרים</th><th>נזילות כניסה</th><th>סטטוס</th></tr></thead><tbody>{pageDeals.map((row, index) => <tr key={`${textValue(row.deal_key)}-${index}`}><td>{textValue(row.seq) || "—"}</td><td>{dateTime(row.first_action_at)}</td><td>{dateTime(row.last_action_at)}</td><td>{textValue(row.market_title) || textValue(row.event_slug) || textValue(row.deal_key)}</td><td>{textValue(row.outcomes) || "—"}</td><td>{textValue(row.action_count)}</td><td>{money(row.buy_notional_usd)}</td><td>{avgPrice(row.buy_notional_usd, row.buy_size)}</td><td>{money(row.sell_notional_usd)}</td><td>{avgPrice(row.sell_notional_usd, row.sell_size)}</td><td>{money(row.fees_usd)}</td><td className={(numberValue(row.cash_flow_usd) ?? 0) >= 0 ? "positive" : "negative"}>{money(row.cash_flow_usd)}</td><td>{entryLiquidityCell(row)}</td><td>{exitStatus(row)}</td></tr>)}</tbody></table></div> : <Empty quality={qualityValue(dealData.quality)} reason={activeFilterCount(filters) ? `אין עסקאות התואמות את הסינון (מתוך ${deals.length} בטווח). בדוק את הערכים — מחירים הם בין 0 ל־1, "מ־" הוא הגבול התחתון.` : "אין רשומות Polymarket בטווח שנבחר."}/>}
      <div className="table-footer"><span>{filteredDeals.length === deals.length ? `${deals.length} עסקאות בטווח` : `${filteredDeals.length} מתוך ${deals.length} עסקאות (מסונן)`}{numberValue(dealData.total) !== null && (dealData.total as number) > deals.length && ` · מוצג ${deals.length} מתוך ${dealData.total} — צמצם טווח תאריכים`}</span></div>
      <div className="pagination"><button disabled={clampedTablePage <= 1} onClick={() => setTablePage(value => value - 1)}>הקודם</button><span>עמוד {clampedTablePage} מתוך {clientPageCount}</span><button disabled={clampedTablePage >= clientPageCount} onClick={() => setTablePage(value => value + 1)}>הבא</button></div></Card>
      {exportOpen && <ExportDialog csrf={csrf} onClose={() => setExportOpen(false)}/>}

      <Card className="health-card"><SectionNotice label="Infrastructure" section={snapshot?.sections.infrastructure} now={now}/><div className="section-head"><div><h2>בריאות ותשתית</h2><p>דגימה cached ל־15 שניות; dashboard read-only</p></div><Badge quality={qualityValue(health.quality)}/></div><div className="health-grid"><div className="storage"><div><span>Disk</span><b>{bytes(disk.used_bytes)} / {bytes(disk.total_bytes)}</b></div><div className="progress"><i style={{ width: `${numberValue(disk.used_percent) ?? 0}%` }}/></div><small>{bytes(disk.free_bytes)} פנוי · {textValue(disk.used_percent)}%</small></div><Metric label="DB size" value={bytes(database.size_bytes)}/><Metric label="CPU" value={numberValue(cpu.used_percent) === null ? "—" : `${cpu.used_percent}%`}/><Metric label="RAM" value={`${bytes(ram.used_bytes)} / ${bytes(ram.total_bytes)}`}/><Metric label="Host uptime" value={secondsLabel(uptime.host_seconds)}/><Metric label="Dashboard uptime" value={secondsLabel(uptime.dashboard_process_seconds)}/><Metric label="Dashboard service" value={textValue(objectValue(services.dashboard).state) || "UNKNOWN"}/><Metric label="Restart count" value={textValue(objectValue(services.dashboard).restart_count) || "0"}/></div><div className="freshness-row"><span>זמן שרת: {dateTime(snapshot?.overview?.meta.as_of)}</span><span>Reconciliation אחרון: {dateTime(health.last_reconciliation)}</span><span>API {textValue(snapshot?.overview?.meta.api_version)} · {textValue(snapshot?.overview?.meta.environment)} / {textValue(snapshot?.overview?.meta.execution_mode)}</span></div></Card>
      <footer>Polymarket Robot · LIVE READ ONLY · Asia/Jerusalem · USD · מחירי חוזים 0–1</footer>
    </div>
  </main>;
}
