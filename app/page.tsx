"use client";

import { useEffect, useMemo, useState } from "react";
import * as mock from "./mock-data";
import type { MachineStatus } from "./mock-data";

const statusMeta: Record<MachineStatus, { label: string; tone: string }> = {
  active: { label: "פעילה", tone: "good" },
  paused: { label: "מושהית", tone: "warn" },
  disabled: { label: "מושבתת", tone: "muted" },
  fault: { label: "תקלה", tone: "danger" },
};

function formatCountdown(value: number) {
  const minutes = Math.floor(value / 60).toString().padStart(2, "0");
  const seconds = (value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function StatusDot({ tone = "good" }: { tone?: string }) {
  return <span className={`status-dot ${tone}`} aria-hidden="true" />;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

function Metric({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return <div className="metric"><span>{label}</span><strong className={tone}>{value}</strong></div>;
}

function BalanceChart({ mode }: { mode: string }) {
  const width = 900, height = 240, padX = 32, padY = 28;
  const values = useMemo(() => {
    if (mode === "אירוע") return mock.balanceHistory.map(p => p.pnl);
    if (mode === "מצטבר") {
      let total = 0; return mock.balanceHistory.map(p => (total += p.pnl));
    }
    return mock.balanceHistory.map(p => p.balance);
  }, [mode]);
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => ({ x: padX + i * ((width - padX * 2) / (values.length - 1)), y: height - padY - ((v - min) / span) * (height - padY * 2) }));
  const line = pts.map(p => `${p.x},${p.y}`).join(" ");
  const area = `${padX},${height-padY} ${line} ${width-padX},${height-padY}`;
  return <div className="chart-wrap">
    <div className="y-labels"><span>{mode === "ארנק" ? `$${max.toFixed(0)}` : `+$${max.toFixed(2)}`}</span><span>{mode === "ארנק" ? `$${((min+max)/2).toFixed(0)}` : "$0"}</span><span>{mode === "ארנק" ? `$${min.toFixed(0)}` : `-$${Math.abs(min).toFixed(2)}`}</span></div>
    <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="גרף ביצועי הארנק">
      {[50,120,190].map(y => <line key={y} x1="32" y1={y} x2="868" y2={y} className="gridline" />)}
      <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2563eb" stopOpacity=".2"/><stop offset="1" stopColor="#2563eb" stopOpacity="0"/></linearGradient></defs>
      <polygon points={area} fill="url(#area)" />
      <polyline points={line} className="balance-line" />
      {pts.map((p, i) => <g className="chart-point" key={i}>
        <circle cx={p.x} cy={p.y} r="12" fill="transparent" />
        <circle cx={p.x} cy={p.y} r="4.5" className={mock.balanceHistory[i].pnl >= 0 ? "profit-dot" : "loss-dot"} />
        <foreignObject x={Math.max(5, Math.min(p.x - 76, width - 160))} y={Math.max(2, p.y - 108)} width="152" height="94" className="tooltip-box">
          <div className="chart-tooltip" dir="rtl"><b>{mock.balanceHistory[i].label}</b><span>{mock.balanceHistory[i].side} · כניסה {mock.balanceHistory[i].entry}</span><span>יציאה {mock.balanceHistory[i].exit}</span><strong className={mock.balanceHistory[i].pnl >= 0 ? "positive" : "negative"}>{mock.balanceHistory[i].pnl >= 0 ? "+" : ""}${mock.balanceHistory[i].pnl}</strong></div>
        </foreignObject>
      </g>)}
    </svg>
    <div className="x-labels"><span>18:05</span><span>19:10</span><span>20:15</span><span>21:05</span><span>22:10</span></div>
  </div>;
}

function ActivityChart() {
  return <div className="bar-chart" aria-label="פעילות מסחר לפי ימים">
    {mock.dailyActivity.map(d => <div className="bar-column" key={d.day}><div className="stack" title={`${d.wins} רווחיות, ${d.losses} הפסדיות, ${d.skipped} ללא כניסה`}><i className="wins" style={{height:`${d.wins*13}px`}}/><i className="losses" style={{height:`${d.losses*13}px`}}/><i className="skipped" style={{height:`${d.skipped*8}px`}}/></div><span>{d.day}</span></div>)}
  </div>;
}

export default function Home() {
  const [machine, setMachine] = useState<MachineStatus>("active");
  const [serverTime, setServerTime] = useState(new Date("2026-08-06T19:39:00Z"));
  const [countdown, setCountdown] = useState(mock.event.secondsLeft);
  const [nextCountdown, setNextCountdown] = useState(397);
  const [positionOpen, setPositionOpen] = useState(true);
  const [range, setRange] = useState("היום");
  const [chartMode, setChartMode] = useState("ארנק");
  const [modal, setModal] = useState<null | { title: string; body: string; action: () => void; danger?: boolean }>(null);
  const [toast, setToast] = useState("");
  const [alerts, setAlerts] = useState(mock.alerts);
  const [details, setDetails] = useState(false);

  useEffect(() => { const id = setInterval(() => { setServerTime(new Date()); setCountdown(v => Math.max(0, v-1)); setNextCountdown(v => Math.max(0, v-1)); }, 1000); return () => clearInterval(id); }, []);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(""), 2600); return () => clearTimeout(id); }, [toast]);

  const ask = (title: string, body: string, action: () => void, danger = false) => setModal({ title, body, action, danger });
  const perform = () => { modal?.action(); setToast("הפעולה עודכנה בהדמיה בהצלחה"); setModal(null); };
  const status = statusMeta[machine];

  return <main dir="rtl">
    <header className="topbar">
      <div className="brand"><div className="brand-mark">P</div><div><b>Polymarket Robot</b><small>מרכז שליטה חי</small></div></div>
      <div className="top-statuses">
        <span className="top-chip"><StatusDot tone={status.tone}/><b>המכונה {status.label}</b></span>
        <span className="top-chip"><StatusDot/>Polymarket מחובר</span>
        <span className="top-chip data-age">עודכן לפני <b>120ms</b></span>
        <span className="server-clock"><b>{serverTime.toLocaleTimeString("en-GB", {hour12:false, timeZone:"Asia/Jerusalem"})}</b><small>Asia/Jerusalem</small></span>
      </div>
      <button className={machine === "active" ? "button danger-outline" : "button primary"} onClick={() => machine === "active" ? ask("השבתת המכונה", "המכונה תפסיק לקבל כניסות חדשות. זוהי הדמיה בלבד.", () => setMachine("disabled"), true) : ask("הפעלת המכונה", "המכונה תחזור למצב פעילות בהדמיה.", () => setMachine("active"))}>{machine === "active" ? "השבת מכונה" : "הפעל מכונה"}</button>
    </header>

    <div className="page-shell">
      <div className="page-title"><div><p className="eyebrow">LIVE CONTROL</p><h1>לילה טוב, דביר</h1><p>כל מה שדורש את תשומת הלב שלך, במסך אחד.</p></div><div className="system-ok"><StatusDot/><span><b>המערכת פועלת באופן תקין</b><small>כל הבדיקות האחרונות עברו בהצלחה</small></span></div></div>

      {alerts.length ? <div className="alert-banner"><div className="alert-icon">!</div><div><b>{alerts[0].title}</b><span>{alerts[0].body}</span></div><button aria-label="סגור התראה" onClick={() => setAlerts([])}>×</button></div> : <div className="all-good"><StatusDot/><b>הכול תקין — אין התראות פעילות</b></div>}

      <div className="overview-grid">
        <Card className="wallet-card"><div className="card-head"><span>יתרת ארנק</span><span className="live-badge">LIVE</span></div><div className="money">${mock.wallet.total.toFixed(2)}</div><div className="gain">↗ +${mock.wallet.todayProfit} <span>היום · +{mock.wallet.todayPercent}%</span></div><div className="metric-list"><Metric label="זמין למסחר" value={`$${mock.wallet.available}`}/><Metric label="בפוזיציה / פקודות" value={`$${mock.wallet.committed.toFixed(2)}`}/></div></Card>
        <Card className="event-card"><div className="card-head"><span>אירוע נוכחי</span><span className="soft-badge">{mock.event.range}</span></div><h2>{mock.event.name}</h2><div className="event-market"><div><span>YES</span><b className="positive">{mock.event.yes}</b></div><div><span>NO</span><b>{mock.event.no}</b></div><div className="countdown"><span>נותר לסיום</span><b>{formatCountdown(countdown)}</b></div></div><div className="strategy-line"><StatusDot tone="warn"/><span><b>{mock.event.strategy}</b><small>{mock.event.lock}</small></span></div></Card>
        <Card className="position-card"><div className="card-head"><span>עסקה נוכחית</span><label className="demo-toggle">הצג עסקה <input type="checkbox" checked={positionOpen} onChange={e=>setPositionOpen(e.target.checked)}/><i/></label></div>{positionOpen ? <><div className="position-lead"><span className="yes-pill">YES</span><div><small>רווח נוכחי</small><b className="positive">+${mock.position.pnl}</b></div></div><div className="mini-grid"><Metric label="מחיר כניסה" value={`${mock.position.entry}`}/><Metric label="טוקנים" value={`${mock.position.tokens}`}/><Metric label="הושקע" value={`$${mock.position.invested.toFixed(2)}`}/><Metric label="שווי נוכחי" value={`$${mock.position.current}`}/></div><div className="order-row"><span>פקודה פתוחה</span><b>{mock.position.order}</b></div></> : <div className="empty-state"><div className="empty-circle">—</div><b>אין כרגע עסקה פתוחה</b><span>המערכת ממשיכה לנטר הזדמנויות</span></div>}</Card>
        <Card className="next-card"><div className="card-head"><span>האירוע הבא</span><span className="soft-badge">22:20</span></div><div className="next-time"><small>נפתח בעוד</small><b>{formatCountdown(nextCountdown)}</b></div><div className="eligibility"><StatusDot/><div><b>האסטרטגיה תהיה פעילה</b><span>האירוע הבא נמצא בחלון הפעילות</span></div></div><div className="next-rule"><span>חוק פעיל</span><b>Robot Polymarket</b></div></Card>
      </div>

      <div className="content-grid">
        <Card className="balance-section"><div className="section-head"><div><h2>ביצועי הארנק</h2><p>יתרה לאחר כל אירוע</p></div><div className="controls"><div className="segmented">{["ארנק","מצטבר","אירוע"].map(v=><button key={v} className={chartMode===v?"active":""} onClick={()=>setChartMode(v)}>{v === "ארנק" ? "יתרת ארנק" : v === "מצטבר" ? "רווח מצטבר" : "לכל אירוע"}</button>)}</div><select value={range} onChange={e=>setRange(e.target.value)} aria-label="טווח זמן"><option>היום</option><option>אתמול</option><option>3 ימים</option><option>7 ימים</option><option>30 ימים</option><option>טווח מותאם</option></select></div></div><BalanceChart mode={chartMode}/></Card>

        <Card className="control-card"><div className="section-head"><div><h2>שליטה במכונה</h2><p>פעולות תפעוליות</p></div><span className={`state-pill ${status.tone}`}><StatusDot tone={status.tone}/>{status.label}</span></div><div className="control-actions">
          <button onClick={()=>ask(machine === "active" ? "השבתת המכונה" : "הפעלת המכונה", "שינוי מצב מקומי לצורך הדגמה בלבד.", ()=>setMachine(machine === "active" ? "disabled" : "active"), machine === "active")}>{machine === "active" ? "השבת מכונה" : "הפעל מכונה"}<small>שינוי מצב המערכת</small></button>
          <button className="warning" onClick={()=>ask("השהיית כניסות", "לא יתאפשרו כניסות חדשות עד לחידוש.", ()=>setMachine("paused"))}>השהה כניסות<small>עסקאות קיימות יישארו פתוחות</small></button>
          <button onClick={()=>ask("חידוש כניסות", "המערכת תחזור לחפש הזדמנויות חדשות.", ()=>setMachine("active"))}>חדש כניסות<small>המשך פעילות רגילה</small></button>
          <button onClick={()=>ask("ביטול פקודות", "כל הפקודות הפתוחות יסומנו כמבוטלות בהדמיה.", ()=>setPositionOpen(false), true)}>בטל פקודות פתוחות<small>העסקה עצמה לא תיסגר</small></button>
          <button onClick={()=>ask("רענון התאמה", "תוצג הדמיה של בדיקת התאמה מול Polymarket.", ()=>{})}>רענן התאמה<small>בדיקת פקודות ופוזיציות</small></button>
          <button className="emergency" onClick={()=>ask("עצירת חירום", "המכונה תושבת מיידית וכל הפעילות תיעצר בהדמיה.", ()=>setMachine("fault"), true)}>עצירת חירום<small>עצירה מיידית מלאה</small></button>
        </div></Card>

        <Card className="activity-card"><div className="section-head"><div><h2>פעילות מסחר</h2><p>התפלגות לפי ימים</p></div><div className="legend"><span><i className="lg-win"/>רווחיות</span><span><i className="lg-loss"/>הפסדיות</span><span><i className="lg-skip"/>ללא כניסה</span></div></div><ActivityChart/><div className="stats-grid">{mock.stats.map(([label,value])=><Metric key={label} label={label} value={value} tone={label === "רווח נקי" ? "positive" : ""}/>)}</div></Card>

        <Card className="log-card"><div className="section-head"><div><h2>יומן פעילות חי</h2><p>הפעולות האחרונות של המכונה</p></div><button className="text-button" onClick={()=>setDetails(v=>!v)}>{details ? "הסתר פרטים טכניים" : "הצג פרטים טכניים"}</button></div><div className="log-list">{mock.logs.map((log,i)=><div className={`log-row ${log.tone}`} key={i}><time>{log.time}</time><i/><div><b>{log.text}</b>{details&&<code>{log.detail}</code>}</div></div>)}</div></Card>
      </div>

      <Card className="health-card"><div className="section-head"><div><h2>בריאות המערכת</h2><p>מדדי תשתית בזמן אמת</p></div><span className="state-pill good"><StatusDot/>תקין</span></div><div className="health-grid"><div className="storage"><div><span>אחסון</span><b>{mock.systemHealth.storageUsed}GB מתוך {mock.systemHealth.storageTotal}GB</b></div><div className="progress"><i style={{width:`${mock.systemHealth.storageUsed/mock.systemHealth.storageTotal*100}%`}}/></div></div><Metric label="RAM" value={`${mock.systemHealth.ram}%`}/><Metric label="CPU" value={`${mock.systemHealth.cpu}%`}/><Metric label="זמן פעילות רציף" value={mock.systemHealth.uptime}/><Metric label="WebSocket" value={mock.systemHealth.websocket} tone="positive"/><Metric label="מסד נתונים" value={mock.systemHealth.database} tone="positive"/><Metric label="הנתון האחרון" value={mock.systemHealth.lastData}/><Metric label="זמן תגובה Polymarket" value={mock.systemHealth.latency}/></div></Card>
      <footer>Polymarket Robot · נתוני הדגמה בלבד · אין פעולות מסחר אמיתיות</footer>
    </div>

    {modal && <div className="modal-backdrop" role="presentation" onMouseDown={()=>setModal(null)}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={e=>e.stopPropagation()}><div className={`modal-symbol ${modal.danger?"danger":""}`}>{modal.danger?"!":"✓"}</div><h2 id="modal-title">{modal.title}</h2><p>{modal.body}</p><div><button className="button secondary" onClick={()=>setModal(null)}>ביטול</button><button className={`button ${modal.danger?"danger-solid":"primary"}`} onClick={perform}>אישור</button></div></div></div>}
    {toast && <div className="toast"><StatusDot/>{toast}</div>}
  </main>;
}
