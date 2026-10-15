import { getStore } from "@netlify/blobs";

export const config = { path: "/api/bookings" };

const OPEN_DOW = [2, 3, 4, 5]; // Tue-Fri
const pad = (n) => String(n).padStart(2, "0");

function validSlots() {
  const out = [];
  for (let t = 9 * 60; t + 15 <= 12 * 60; t += 15) out.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
  for (let t = 13 * 60; t + 20 <= 16 * 60 + 30; t += 20) out.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
  return out;
}
const SLOTS = validSlots();

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

const isAdmin = (req) => {
  const pin = process.env.ADMIN_PIN;
  return !!pin && req.headers.get("x-admin-pin") === pin;
};

export default async (req) => {
  try {
    return await handle(req);
  } catch (e) {
    console.error("bookings error:", e);
    return json({ error: "Server error", detail: String((e && e.message) || e) }, 500);
  }
};

async function handle(req) {
  const store = getStore({ name: "bookings", consistency: "strong" });
  const url = new URL(req.url);

  if (req.method === "GET") {
    // Admin: list everything with names
    if (url.searchParams.get("all") === "1") {
      if (!isAdmin(req)) return json({ error: "Unauthorized" }, 401);
      const { blobs } = await store.list();
      const rows = [];
      for (const b of blobs) {
        const v = await store.get(b.key, { type: "json" });
        const [date, time] = b.key.split("/");
        if (v) rows.push({ date, time, name: v.name, phone: v.phone || "" });
      }
      rows.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      return json({ bookings: rows.filter((r) => r.date >= nzToday()) });
    }
    // Public: only which times are taken (no names)
    const date = url.searchParams.get("date");
    if (!validDate(date)) return json({ error: "Bad date" }, 400);
    const { blobs } = await store.list({ prefix: `${date}/` });
    return json({ booked: blobs.map((b) => b.key.split("/")[1]) });
  }

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
    const { date, time } = body;
    const name = String(body.name || "").trim().slice(0, 60);
    const phone = String(body.phone || "").trim().slice(0, 30);
    if (!validDate(date) || !SLOTS.includes(time) || name.length < 2) return json({ error: "Invalid booking" }, 400);
    if (date < nzToday()) return json({ error: "Date in the past" }, 400);
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
    const result = await store.setJSON(key, { name, phone, createdAt: new Date().toISOString() }, { onlyIfNew: true });
    if (result && result.modified === false) return json({ error: "Slot taken" }, 409);
    return json({ ok: true }, 201);
  }

  if (req.method === "DELETE") {
    if (!isAdmin(req)) return json({ error: "Unauthorized" }, 401);
    let body;
    try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
    if (!validDate(body.date) || !SLOTS.includes(body.time)) return json({ error: "Invalid" }, 400);
    await store.delete(`${body.date}/${body.time}`);
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
}
