// Public endpoint: returns the list of confirmed (taken) slots so the
// booking form can disable them in the time dropdown.
//
// Response: { slots: [{ date: "YYYY-MM-DD", time: "10:00 AM" }, ...] }
//
// Only date + time are exposed — no customer info. Past dates are filtered out.

import { getStore } from "@netlify/blobs";

export default async () => {
  const confirmed = getStore("confirmed-bookings");
  const today = new Date().toISOString().split("T")[0];
  const slots = [];

  try {
    const { blobs } = await confirmed.list();
    for (const blob of blobs) {
      const idx = blob.key.indexOf("|");
      if (idx === -1) continue;
      const date = blob.key.slice(0, idx);
      const time = blob.key.slice(idx + 1);
      if (date < today) continue;
      slots.push({ date, time });
    }
  } catch (err) {
    console.error("availability list failed:", err);
  }

  return new Response(JSON.stringify({ slots }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
};
