import { getStore } from "@netlify/blobs";
import { smsConfigured, sendSms, nzToUtcMs, nzDateStr, addDays, fmtTime } from "../lib/sms.mjs";

// Runs every 15 minutes on the live site and texts customers who asked for a reminder.
export const config = { schedule: "*/15 * * * *" };

// How long before the appointment the text goes out. Change this number to alter it
// (the booking page wording in index.html says "2 hours before" too).
const REMIND_MINUTES_BEFORE = 120;

const ADDRESS = "197 Dixon Street, Masterton";

export default async () => {
  if (!smsConfigured()) {
    console.log("send-reminders: SMS not configured, nothing to do");
    return new Response("SMS not configured");
  }

  const store = getStore({ name: "bookings", consistency: "strong" });
  const now = Date.now();
  const today = nzDateStr(now);
  let sent = 0, failed = 0;

  for (const day of [today, addDays(today, 1)]) {
    const { blobs } = await store.list({ prefix: `${day}/` });
    for (const b of blobs) {
      const v = await store.get(b.key, { type: "json" });
      if (!v || !v.sms || !v.smsTo || v.reminded) continue;

      const [date, time] = b.key.split("/");
      const start = nzToUtcMs(date, time);
      if (now >= start) continue; // appointment already started
      if (now < start - REMIND_MINUTES_BEFORE * 60000) continue; // too early

      const first = String(v.name || "").trim().split(/\s+/)[0].slice(0, 20) || "there";
      const when = date === today ? "today" : "tomorrow";
      const text = `Hi ${first}, reminder: your haircut at Tonz Cabin is ${when} at ${fmtTime(time)}. ${ADDRESS}. See you soon!`;

      try {
        await sendSms(v.smsTo, text);
        // Make sure the booking wasn't cancelled while we were sending, then mark it done.
        const still = await store.get(b.key, { type: "json" });
        if (still) await store.setJSON(b.key, { ...still, reminded: true, remindedAt: new Date().toISOString() });
        sent++;
      } catch (e) {
        failed++;
        console.error(`send-reminders: could not text for ${b.key}:`, e && e.message);
      }
    }
  }

  console.log(`send-reminders: sent ${sent}, failed ${failed}`);
  return new Response(JSON.stringify({ sent, failed }), { headers: { "Content-Type": "application/json" } });
};
