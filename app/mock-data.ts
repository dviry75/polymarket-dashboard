export type MachineStatus = "active" | "paused" | "disabled" | "fault";

export const wallet = {
  total: 184.72,
  available: 179.72,
  committed: 5,
  todayProfit: 3.41,
  todayPercent: 1.88,
};

export const event = {
  name: "Bitcoin Up or Down – 5 Minutes",
  range: "22:15–22:20",
  secondsLeft: 97,
  yes: 0.74,
  no: 0.26,
  strategy: "ממתין לכניסה",
  lock: "האירוע עדיין פתוח לכניסה",
};

export const position = {
  side: "YES",
  entry: 0.74,
  tokens: 6.53,
  invested: 5,
  current: 5.22,
  pnl: 0.22,
  takeProfit: 0.96,
  stopLoss: "ממתין",
  order: "SELL GTC @ 0.96",
};

export const balanceHistory = [
  { label: "18:05", balance: 178.4, pnl: 0.42, side: "YES", entry: 0.74, exit: 0.89 },
  { label: "18:20", balance: 179.1, pnl: 0.7, side: "NO", entry: 0.74, exit: 0.94 },
  { label: "18:55", balance: 178.78, pnl: -0.32, side: "YES", entry: 0.74, exit: 0.63 },
  { label: "19:10", balance: 180.02, pnl: 1.24, side: "NO", entry: 0.74, exit: 0.96 },
  { label: "19:45", balance: 180.86, pnl: 0.84, side: "YES", entry: 0.74, exit: 0.93 },
  { label: "20:15", balance: 180.48, pnl: -0.38, side: "NO", entry: 0.74, exit: 0.61 },
  { label: "20:50", balance: 181.63, pnl: 1.15, side: "YES", entry: 0.74, exit: 0.96 },
  { label: "21:05", balance: 182.45, pnl: 0.82, side: "YES", entry: 0.74, exit: 0.91 },
  { label: "21:35", balance: 182.2, pnl: -0.25, side: "NO", entry: 0.74, exit: 0.65 },
  { label: "21:55", balance: 183.14, pnl: 0.94, side: "YES", entry: 0.74, exit: 0.94 },
  { label: "22:10", balance: 184.72, pnl: 1.58, side: "NO", entry: 0.74, exit: 0.96 },
];

export const dailyActivity = [
  { day: "ש׳", wins: 6, losses: 1, skipped: 3 },
  { day: "א׳", wins: 5, losses: 2, skipped: 2 },
  { day: "ב׳", wins: 3, losses: 2, skipped: 5 },
  { day: "ג׳", wins: 4, losses: 1, skipped: 4 },
  { day: "ד׳", wins: 5, losses: 2, skipped: 3 },
  { day: "ה׳", wins: 4, losses: 2, skipped: 4 },
  { day: "ו׳", wins: 4, losses: 1, skipped: 5 },
];

export const stats = [
  ["סך העסקאות", "42"], ["עסקאות רווחיות", "31"], ["עסקאות הפסדיות", "11"],
  ["אחוז הצלחה", "73.8%"], ["רווח ממוצע", "$0.41"], ["הפסד ממוצע", "$0.29"],
  ["רווח נקי", "+$9.52"], ["סך העמלות", "$3.16"],
];

export const logs = [
  { time: "22:19:41", text: "העסקה נסגרה בהצלחה", tone: "success", detail: "Fill confirmed · 6.53 tokens · realized P&L +$1.58" },
  { time: "22:17:23", text: "פקודת Take Profit הוצבה", tone: "success", detail: "SELL GTC · 6.53 YES @ 0.96" },
  { time: "22:17:23", text: "נרכשו 6.53 טוקנים", tone: "success", detail: "BUY FAK · average fill 0.74" },
  { time: "22:17:22", text: "פקודת כניסה נשלחה", tone: "info", detail: "BUY FAK @ 0.76 · budget $5.00 all-in" },
  { time: "22:17:22", text: "מחיר YES הגיע ל־0.74", tone: "warning", detail: "Trigger matched · event locked to YES" },
  { time: "22:17:01", text: "חלון הכניסה נפתח", tone: "info", detail: "120 seconds remaining · strategy eligible" },
  { time: "22:14:03", text: "אירוע חדש זוהה", tone: "info", detail: "btc-updown-5m · market data ready" },
];

export const alerts = [
  { id: 1, severity: "warning", title: "הנתונים התעכבו לרגע", body: "נמדד עיכוב של 1.4 שניות. החיבור חזר לפעילות תקינה." },
];

export const systemHealth = {
  storageUsed: 6.2,
  storageTotal: 20,
  ram: 42,
  cpu: 18,
  uptime: "12 ימים, 4 שעות",
  websocket: "מחובר",
  database: "תקין",
  lastData: "לפני 120ms",
  latency: "84ms",
};
