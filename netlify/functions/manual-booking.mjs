// Owner-only endpoint: create a confirmed booking directly, bypassing the
// public form. Used by /admin.html to block off time for direct-text customers,
// personal commitments, etc.
//
// Auth: ADMIN_KEY in the JSON body.
// Validates work hours, date floor, and overlap unless `force: true` is set.

import { getStore } from "@netlify/blobs";
import {
  bookingWindow,
  rangesOverlap,
  isFlexibleTime,
  timeToMinutes,
  WORK_START_MIN,
  WORK_END_MIN,
  MIN_BOOKING_DATE,
  durationFor,
} from "./_services.mjs";

export default async (req) => {
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) return json({ ok: false, error: "Server misconfigured" }, 500);
  if (body.key !== adminKey) return json({ ok: false, error: "Unauthorized" }, 401);

  const required = ["date", "time", "service"];
  for (const f of required) {
    if (!body[f] || String(body[f]).trim() === "") {
      return json({ ok: false, error: `Missing field: ${f}` }, 400);
    }
  }

  const date = String(body.date).trim();
  const time = String(body.time).trim();
  const service = String(body.service).trim();
  const durationMin =
    body.duration_min != null && body.duration_min !== ""
      ? Number(body.duration_min)
      : null;

  if (date < MIN_BOOKING_DATE) {
    return json(
      { ok: false, error: `Date must be ${MIN_BOOKING_DATE} or later.` },
      400,
    );
  }
  if (durationMin != null && (!Number.isFinite(durationMin) || durationMin <= 0)) {
    return json({ ok: false, error: "duration_min must be a positive number." }, 400);
  }

  const candidate = {
    preferred_date: date,
    preferred_time: time,
    service,
    duration_min: durationMin ?? undefined,
  };

  // Work-hours check (skipped for flexible).
  if (!isFlexibleTime(time)) {
    const start = timeToMinutes(time);
    if (start == null) {
      return json({ ok: false, error: "Invalid time format. Use '12:00 PM'." }, 400);
    }
    const dur = durationMin ?? durationFor(service);
    if (start < WORK_START_MIN) {
      return json({ ok: false, error: "Earliest start time is 9:00 AM." }, 400);
    }
    if (start + dur > WORK_END_MIN) {
      return json(
        { ok: false, error: "Service wouldn't finish by 8:00 PM." },
        400,
      );
    }
  }

  const confirmed = getStore("confirmed-bookings");

  // Overlap check (unless force=true).
  if (!body.force) {
    const candidateWindow = bookingWindow(candidate);
    if (candidateWindow) {
      const { blobs } = await confirmed.list();
      const records = await Promise.all(
        blobs.map((b) => confirmed.get(b.key, { type: "json" })),
      );
      for (const r of records) {
        if (!r || r.preferred_date !== date) continue;
        const w = bookingWindow(r);
        if (!w) continue;
        if (rangesOverlap(candidateWindow, w)) {
          return json(
            {
              ok: false,
              error: `Overlaps with ${r.name} (${r.service}) at ${r.preferred_time}. Cancel that booking first or pass force=true.`,
            },
            409,
          );
        }
      }
    }
  }

  const id = generateId();
  const record = {
    id,
    confirmedAt: new Date().toISOString(),
    requestedAt: new Date().toISOString(),
    name: trimOr(body.name, "Manual block"),
    email: trimOr(body.email, ""),
    phone: trimOr(body.phone, ""),
    vehicle: trimOr(body.vehicle, ""),
    vehicle_size: trimOr(body.vehicle_size, ""),
    service,
    preferred_date: date,
    preferred_time: time,
    backup_date: "",
    backup_time: "",
    address: trimOr(body.address, ""),
    utilities: trimOr(body.utilities, ""),
    notes: trimOr(body.notes, ""),
    addons: Array.isArray(body.addons)
      ? body.addons.map((a) => String(a).trim()).filter(Boolean)
      : [],
    duration_min: durationMin ?? undefined,
    manual: true,
  };

  await confirmed.set(id, JSON.stringify(record));
  return json({ ok: true, id, record });
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function trimOr(v, fallback) {
  if (v == null) return fallback;
  const s = String(v).trim();
  return s === "" ? fallback : s;
}

function generateId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
