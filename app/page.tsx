"use client";

import "./live.css";
import { useEffect, useMemo, useState } from "react";
import { AuthenticationRequiredError, boolValue, fetchLiveSnapshot, freshnessLabel, numberValue, objectValue, parseEventStart, textValue, type JsonRecord, type LiveSnapshot } from "./live-data";

const TZ = "Asia/Jerusalem";
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const num = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 4 });
const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => <section className={`card ${className}`}>{children}</section>;
const Dot = ({ tone = "good" }: { tone?: "good" | "warn" | "danger" | "muted" }) => <span className={`status-dot ${tone}`} aria-hidden />;
const Metric = ({ label, value, tone = "", note }: { label: string; value: string; tone?: string; note?: string }) => <div className="metric"><span>{label}{note && <small className="metric-note">{note}</small>}</span><strong className={tone}>{value}</strong></div>;
const NA = ({ reason, compact = false }: { reason: string; compact?: boolean }) => <div className={`unavailable ${compact ? "compact" : ""}`}><b>לא זמין</b><span>{reason}</span></div>;
const localTime = (value: unknown) => {
  const stamp = typeof value === "number" ? value : Date.parse(textValue(value));
  return Number.isFinite(stamp) ? new Date(stamp).toLocaleTimeString("he-IL", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "—";
};
const countdown = (end: number | null, now: number) => {
  if (!end) return "—";
  const seconds = Math.max(0, Math.ceil((end - now) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};
const formatBytes = (value: unknown) => {
  const raw = numberValue(value); if (raw === null) return "לא זמין";
  const units = ["B", "KB", "MB", "GB", "TB"]; let n = raw, unit = 0;
  while (n >= 1024 && unit < units.length - 1) { n /= 1024; unit++; }
  return `${n.toFixed(unit > 1 ? 2 : 0)} ${units[unit]}`;
};
const machine = (health: JsonRecord) => {
  const strategy = objectValue(health.strategy);
  if (boolValue(health.kill_switch_active)) return { label: "Kill Switch פעיל", tone: "danger" as const };
  if (boolValue(strategy.pause_entries)) return { label: "כניסות מושהות", tone: "warn" as const };
  return textValue(strategy.readiness) === "READY" ? { label: "מוכנה", tone: "good" as const } : { label: "לא מוכנה", tone: "danger" as const };
};
const quote = (books: JsonRecord, token: unknown, side: "best_bid" | "best_ask") => numberValue(objectValue(books[textValue(token)])[side]);
const safeLog = (row: JsonRecord) => (textValue(row.requested_action) || textValue(row.reason_code) || textValue(row.category) || "אירוע מערכת").replaceAll("_", " ");

export default function Home() {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [state, setState] = useState<"loading" | "ready" | "auth" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => {
    let stopped = false, controller: AbortController | null = null, timer: number | null = null;
    const poll = async () => {
      if (stopped || controller) return;
      controller = new AbortController(); const timeout = window.setTimeout(() => controller?.abort(), 4500);
      try {
        const data = await fetchLiveSnapshot(controller.signal);
        if (!stopped) { setSnapshot(data); setState("ready"); setError(""); }
      } catch (reason) {
        if (!stopped) {
          if (reason instanceof AuthenticationRequiredError) setState("auth");
          else { setState("error"); setError(reason instanceof Error ? reason.message : "שגיאה לא ידועה"); }
        }
      } finally {
        clearTimeout(timeout); controller = null;
        if (!stopped) timer = window.setTimeout(poll, document.hidden ? 30000 : 5000);
      }
    };
    const visible = () => { if (!document.hidden && !controller) { if (timer) clearTimeout(timer); void poll(); } };
    document.addEventListener("visibilitychange", visible); void poll();
    return () => { stopped = true; if (timer) clearTimeout(timer); controller?.abort(); document.removeEventListener("visibilitychange", visible); };
  }, []);

  const health = snapshot?.health ?? {}, envelope = snapshot?.strategy ?? {};
  const strategy = objectValue(health.strategy || envelope.strategy);
  const account = objectValue(health.account_identity || envelope.account);
  const marketWs = objectValue(health.market_ws || envelope.market_ws), userWs = objectValue(health.user_ws || envelope.user_ws);
  const config = objectValue(health.config), books = objectValue(marketWs.books), status = machine(health);
  const positions = Array.isArray(strategy.positions) ? strategy.positions.map(objectValue) : [], position = positions[0] ?? null;
  const event = objectValue(strategy.event), eventStart = parseEventStart(event.event_id);
  const eventCurrent = !!eventStart && now >= eventStart && now < eventStart + 300_000;
  const market = eventCurrent ? (snapshot?.markets ?? []).find(row => textValue(row.event_id) === textValue(event.event_id)) ?? null : null;
  const next = useMemo(() => (snapshot?.markets ?? []).map(row => ({ start: parseEventStart(row.event_id) })).filter(x => x.start !== null && x.start > now).sort((a, b) => (a.start ?? 0) - (b.start ?? 0))[0] ?? null, [snapshot?.markets, now]);
  const available = numberValue(account.balance_usd ?? account.available_balance_usd ?? account.balance), publicValue = numberValue(account.public_positions_value);
  const shares = position ? numberValue(position.remaining_shares_text) : null, sellable = position ? numberValue(position.sellable_shares_text) : null;
  const acquired = position ? numberValue(position.acquired_shares_text) : null, cost = position ? numberValue(position.cost_all_in_text) : null;
  const bid = position ? quote(books, position.token_id, "best_bid") : null;
  const currentValue = sellable !== null && bid !== null ? sellable * bid : null;
  const remainingCost = cost !== null && shares !== null && acquired && acquired > 0 ? cost * shares / acquired : null;
  const unrealized = currentValue !== null && remainingCost !== null ? currentValue - remainingCost : null;
  const marketConnected = textValue(marketWs.status) === "CONNECTED" && !boolValue(marketWs.stale);
  const userConnected = textValue(userWs.status) === "CONNECTED" && !boolValue(userWs.stale);
  const reconReady = textValue(strategy.reconciliation_readiness) === "READY";
  const alerts = Array.isArray(health.alerts) ? health.alerts.map(objectValue) : [];
  const healthy = state === "ready" && status.tone === "good" && marketConnected && reconReady;

  return <main dir="rtl">
    <header className="topbar">
      <div className="brand"><div className="brand-mark">P</div><div><b>Polymarket Robot</b><small>תצוגת LIVE מאומתת</small></div></div>
      <div className="top-statuses"><span className="top-chip"><Dot tone={state === "ready" ? status.tone : "muted"}/><b>{state === "ready" ? status.label : "אין נתונים"}</b></span><span className="top-chip"><Dot tone={marketConnected ? "good" : "danger"}/>Market WS {marketConnected ? "מחובר" : "לא תקין"}</span><span className="top-chip data-age">נתון אחרון: <b>{freshnessLabel(marketWs.last_message_at, now)}</b></span><span className="server-clock"><b>{new Date(textValue(health.time) || now).toLocaleTimeString("en-GB", { hour12: false, timeZone: TZ })}</b><small>Asia/Jerusalem</small></span></div>
      <button className="button danger-outline" disabled title="פעולות שליטה אינן מחוברות">שליטה מושבתת</button>
    </header>
    <div className="page-shell">
      <div className="page-title"><div><p className="eyebrow">LIVE · READ ONLY</p><h1>מרכז מצב מסחר</h1><p>נתוני ייצור בלבד; ללא Mock וללא פעולות מסחר מהדפדפן.</p></div><div className={`system-ok ${healthy ? "" : "not-ok"}`}><Dot tone={healthy ? "good" : "warn"}/><span><b>{healthy ? "המערכת מדווחת READY" : "נדרשת תשומת לב"}</b><small>{healthy ? "שוק ו-Reconciliation תקינים" : "בדוק את החיבור והמדדים"}</small></span></div></div>
      {state === "auth" && <div className="auth-banner"><div><b>הנתונים מוגנים ודורשים התחברות</b><span>אף נתון תפעולי לא נטען ללא session מורשה.</span></div><a className="button primary" href="/live/login">התחברות ל-LIVE</a></div>}
      {state === "error" && <div className="alert-banner danger-banner"><div className="alert-icon">!</div><div><b>לא ניתן לרענן</b><span>{error}. נתונים קודמים מסומנים לפי גילם.</span></div></div>}
      {state === "loading" && <div className="loading-banner">טוען נתוני LIVE…</div>}
      {state === "ready" && (alerts.length ? <div className="alert-banner"><div className="alert-icon">!</div><div><b>{textValue(alerts[0].severity) || "התראה"}</b><span>{textValue(alerts[0].message) || textValue(alerts[0].reason_code)}</span></div></div> : <div className="all-good"><Dot/><b>אין התראות פעילות</b></div>)}

      <div className="overview-grid">
        <Card><div className="card-head"><span>יתרה זמינה</span><span className="live-badge">LIVE · snapshot</span></div>{available !== null ? <><div className="money">{usd.format(available)}</div><div className="source-note">נמדד {freshnessLabel(account.sampled_at ?? account.updated_at, now)}</div></> : <NA reason="Snapshot החשבון אינו כולל יתרה זמינה מאומתת." compact/>}<div className="metric-list"><Metric label="שווי פוזיציות ציבורי" value={publicValue === null ? "לא זמין" : usd.format(publicValue)} note="לא valuation שמרני"/><Metric label="שווי כולל" value="לא זמין" note="reserved balance לא מוגדר"/></div></Card>
        <Card className="event-card"><div className="card-head"><span>אירוע נוכחי</span><span className="soft-badge">{eventCurrent && eventStart ? `${localTime(eventStart)}–${localTime(eventStart + 300_000)}` : "לא זמין"}</span></div>{eventCurrent && market ? <><h2>Bitcoin Up or Down · 5 Minutes</h2><div className="event-market"><div><span>YES bid / ask</span><b className="positive">{quote(books, market.yes_token_id, "best_bid") === null || quote(books, market.yes_token_id, "best_ask") === null ? "—" : `${num.format(quote(books, market.yes_token_id, "best_bid")!)} / ${num.format(quote(books, market.yes_token_id, "best_ask")!)}`}</b></div><div><span>NO bid / ask</span><b>{quote(books, market.no_token_id, "best_bid") === null || quote(books, market.no_token_id, "best_ask") === null ? "—" : `${num.format(quote(books, market.no_token_id, "best_bid")!)} / ${num.format(quote(books, market.no_token_id, "best_ask")!)}`}</b></div><div className="countdown"><span>נותר</span><b>{countdown((eventStart ?? 0) + 300_000, now)}</b></div></div><div className="strategy-line"><Dot tone={textValue(strategy.readiness) === "READY" ? "good" : "warn"}/><span><b>{textValue(event.status) || "מצב לא ידוע"}</b><small>{textValue(event.lock_reason) || textValue(strategy.block_reason) || "ללא סיבת חסימה"}</small></span></div></> : <NA reason="אין API מצומצם ובטוח שממפה את האירוע הפעיל למחירי YES/NO; endpoint השוק הגולמי אינו נטען לדפדפן." compact/>}</Card>
        <Card><div className="card-head"><span>פוזיציה פתוחה</span><span className="quality-badge">LIVE</span></div>{position ? <><div className="position-lead"><span className="yes-pill">{textValue(position.outcome) || "—"}</span><div><small>P&amp;L לא ממומש</small><b className={unrealized === null ? "" : unrealized >= 0 ? "positive" : "negative"}>{unrealized === null ? "לא זמין" : `${unrealized >= 0 ? "+" : ""}${usd.format(unrealized)}`}</b></div></div><div className="mini-grid"><Metric label="מחיר כניסה" value={numberValue(position.average_entry_price_text) === null ? "—" : num.format(numberValue(position.average_entry_price_text)!)}/><Metric label="shares נותרו" value={shares === null ? "—" : num.format(shares)}/><Metric label="עלות all-in מיוחסת" value={remainingCost === null ? "—" : usd.format(remainingCost)}/><Metric label="שווי לפי best bid" value={currentValue === null ? "—" : usd.format(currentValue)}/></div><div className="order-row"><span>best bid</span><b>{bid === null ? "לא זמין" : num.format(bid)}</b></div></> : <div className="empty-state"><div className="empty-circle">—</div><b>אין פוזיציה פתוחה</b><span>לפי active_positions במקור הפעיל</span></div>}</Card>
        <Card><div className="card-head"><span>האירוע הבא</span><span className="soft-badge">{next?.start ? localTime(next.start) : "לא זמין"}</span></div>{next?.start ? <><div className="next-time"><small>נפתח בעוד</small><b>{countdown(next.start, now)}</b></div><div className="eligibility"><Dot tone={textValue(strategy.readiness) === "READY" ? "good" : "warn"}/><div><b>{textValue(strategy.readiness) === "READY" ? "המערכת מוכנה" : "המערכת אינה READY"}</b><span>{textValue(strategy.block_reason) || "זכאות סופית נקבעת בזמן אמת"}</span></div></div></> : <NA reason="לא נמצא market עתידי ב-100 הרשומות האחרונות." compact/>}<div className="next-rule"><span>LIVE submission</span><b>{boolValue(config.live_order_submission_enabled) ? "מופעל בשרת" : "כבוי בשרת"}</b></div></Card>
      </div>

      <div className="content-grid">
        <Card className="balance-section"><div className="section-head"><div><h2>ביצועי הארנק</h2><p>יתרה, רווח מצטבר ו-P&amp;L לפי אירוע</p></div><div className="controls"><div className="segmented"><button disabled>יתרת ארנק</button><button disabled>רווח מצטבר</button><button disabled>לכל אירוע</button></div><select disabled><option>היום</option><option>אתמול</option><option>3 ימים</option><option>7 ימים</option><option>טווח מותאם</option></select></div></div><NA reason="אין מקור היסטורי שמוכיח LIVE בלבד. רשומות ותיקות ללא provenance אינן מוצגות ואינן מחושבות."/></Card>
        <Card className="control-card"><div className="section-head"><div><h2>שליטה במכונה</h2><p>מופרדת בכוונה מתצוגת הנתונים</p></div><span className={`state-pill ${status.tone}`}><Dot tone={status.tone}/>{status.label}</span></div><div className="readonly-callout"><b>קריאה בלבד</b><span>אין בדף endpoint פקודה, token מפעיל או טיפול ב-CSRF.</span></div><div className="control-actions disabled-actions"><button disabled>הפסק כניסות<small>נפרד מהשבתת מסחר</small></button><button disabled>השבת מסחר<small>אינו עוצר systemd</small></button><button disabled>בטל פקודות<small>אינו סוגר פוזיציות</small></button><button disabled>סגור פוזיציות<small>דורש אישור נפרד</small></button><button disabled>עצור שירות<small>לא מחובר</small></button><button className="emergency" disabled>Kill Switch<small>לא זמין כאן</small></button></div></Card>
        <Card className="activity-card"><div className="section-head"><div><h2>פעילות מסחר</h2><p>מדדים היסטוריים מוכחי LIVE בלבד</p></div></div><NA reason="עסקאות, win rate, רווח נקי ועמלות חסרים עד להפרדה אמינה בין LIVE ל-DEMO/PAPER."/><div className="stats-grid unavailable-stats">{["סך עסקאות","רווחיות","הפסדיות","אחוז הצלחה","רווח ממוצע","הפסד ממוצע","רווח נקי","עמלות"].map(label => <Metric key={label} label={label} value="—"/>)}</div></Card>
        <Card className="log-card"><div className="section-head"><div><h2>יומן פעילות חי</h2><p>ללא IDs, כתובות או payload גולמי</p></div><span className="quality-badge">7 אחרונים</span></div>{snapshot?.logs.length ? <div className="log-list">{snapshot.logs.map((log, i) => { const sev = textValue(log.severity).toUpperCase(); const tone = ["ERROR","CRITICAL"].includes(sev) ? "error" : ["WARN","WARNING"].includes(sev) ? "warning" : "info"; return <div className={`log-row ${tone}`} key={`${textValue(log.occurred_at)}-${i}`}><time>{localTime(log.occurred_at)}</time><i/><div><b>{safeLog(log)}</b><code>{textValue(log.category)} · {textValue(log.result_status)}</code></div></div>; })}</div> : <NA reason="אין רשומות זמינות או שנדרשת התחברות." compact/>}</Card>
      </div>

      <Card className="health-card"><div className="section-head"><div><h2>בריאות המערכת</h2><p>מדדים מהשירות הפעיל</p></div><span className={`state-pill ${healthy ? "good" : "warn"}`}><Dot tone={healthy ? "good" : "warn"}/>{healthy ? "תקין" : "בדיקה נדרשת"}</span></div><div className="health-grid"><Metric label="מסד נתונים" value={formatBytes(objectValue(envelope.database).size_bytes)} note="גודל קובץ"/><Metric label="Market WS" value={textValue(marketWs.status) || "לא זמין"} tone={marketConnected ? "positive" : "negative"}/><Metric label="User WS" value={textValue(userWs.status) || "לא זמין"} tone={userConnected ? "positive" : "negative"}/><Metric label="Reconciliation" value={textValue(strategy.reconciliation_readiness) || "לא זמין"} tone={reconReady ? "positive" : "negative"}/><Metric label="Robot readiness" value={textValue(strategy.readiness) || "לא זמין"}/><Metric label="Pause entries" value={boolValue(strategy.pause_entries) ? "פעיל" : "לא פעיל"}/><Metric label="Kill Switch" value={boolValue(health.kill_switch_active) ? "פעיל" : "לא פעיל"}/><Metric label="עדכון אחרון" value={freshnessLabel(marketWs.last_message_at, now)}/></div><div className="missing-infra">CPU, RAM, disk filesystem, process uptime ו-latency אינם נחשפים ב-API הקיים ולכן אינם מוצגים.</div></Card>
      <footer>Polymarket Robot · LIVE · READ ONLY · Asia/Jerusalem · מחירים 0–1 · USD</footer>
    </div>
  </main>;
}
