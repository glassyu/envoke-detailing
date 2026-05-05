// Netlify Function: receives the booking form, sends two emails via Resend.
//
// Required Netlify env vars:
//   RESEND_API_KEY  — from resend.com/api-keys
//   RESEND_FROM     — verified sender, e.g. "Envoke Detailing <bookings@envokedetailing.com>"
//                      (during testing without a verified domain, set to "onboarding@resend.dev"
//                       — only delivers to your own verified Resend account email)
//   OWNER_EMAIL     — where booking notifications go (defaults to rsabdon@gmail.com)
//   OWNER_PHONE     — shown in confirmation email (defaults to 380-222-1158)

const RESEND_ENDPOINT = "https://api.resend.com/emails";

const REQUIRED_FIELDS = [
  "name",
  "phone",
  "email",
  "vehicle",
  "vehicle_size",
  "service",
  "preferred_date",
  "preferred_time",
  "address",
];

export default async (req) => {
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  let data;
  try {
    data = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  // Honeypot — silently accept bot submissions without sending anything.
  if (data["bot-field"]) return json({ ok: true });

  for (const f of REQUIRED_FIELDS) {
    if (!data[f] || String(data[f]).trim() === "") {
      return json({ ok: false, error: `Missing required field: ${f}` }, 400);
    }
  }

  if (!isEmail(data.email)) {
    return json({ ok: false, error: "Invalid email" }, 400);
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    console.error("Missing RESEND_API_KEY or RESEND_FROM");
    return json({ ok: false, error: "Email service not configured" }, 500);
  }
  const ownerEmail = process.env.OWNER_EMAIL || "rsabdon@gmail.com";
  const ownerPhone = process.env.OWNER_PHONE || "380-222-1158";

  const addons = normalizeAddons(data.addons);
  const summary = buildSummary(data, addons);
  const firstName = String(data.name).trim().split(/\s+/)[0];

  const ownerEmailReq = sendEmail(apiKey, {
    from,
    to: ownerEmail,
    reply_to: data.email,
    subject: `New booking — ${data.name} · ${data.vehicle}`,
    text: buildOwnerText(data, summary),
    html: buildOwnerHtml(data, summary),
  });

  const customerEmailReq = sendEmail(apiKey, {
    from,
    to: data.email,
    reply_to: ownerEmail,
    subject: "We got your request — Envoke Detailing",
    text: buildCustomerText(firstName, data, summary, ownerPhone, ownerEmail),
    html: buildCustomerHtml(firstName, data, summary, ownerPhone, ownerEmail),
  });

  // Owner email is critical; customer email is nice-to-have.
  const [ownerResult, customerResult] = await Promise.allSettled([
    ownerEmailReq,
    customerEmailReq,
  ]);

  if (ownerResult.status === "rejected") {
    console.error("Owner email failed:", ownerResult.reason);
    return json(
      { ok: false, error: "Could not deliver booking. Please call or text 380-222-1158." },
      502,
    );
  }
  if (customerResult.status === "rejected") {
    console.warn("Customer confirmation email failed:", customerResult.reason);
    // Still return success — owner got it.
  }

  return json({ ok: true });
};

// ---------- helpers ----------

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s));
}

function normalizeAddons(addons) {
  if (Array.isArray(addons)) return addons.filter(Boolean);
  if (typeof addons === "string" && addons.trim()) return [addons];
  return [];
}

async function sendEmail(apiKey, payload) {
  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body}`);
  }
  return res.json();
}

function buildSummary(d, addons) {
  return [
    ["Service", d.service],
    ["Vehicle", `${d.vehicle} (${d.vehicle_size})`],
    ["Address", d.address],
    ["Preferred", `${d.preferred_date} at ${d.preferred_time}`],
    d.backup_date ? ["Backup", `${d.backup_date} at ${d.backup_time || "—"}`] : null,
    ["Add-ons", addons.length ? addons.join(", ") : "none"],
    ["Power/water", d.utilities || "not specified"],
    ["Notes", d.notes || "—"],
  ].filter(Boolean);
}

function summaryToText(summary) {
  return summary.map(([k, v]) => `${k}: ${v}`).join("\n");
}

function summaryToHtml(summary) {
  const rows = summary
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#888;font-size:13px;text-transform:uppercase;letter-spacing:.05em;vertical-align:top;white-space:nowrap">${escapeHtml(k)}</td><td style="padding:6px 0;color:#111;font-size:15px;vertical-align:top">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  return `<table style="border-collapse:collapse;width:100%">${rows}</table>`;
}

function buildOwnerText(d, summary) {
  return `New booking request from ${d.name}

Contact:
  Email: ${d.email}
  Phone: ${d.phone}

${summaryToText(summary)}

Reply directly to this email to respond to ${d.name}.`;
}

function buildOwnerHtml(d, summary) {
  return wrapHtml(
    `<h2 style="margin:0 0 16px;font-size:20px">New booking request</h2>
     <p style="margin:0 0 20px;color:#333">From <b>${escapeHtml(d.name)}</b> · <a href="mailto:${escapeHtml(d.email)}">${escapeHtml(d.email)}</a> · <a href="tel:${escapeHtml(d.phone)}">${escapeHtml(d.phone)}</a></p>
     ${summaryToHtml(summary)}
     <p style="margin:24px 0 0;color:#666;font-size:13px">Reply directly to this email to respond to ${escapeHtml(d.name)}.</p>`,
  );
}

function buildCustomerText(firstName, d, summary, ownerPhone, ownerEmail) {
  return `Hi ${firstName},

Thanks for the booking request — I got it.

I'll review and text you at ${d.phone} within a few hours to confirm the time and quote you a price. No charge until the work is done.

Here's what you sent me:

${summaryToText(summary)}

If anything's wrong, just reply to this email or text me at ${ownerPhone}.

— Ryan
Envoke Detailing
${ownerPhone}
${ownerEmail}`;
}

function buildCustomerHtml(firstName, d, summary, ownerPhone, ownerEmail) {
  return wrapHtml(
    `<h2 style="margin:0 0 16px;font-size:20px">Thanks, ${escapeHtml(firstName)} — I got your request.</h2>
     <p style="margin:0 0 16px;color:#333">I'll review and text you at <b>${escapeHtml(d.phone)}</b> within a few hours to confirm the time and quote you a price. No charge until the work is done.</p>
     <p style="margin:0 0 8px;color:#666;font-size:13px;text-transform:uppercase;letter-spacing:.06em">Your request</p>
     ${summaryToHtml(summary)}
     <p style="margin:24px 0 0;color:#333">If anything's wrong, reply to this email or text me at <a href="tel:${escapeHtml(ownerPhone)}">${escapeHtml(ownerPhone)}</a>.</p>
     <p style="margin:24px 0 0;color:#333">— Ryan<br><b>Envoke Detailing</b><br>${escapeHtml(ownerPhone)} · <a href="mailto:${escapeHtml(ownerEmail)}">${escapeHtml(ownerEmail)}</a></p>`,
  );
}

function wrapHtml(inner) {
  return `<!doctype html><html><body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;color:#111;line-height:1.55">${inner}</div></body></html>`;
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
