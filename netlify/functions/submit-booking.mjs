// Netlify Function: receives the booking form, sends two emails via Resend.
//
// No conflict checks, no storage, no pending state. Customer sends a request,
// owner gets notified, customer gets a confirmation. Owner replies/texts to
// lock in the time. Manual scheduling.
//
// Required Netlify env vars:
//   RESEND_API_KEY  — from resend.com/api-keys
//   RESEND_FROM     — verified sender, e.g. "Envoke Detailing <bookings@envokedetailing.com>"
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

const MIN_BOOKING_DATE = "2026-05-11";

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
  if (data.preferred_date < MIN_BOOKING_DATE) {
    return json(
      { ok: false, error: `Bookings start ${MIN_BOOKING_DATE}. Please pick that date or later.` },
      400,
    );
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
  const record = {
    name: String(data.name).trim(),
    email: String(data.email).trim(),
    phone: String(data.phone).trim(),
    vehicle: String(data.vehicle).trim(),
    vehicle_size: String(data.vehicle_size).trim(),
    service: String(data.service).trim(),
    preferred_date: String(data.preferred_date).trim(),
    preferred_time: String(data.preferred_time).trim(),
    backup_date: data.backup_date ? String(data.backup_date).trim() : "",
    backup_time: data.backup_time ? String(data.backup_time).trim() : "",
    address: String(data.address).trim(),
    utilities: data.utilities ? String(data.utilities).trim() : "",
    notes: data.notes ? String(data.notes).trim() : "",
    addons,
  };

  const summary = buildSummary(record, addons);
  const firstName = record.name.split(/\s+/)[0];

  const ownerEmailReq = sendEmail(apiKey, {
    from,
    to: ownerEmail,
    reply_to: record.email,
    subject: `New booking — ${record.name} · ${record.vehicle}`,
    text: buildOwnerText(record, summary),
    html: buildOwnerHtml(record, summary),
  });

  const customerEmailReq = sendEmail(apiKey, {
    from,
    to: record.email,
    reply_to: ownerEmail,
    subject: "We got your request — Envoke Detailing",
    text: buildCustomerText(firstName, record, summary, ownerPhone, ownerEmail),
    html: buildCustomerHtml(firstName, record, summary, ownerPhone, ownerEmail),
  });

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
      ([k, v], i) => {
        const borderTop = i === 0 ? "" : "border-top:1px solid #20242c;";
        return `<tr><td style="${borderTop}padding:12px 16px 12px 0;color:#6b6e76;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;font-weight:500;vertical-align:top;white-space:nowrap">${escapeHtml(k)}</td><td style="${borderTop}padding:12px 0;color:#f3f3f4;font-size:15px;vertical-align:top">${escapeHtml(v)}</td></tr>`;
      },
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;margin:8px 0">${rows}</table>`;
}

function buildOwnerText(d, summary) {
  return `New booking request from ${d.name}

Contact:
  Email: ${d.email}
  Phone: ${d.phone}

${summaryToText(summary)}

Reply directly to this email to respond to ${d.name}, or text them at ${d.phone}.`;
}

function buildOwnerHtml(d, summary) {
  return wrapHtml(
    `<p style="margin:0 0 8px;color:#c9a44c;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;font-weight:500">New booking</p>
     <h1 style="margin:0 0 18px;color:#f3f3f4;font-size:24px;font-weight:600;letter-spacing:-0.02em;line-height:1.2">${escapeHtml(d.name)} — ${escapeHtml(d.vehicle)}</h1>
     <p style="margin:0 0 24px;color:#a1a4ac;font-size:14px">
       <a href="mailto:${escapeHtml(d.email)}" style="color:#c9a44c;text-decoration:none">${escapeHtml(d.email)}</a>
       <span style="color:#3a3f47;margin:0 8px">·</span>
       <a href="tel:${escapeHtml(d.phone)}" style="color:#c9a44c;text-decoration:none">${escapeHtml(d.phone)}</a>
     </p>
     ${summaryToHtml(summary)}
     <p style="margin:24px 0 0;color:#6b6e76;font-size:13px;line-height:1.5">Reply directly to this email to talk to ${escapeHtml(d.name)}, or text them at ${escapeHtml(d.phone)}.</p>`,
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
    `<p style="margin:0 0 8px;color:#c9a44c;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;font-weight:500">Request received</p>
     <h1 style="margin:0 0 18px;color:#f3f3f4;font-size:26px;font-weight:600;letter-spacing:-0.025em;line-height:1.2">Thanks, ${escapeHtml(firstName)} — I got it.</h1>
     <p style="margin:0 0 28px;color:#a1a4ac;font-size:15px;line-height:1.6">I'll review your request and text you at <span style="color:#f3f3f4">${escapeHtml(d.phone)}</span> within a few hours to confirm the time and quote you a price. No charge until the work is done.</p>
     <p style="margin:0 0 4px;color:#c9a44c;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;font-weight:500">Your request</p>
     ${summaryToHtml(summary)}
     <p style="margin:28px 0 0;padding-top:24px;border-top:1px solid #20242c;color:#a1a4ac;font-size:14px;line-height:1.6">If anything's wrong, reply to this email or text me at <a href="tel:${escapeHtml(ownerPhone)}" style="color:#c9a44c;text-decoration:none">${escapeHtml(ownerPhone)}</a>.</p>
     <p style="margin:24px 0 0;color:#f3f3f4;font-size:14px;line-height:1.7">— Ryan<br><span style="color:#c9a44c;font-size:13px;letter-spacing:0.05em">◆</span> <span style="color:#f3f3f4;font-weight:600">Envoke Detailing</span><br><span style="color:#a1a4ac">${escapeHtml(ownerPhone)} · <a href="mailto:${escapeHtml(ownerEmail)}" style="color:#a1a4ac;text-decoration:none">${escapeHtml(ownerEmail)}</a></span></p>`,
  );
}

function wrapHtml(inner) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>Envoke Detailing</title>
</head>
<body style="margin:0;padding:0;background:#08090b;color:#f3f3f4;-webkit-font-smoothing:antialiased">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#08090b;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#101216;border:1px solid #20242c;border-radius:18px;overflow:hidden">
      <tr><td style="padding:24px 32px;border-bottom:1px solid #20242c">
        <span style="color:#c9a44c;font-size:14px;letter-spacing:0.05em">◆</span>
        <span style="color:#f3f3f4;font-weight:600;font-size:15px;letter-spacing:-0.01em;margin-left:8px;vertical-align:middle">Envoke Detailing</span>
      </td></tr>
      <tr><td style="padding:32px;color:#f3f3f4;line-height:1.55">
        ${inner}
      </td></tr>
      <tr><td style="padding:18px 32px;border-top:1px solid #20242c;color:#6b6e76;font-size:12px;letter-spacing:0.02em">
        Mobile detailing · Central Columbus, OH
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
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
