import { getStore } from "@netlify/blobs";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { smsConfigured, normalizePhone } from "../lib/sms.mjs";

export const config = { path: ["/api/bookings", "/api/admin"] };

const OPEN_DOW = [2, 3, 4, 5]; // Tue-Fri
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const pad = (n) => String(n).padStart(2, "0");

function validSlots() {
  const out = [];
  for (let t = 9 * 60; t + 15 <= 12 * 60; t += 15) out.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
  for (let t = 12 * 60; t + 20 <= 17 * 60; t += 20) out.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
  return out;
}
const SLOTS = validSlots();
const DAYS_AHEAD = 7; // rolling window: today up to the same weekday next week

function addDays(s, n) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function nzToday() {
  const p = {};
  new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date()).forEach((x) => (p[x.type] = x.value));
  return `${p.year}-${p.month}-${p.day}`;
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const validDate = (d) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || "")) return false;
  const [y, m, day] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  return dt.getUTCMonth() === m - 1 && OPEN_DOW.includes(dt.getUTCDay());
};

// ---------- admin PIN ----------
// The PIN is set from the admin page the first time it is opened and stored
// as a salted hash. If an ADMIN_PIN environment variable exists in Netlify,
// that takes priority instead.
const settings = () => getStore({ name: "settings", consistency: "strong" });
const hashPin = (pin, salt) => scryptSync(pin, salt, 32).toString("hex");
const safeEqual = (a, b) => {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  return A.length === B.length && timingSafeEqual(A, B);
};
const validNewPin = (p) => typeof p === "string" && p.length >= 4 && p.length <= 40;

async function pinIsSet() {
  if (process.env.ADMIN_PIN) return true;
  return !!(await settings().get("admin", { type: "json" }));
}

async function checkPin(pin) {
  if (!pin) return false;
  if (process.env.ADMIN_PIN) return safeEqual(pin, process.env.ADMIN_PIN);
  const v = await settings().get("admin", { type: "json" });
  if (!v) return false;
  return safeEqual(hashPin(String(pin), v.salt), v.hash);
}

// Returns { ok: true } or { resp } (a ready-made error response).
// Five wrong PINs from one address locks that address out for 15 minutes.
async function authorize(req) {
  const ip = (req.headers.get("x-nf-client-connection-ip") || "unknown").replace(/[^a-zA-Z0-9.:_-]/g, "_");
  const key = `lock/${ip}`;
  const st = settings();
  const rec = await st.get(key, { type: "json" });
  const now = Date.now();
  const active = rec && now - rec.first < LOCK_MS;
  if (active && rec.count >= MAX_FAILS) return { resp: json({ error: "Too many wrong PINs. Try again in 15 minutes." }, 429) };
  if (await checkPin(req.headers.get("x-admin-pin"))) {
    if (rec) await st.delete(key);
    return { ok: true };
  }
  const next = active ? rec : { count: 0, first: now };
  next.count++;
  await st.setJSON(key, next);
  return { resp: json({ error: "Unauthorized" }, 401) };
}

async function readBody(req) {
  try { return await req.json(); } catch { return null; }
}

async function handleAdmin(req) {
  if (req.method === "GET") return json({ pinSet: await pinIsSet(), managedByNetlify: !!process.env.ADMIN_PIN });

  if (req.method === "POST") {
    const body = await readBody(req);
    if (!body) return json({ error: "Bad request" }, 400);
    const st = settings();

    if (body.action === "setup") {
      if (await pinIsSet()) return json({ error: "A PIN is already set." }, 403);
      if (!validNewPin(body.pin)) return json({ error: "PIN must be 4 to 40 characters." }, 400);
      const salt = randomBytes(16).toString("hex");
      await st.setJSON("admin", { salt, hash: hashPin(body.pin, salt), updatedAt: new Date().toISOString() });
      return json({ ok: true }, 201);
    }

    if (body.action === "change") {
      if (process.env.ADMIN_PIN) return json({ error: "Your PIN is managed in Netlify (ADMIN_PIN). Remove that variable to change it here." }, 400);
      const auth = await authorize(req);
      if (!auth.ok) return auth.resp;
      if (!validNewPin(body.pin)) return json({ error: "PIN must be 4 to 40 characters." }, 400);
      const salt = randomBytes(16).toString("hex");
      await st.setJSON("admin", { salt, hash: hashPin(body.pin, salt), updatedAt: new Date().toISOString() });
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  }
  return json({ error: "Method not allowed" }, 405);
}

// ---------- bookings ----------
async function handleBookings(req) {
  const store = getStore({ name: "bookings", consistency: "strong" });
  const url = new URL(req.url);

  if (req.method === "GET") {
    // Public: tells the booking page whether to offer text reminders
    if (url.searchParams.get("config") === "1") return json({ sms: smsConfigured() });
    // Admin: list everything with names
    if (url.searchParams.get("all") === "1") {
      const auth = await authorize(req);
      if (!auth.ok) return auth.resp;
      const { blobs } = await store.list();
      const rows = [];
      for (const b of blobs) {
        const v = await store.get(b.key, { type: "json" });
        const [date, time] = b.key.split("/");
        if (v) rows.push({ date, time, name: v.name, phone: v.phone || "", sms: !!v.sms, reminded: !!v.reminded });
      }
      rows.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      return json({ bookings: rows.filter((r) => r.date >= nzToday()), today: nzToday() });
    }
    // Public: only which times are taken (no names)
    const date = url.searchParams.get("date");
    if (!validDate(date)) return json({ error: "Bad date" }, 400);
    const { blobs } = await store.list({ prefix: `${date}/` });
    return json({ booked: blobs.map((b) => b.key.split("/")[1]) });
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    if (!body) return json({ error: "Bad request" }, 400);
    const { date, time } = body;
    const name = String(body.name || "").trim().slice(0, 60);
    const phone = String(body.phone || "").trim().slice(0, 30);
    const wantSms = body.sms === true;
    let smsTo = null;
    if (wantSms) {
      if (!smsConfigured()) return json({ error: "Text reminders are not available right now." }, 400);
      smsTo = normalizePhone(phone);
      if (!smsTo) return json({ error: "Please enter a valid mobile number so we can text you." }, 400);
    }
    if (!validDate(date) || !SLOTS.includes(time) || name.length < 2) return json({ error: "Invalid booking" }, 400);
    if (date < nzToday()) return json({ error: "Date in the past" }, 400);
    if (date > addDays(nzToday(), DAYS_AHEAD)) return json({ error: "Bookings open one week ahead" }, 400);
    // Fridays are mornings only
    const [fy, fm, fd] = date.split("-").map(Number);
    if (new Date(Date.UTC(fy, fm - 1, fd)).getUTCDay() === 5 && time >= "12:00") return json({ error: "Fridays are mornings only" }, 400);
    const key = `${date}/${time}`;
    // Quick check first so a taken slot is rejected even if the library ignores onlyIfNew
    const existing = await store.get(key);
    if (existing !== null && existing !== undefined) return json({ error: "Slot taken" }, 409);
    // onlyIfNew stops two people grabbing the same slot at the same instant.
    // Some library versions return nothing here, so only treat an explicit
    // modified:false as "taken"; anything else means the write succeeded.
    const record = { name, phone, createdAt: new Date().toISOString(), ...(wantSms ? { sms: true, smsTo } : {}) };
    const result = await store.setJSON(key, record, { onlyIfNew: true });
    if (result && result.modified === false) return json({ error: "Slot taken" }, 409);
    return json({ ok: true }, 201);
  }

  if (req.method === "DELETE") {
    const auth = await authorize(req);
    if (!auth.ok) return auth.resp;
    const body = await readBody(req);
    if (!body) return json({ error: "Bad request" }, 400);
    if (!validDate(body.date) || !SLOTS.includes(body.time)) return json({ error: "Invalid" }, 400);
    await store.delete(`${body.date}/${body.time}`);
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
}

export default async (req) => {
  try {
    const path = new URL(req.url).pathname;
    return path === "/api/admin" ? await handleAdmin(req) : await handleBookings(req);
  } catch (e) {
    console.error("bookings error:", e);
    return json({ error: "Server error", detail: String((e && e.message) || e) }, 500);
  }
};
