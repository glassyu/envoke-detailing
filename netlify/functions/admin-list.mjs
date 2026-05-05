// Owner-only endpoint: returns all pending + confirmed bookings as JSON,
// for the admin dashboard to render.
//
// Auth: ADMIN_KEY or ADMIN_PASSWORD via ?key= or POST body.
//
// Response:
// {
//   ok: true,
//   pending: [<bookingRecord>, ...],
//   confirmed: [<bookingRecord>, ...]
// }
// Both arrays sorted by preferred_date asc, then preferred_time asc.

import { getStore } from "@netlify/blobs";
import { timeToMinutes } from "./_services.mjs";

export default async (req) => {
  const url = new URL(req.url);
  let key = url.searchParams.get("key");
  if (!key && req.method === "POST") {
    try {
      const body = await req.json();
      key = body.key;
    } catch { /* ignore */ }
  }

  const validKeys = [process.env.ADMIN_KEY, process.env.ADMIN_PASSWORD].filter(Boolean);
  if (!validKeys.length) return json({ ok: false, error: "Server misconfigured" }, 500);
  if (!validKeys.includes(key)) return json({ ok: false, error: "Unauthorized" }, 401);

  const pendingStore = getStore("pending-bookings");
  const confirmedStore = getStore("confirmed-bookings");

  const [pending, confirmed] = await Promise.all([
    listAll(pendingStore),
    listAll(confirmedStore),
  ]);

  return json({
    ok: true,
    pending: sortBookings(pending),
    confirmed: sortBookings(confirmed),
  });
};

async function listAll(store) {
  try {
    const { blobs } = await store.list();
    const records = await Promise.all(
      blobs.map(async (b) => {
        try {
          return await store.get(b.key, { type: "json" });
        } catch {
          return null;
        }
      }),
    );
    return records.filter(Boolean);
  } catch (err) {
    console.error("listAll failed:", err);
    return [];
  }
}

function sortBookings(arr) {
  return arr.slice().sort((a, b) => {
    const ad = a.preferred_date || "";
    const bd = b.preferred_date || "";
    if (ad !== bd) return ad < bd ? -1 : 1;
    const at = timeToMinutes(a.preferred_time) ?? 9999;
    const bt = timeToMinutes(b.preferred_time) ?? 9999;
    return at - bt;
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
