// Owner-only endpoint: the Confirm/Decline buttons in Ryan's notification
// emails link here. Action-keyed by ?action=confirm|cancel&id=<id>&key=<ADMIN_KEY>.
//
// - confirm: moves a pending booking → confirmed (slot becomes taken)
// - cancel:  removes a booking from either pending or confirmed (slot frees up)
//
// Returns a self-contained dark-themed HTML page so Ryan gets a clear visual
// confirmation in the browser when he clicks the email button.

import { getStore } from "@netlify/blobs";

const SLOT_DELIM = "|";

export default async (req) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const id = url.searchParams.get("id");
  const key = url.searchParams.get("key");

  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) return page("Server misconfigured", "Missing ADMIN_KEY env var.", "error");
  if (key !== adminKey) return page("Unauthorized", "This link is missing or has the wrong key.", "error", 401);
  if (!id) return page("Bad request", "Missing booking id.", "error", 400);
  if (!["confirm", "cancel"].includes(action))
    return page("Bad request", "Unknown action.", "error", 400);

  const pending = getStore("pending-bookings");
  const confirmed = getStore("confirmed-bookings");

  if (action === "confirm") return handleConfirm({ id, pending, confirmed });
  if (action === "cancel") return handleCancel({ id, pending, confirmed });
};

async function handleConfirm({ id, pending, confirmed }) {
  const booking = await pending.get(id, { type: "json" });
  if (!booking) {
    // Maybe already confirmed? Look it up.
    const existingSlot = await findConfirmedById(confirmed, id);
    if (existingSlot) {
      return page(
        "Already confirmed",
        `${existingSlot.booking.name} (${existingSlot.booking.vehicle}) on ${existingSlot.booking.preferred_date} at ${existingSlot.booking.preferred_time}.`,
        "info",
      );
    }
    return page(
      "Not found",
      "No pending booking with that id. It may have been cancelled or already confirmed.",
      "error",
      404,
    );
  }

  const slotKey = `${booking.preferred_date}${SLOT_DELIM}${booking.preferred_time}`;
  const conflict = await confirmed.get(slotKey, { type: "json" });
  if (conflict && conflict.id !== id) {
    return page(
      "Slot already taken",
      `That slot is already confirmed for ${conflict.name} (${conflict.vehicle}). Decline this request and text the customer to reschedule.`,
      "warn",
      409,
    );
  }

  const confirmedBooking = {
    ...booking,
    id,
    confirmedAt: new Date().toISOString(),
  };
  await confirmed.set(slotKey, JSON.stringify(confirmedBooking));
  await pending.delete(id);

  const cancelHref = actionLink("cancel", id);
  return page(
    "Confirmed ✓",
    bookingSummaryHtml(confirmedBooking) +
      `<p style="margin:24px 0 0;color:#a1a4ac;font-size:14px;line-height:1.6">Slot is now blocked on the public form. If you need to undo this, <a href="${cancelHref}" style="color:#c9a44c;text-decoration:none">cancel it here</a> — bookmark this page or save this email so you can find the link again.</p>`,
    "success",
  );
}

async function handleCancel({ id, pending, confirmed }) {
  // Pending first.
  const pendingBooking = await pending.get(id, { type: "json" });
  if (pendingBooking) {
    await pending.delete(id);
    return page(
      "Declined",
      `Pending request from ${pendingBooking.name} removed. The slot was never blocked, so no calendar change.`,
      "info",
    );
  }

  // Otherwise look it up in confirmed.
  const found = await findConfirmedById(confirmed, id);
  if (!found) {
    return page("Not found", "No booking with that id.", "error", 404);
  }
  await confirmed.delete(found.slotKey);
  return page(
    "Cancelled",
    `Confirmed booking for ${found.booking.name} cancelled. ${found.booking.preferred_date} at ${found.booking.preferred_time} is open again.`,
    "info",
  );
}

async function findConfirmedById(confirmed, id) {
  const { blobs } = await confirmed.list();
  for (const b of blobs) {
    const booking = await confirmed.get(b.key, { type: "json" });
    if (booking && booking.id === id) {
      return { slotKey: b.key, booking };
    }
  }
  return null;
}

function actionLink(action, id) {
  // Caller is in Netlify, so process.env.URL is set to the site URL.
  const base = process.env.URL || "";
  const key = encodeURIComponent(process.env.ADMIN_KEY || "");
  return `${base}/.netlify/functions/booking-action?action=${action}&id=${encodeURIComponent(id)}&key=${key}`;
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
