// Public endpoint: returns the busy-time windows so the booking form can
// disable conflicting time options based on the customer's chosen service.
//
// Confirmed bookings are now keyed by their booking id (not date|time) so
// multiple bookings can exist on the same day without key collisions.
//
// Response:
// {
//   busy: [{ date: "YYYY-MM-DD", start: <minutes>, end: <minutes> }],
//   durations: { "<service>": <minutes>, ... },
//   bufferMin: 30
// }

import { getStore } from "@netlify/blobs";
import {
  SERVICE_DURATIONS_MIN,
  BUFFER_MIN,
  WORK_START_MIN,
  WORK_END_MIN,
  MIN_BOOKING_DATE,
  bookingWindow,
} from "./_services.mjs";

export default async () => {
  const confirmed = getStore("confirmed-bookings");
  const today = new Date().toISOString().split("T")[0];
  const busy = [];

  try {
    const { blobs } = await confirmed.list();
    const records = await Promise.all(
      blobs.map((b) => confirmed.get(b.key, { type: "json" })),
    );
    for (const r of records) {
      if (!r || !r.preferred_date) continue;
      if (r.preferred_date < today) continue;
      const w = bookingWindow(r);
      if (!w) continue;
      busy.push({ date: r.preferred_date, start: w.start, end: w.end });
    }
  } catch (err) {
    console.error("availability list failed:", err);
  }

  return new Response(
    JSON.stringify({
      busy,
      durations: SERVICE_DURATIONS_MIN,
      bufferMin: BUFFER_MIN,
      workStartMin: WORK_START_MIN,
      workEndMin: WORK_END_MIN,
      minDate: MIN_BOOKING_DATE,
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
      },
    },
  );
};
