// Owner-only endpoint: the Confirm/Decline buttons in Ryan's notification
// emails link here. Action-keyed by ?action=confirm|cancel&id=<id>&key=<ADMIN_KEY>.
//
// - confirm: moves a pending booking → confirmed (slot becomes taken, blocking
//            the duration window of that service plus a buffer)
// - cancel:  removes a booking from either pending or confirmed (slot frees up)
//
// Confirmed bookings are keyed by their booking id. The blob value contains
// preferred_date / preferred_time / service so availability and conflict
// checks can compute the time window for each.

import { getStore } from "@netlify/blobs";
import { bookingWindow, rangesOverlap, isFlexibleTime } from "./_services.mjs";

export default async (req) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const id = url.searchParams.get("id");
  const key = url.searchParams.get("key");

  const validKeys = [process.env.ADMIN_KEY, process.env.ADMIN_PASSWORD].filter(Boolean);
  if (!validKeys.length) return page("Server misconfigured", "Missing ADMIN_KEY env var.", "error");
  if (!validKeys.includes(key)) return page("Unauthorized", "This link is missing or has the wrong key.", "error", 401);
  if (!id) return page("Bad request", "Missing booking id.", "error", 400);
  if (!["confirm", "cancel"].includes(action))
    return page("Bad request", "Unknown action.", "error", 400);

  const pending = getStore("pending-bookings");
  const confirmed = getStore("confirmed-bookings");

  if (action === "confirm") return handleConfirm({ id, pending, confirmed });
  if (action === "cancel") return handleCancel({ id, pending, confirmed });
};

async function handleConfirm({ id, pending, confirmed }) {
  // Already confirmed? Idempotent response.
  const alreadyConfirmed = await confirmed.get(id, { type: "json" });
  if (alreadyConfirmed) {
    return page(
      "Already confirmed",
      `${alreadyConfirmed.name} (${alreadyConfirmed.vehicle}) on ${alreadyConfirmed.preferred_date} at ${alreadyConfirmed.preferred_time}.`,
      "info",
    );
  }

  const booking = await pending.get(id, { type: "json" });
  if (!booking) {
    return page(
      "Not found",
      "No pending booking with that id. It may have been cancelled, or already confirmed elsewhere.",
      "error",
      404,
    );
  }

  // Overlap check: does this booking's time window collide with any other
  // confirmed booking on the same date? (Excludes itself.)
  const window = bookingWindow(booking);
  if (window && !isFlexibleTime(booking.preferred_time)) {
    const { blobs } = await confirmed.list();
    const records = await Promise.all(
      blobs.map(async (b) => ({ key: b.key, value: await confirmed.get(b.key, { type: "json" }) })),
    );
    for (const { key, value } of records) {
      if (!value || key === id) continue;
      if (value.preferred_date !== booking.preferred_date) continue;
      const w = bookingWindow(value);
      if (!w) continue;
      if (rangesOverlap(window, w)) {
        return page(
          "Slot already taken",
          `That window overlaps with a confirmed booking for ${value.name} (${value.vehicle}) on ${value.preferred_date} at ${value.preferred_time}. Decline this request and text the customer to reschedule.`,
          "warn",
          409,
        );
      }
    }
  }

  const confirmedBooking = {
    ...booking,
    id,
    confirmedAt: new Date().toISOString(),
  };
  await confirmed.set(id, JSON.stringify(confirmedBooking));
  await pending.delete(id);

  const cancelHref = actionLink("cancel", id);
  const statusLine = window
    ? `Slot is now blocked on the public form (window: ${formatWindow(window)}).`
    : `This is a flexible-time booking — it will <b>not</b> block other times on the form. Text the customer to lock in a real time, then handle conflicts manually.`;
  return page(
    "Confirmed ✓",
    bookingSummaryHtml(confirmedBooking) +
      `<p style="margin:24px 0 0;color:#a1a4ac;font-size:14px;line-height:1.6">${statusLine} If you need to undo this, <a href="${cancelHref}" style="color:#c9a44c;text-decoration:none">cancel it here</a> — bookmark this page or save this email so you can find the link again.</p>`,
    "success",
  );
}

async function handleCancel({ id, pending, confirmed }) {
  const pendingBooking = await pending.get(id, { type: "json" });
  if (pendingBooking) {
    await pending.delete(id);
    return page(
      "Declined",
      `Pending request from ${pendingBooking.name} removed. The slot was never blocked, so no calendar change.`,
      "info",
    );
  }

  // Direct lookup first. Falls back to iterating + matching by record.id so
  // we can still cancel legacy bookings stored under their old `date|time`
  // key (pre-id-key schema).
  let confirmedKey = id;
  let confirmedBooking = await confirmed.get(id, { type: "json" });
  if (!confirmedBooking) {
    const found = await findConfirmedById(confirmed, id);
    if (found) {
      confirmedKey = found.slotKey;
      confirmedBooking = found.booking;
    }
  }
  if (!confirmedBooking) {
    return page("Not found", "No booking with that id.", "error", 404);
  }
  await confirmed.delete(confirmedKey);
  return page(
    "Cancelled",
    `Confirmed booking for ${confirmedBooking.name} cancelled. ${confirmedBooking.preferred_date} at ${confirmedBooking.preferred_time} is open again.`,
    "info",
  );
}

function actionLink(action, id) {
  const base = process.env.URL || "";
  const key = encodeURIComponent(process.env.ADMIN_KEY || "");
  return `${base}/.netlify/functions/booking-action?action=${action}&id=${encodeURIComponent(id)}&key=${key}`;
}

function formatWindow(w) {
  if (!w) return "flexible";
  return `${formatMinutes(w.start)} – ${formatMinutes(w.end)}`;
}

function formatMinutes(m) {
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(min).padStart(2, "0")} ${ampm}`;
}

function bookingSummaryHtml(b) {
  const rows = [
    ["Customer", `${b.name} · ${b.phone} · ${b.email}`],
    ["Vehicle", `${b.vehicle} (${b.vehicle_size})`],
    ["Service", b.service],
    ["Time", `${b.preferred_date} at ${b.preferred_time}`],
    ["Address", b.address],
    Array.isArray(b.addons) && b.addons.length ? ["Add-ons", b.addons.join(", ")] : null,
    b.utilities ? ["Power/water", b.utilities] : null,
    b.notes ? ["Notes", b.notes] : null,
  ].filter(Boolean);
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;margin:8px 0">` +
    rows
      .map(
        ([k, v], i) =>
          `<tr><td style="${i === 0 ? "" : "border-top:1px solid #20242c;"}padding:12px 16px 12px 0;color:#6b6e76;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;font-weight:500;vertical-align:top;white-space:nowrap">${escapeHtml(k)}</td><td style="${i === 0 ? "" : "border-top:1px solid #20242c;"}padding:12px 0;color:#f3f3f4;font-size:15px;vertical-align:top">${escapeHtml(v)}</td></tr>`,
      )
      .join("") +
    `</table>`
  );
}

function page(title, body, kind = "info", status = 200) {
  const accent =
    kind === "success" ? "#65d18d" : kind === "warn" ? "#e0a04a" : kind === "error" ? "#e07b7b" : "#c9a44c";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${escapeHtml(title)} — Envoke Detailing</title>
<style>
  body{margin:0;background:#08090b;color:#f3f3f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased}
  a:hover{opacity:0.8}
</style>
</head>
<body>
  <div style="max-width:600px;margin:0 auto;padding:48px 24px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:32px">
      <span style="color:#c9a44c;font-size:14px">◆</span>
      <span style="color:#f3f3f4;font-weight:600;font-size:15px;letter-spacing:-0.01em">Envoke Detailing</span>
    </div>
    <div style="background:#101216;border:1px solid #20242c;border-radius:18px;padding:32px">
      <p style="margin:0 0 8px;color:${accent};font-size:11px;text-transform:uppercase;letter-spacing:0.18em;font-weight:500">${escapeHtml(kind)}</p>
      <h1 style="margin:0 0 18px;color:#f3f3f4;font-size:26px;font-weight:600;letter-spacing:-0.025em;line-height:1.2">${escapeHtml(title)}</h1>
      <div style="color:#a1a4ac;font-size:15px;line-height:1.6">${body}</div>
    </div>
    <p style="margin:24px 0 0;color:#6b6e76;font-size:13px;text-align:center">Mobile detailing · Central Columbus, OH</p>
  </div>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}
