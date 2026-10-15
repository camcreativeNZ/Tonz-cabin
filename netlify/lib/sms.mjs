// Shared helpers for text-message reminders (sent through Twilio) and NZ time handling.
// Used by netlify/functions/bookings.mjs and netlify/functions/send-reminders.mjs.

const NZ = "Pacific/Auckland";

// Text reminders only switch on when all three Netlify environment variables exist.
export function smsConfigured() {
  return !!(
    (process.env.TWILIO_ACCOUNT_SID || "").trim() &&
    (process.env.TWILIO_AUTH_TOKEN || "").trim() &&
    (process.env.TWILIO_FROM || "").trim()
  );
}

// Turns what a customer typed into an international number (E.164), or null if it
// doesn't look like a mobile we can text. NZ numbers must be mobiles (02x).
export function normalizePhone(raw) {
  let p = String(raw || "").trim().replace(/[\s\-().]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  else if (p.startsWith("0")) p = "+64" + p.slice(1);
  else if (/^64\d/.test(p)) p = "+" + p;
  if (!/^\+\d{8,15}$/.test(p)) return null;
  if (p.startsWith("+64") && !/^\+642\d{7,9}$/.test(p)) return null;
  return p;
}

// Sends one text through Twilio. Throws if Twilio rejects it.
// To use a different SMS company, replace the inside of this function only.
export async function sendSms(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID.trim();
  const token = process.env.TWILIO_AUTH_TOKEN.trim();
  const from = process.env.TWILIO_FROM.trim();
  const params = new URLSearchParams({ To: to, Body: body });
  if (/^MG[0-9a-f]{32}$/i.test(from)) params.set("MessagingServiceSid", from);
  else params.set("From", from);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  if (!res.ok) {
    let msg = "";
    try { msg = (await res.json()).message || ""; } catch { /* ignore */ }
    throw new Error(`Twilio ${res.status}: ${msg}`);
  }
}

// ---------- NZ time helpers ----------
function nzParts(ms) {
  const p = {};
  new Intl.DateTimeFormat("en-CA", {
    timeZone: NZ, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(ms)).forEach((x) => (p[x.type] = x.value));
  return p;
}

export function nzDateStr(ms) {
  const p = nzParts(ms);
  return `${p.year}-${p.month}-${p.day}`;
}

function nzOffsetMs(ms) {
  const p = nzParts(ms);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms;
}

// "2026-10-21" + "09:00" (New Zealand wall-clock time) -> real moment in time (ms since 1970).
export function nzToUtcMs(date, time) {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const asUtc = Date.UTC(y, m - 1, d, h, mi);
  let guess = asUtc - 13 * 3600e3;
  for (let i = 0; i < 2; i++) guess = asUtc - nzOffsetMs(guess);
  return guess;
}

export function addDays(s, n) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function fmtTime(t) {
  let h = +t.slice(0, 2);
  const mm = t.slice(3);
  const s = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${mm} ${s}`;
}
