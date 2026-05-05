# Envoke Detailing

Marketing + booking-request site for Envoke Detailing — mobile auto detailing, Central Columbus, OH.

Static HTML/CSS/JS + a single Netlify Function that sends transactional email via [Resend](https://resend.com).

## How booking works

1. Customer fills out the form on the site (vehicle, service, preferred date/time, address, etc.). Already-confirmed slots are grayed out.
2. Form POSTs to `/.netlify/functions/submit-booking`.
3. Function checks for slot conflicts, stores a pending booking in Netlify Blobs, then sends two emails via Resend:
   - **Notification** → `rsabdon@gmail.com` with all the booking details and **Confirm / Decline** buttons. Reply-to is the customer's email.
   - **Confirmation** → the customer, telling them you'll text to confirm.
4. You click **Confirm booking** in the notification email. The slot is now blocked on the public form so no one else can request it.
5. You text the customer at the cell number they provided to lock in time + quote.
6. Detail happens. Customer pays after.

If you need to undo a confirmation, the success page shown after clicking Confirm has a Cancel link — bookmark it or save the email.

No payment processing on the site. No third-party calendar widget.

## Architecture

```
index.html (form) ──POST──▶ /.netlify/functions/submit-booking
                                ├─ checks slot in Netlify Blobs (confirmed-bookings)
                                ├─ stores pending booking in Blobs (pending-bookings)
                                └─ sends 2 emails via Resend

owner email "Confirm" link ──▶ /.netlify/functions/booking-action?action=confirm
                                ├─ moves pending → confirmed in Blobs
                                └─ returns dark-themed status page

index.html (load) ──GET──▶ /.netlify/functions/availability
                                └─ returns confirmed slot list (date+time only)
```

## One-time setup (required before the form will work)

### 1. Resend account
1. Sign up at [resend.com](https://resend.com) (free tier is plenty — 3,000 emails/mo).
2. **Add and verify a domain.** Resend won't deliver to arbitrary recipients without one. If you don't have a domain yet, register `envokedetailing.com` (~$12/yr at any registrar) and follow Resend's DNS instructions to verify.
3. Create an API key at [resend.com/api-keys](https://resend.com/api-keys).

> **Testing without a verified domain:** set `RESEND_FROM=onboarding@resend.dev` and `OWNER_EMAIL` to your Resend account email — emails will only deliver to that one address (Resend's restriction). Verify the domain to send to real customers.

### 2. Netlify env vars
In the Netlify dashboard → Site settings → Environment variables, add:

| Key | Value |
| --- | --- |
| `RESEND_API_KEY` | The key from step 1 |
| `RESEND_FROM` | `Envoke Detailing <bookings@envokedetailing.com>` (or whatever verified sender you set up) |
| `ADMIN_KEY` | A random secret. Generate with: `openssl rand -hex 24` |
| `OWNER_EMAIL` | `rsabdon@gmail.com` (optional — defaults to this) |
| `OWNER_PHONE` | `380-222-1158` (optional — defaults to this) |

`ADMIN_KEY` is what authorizes the Confirm/Decline links in your email. Anyone with that key + a booking id can confirm/cancel — keep it secret.

Redeploy after adding env vars.

### 3. Netlify Blobs
Auto-enabled. No setup. Stores `pending-bookings` and `confirmed-bookings` keyed-value pairs. Free tier is plenty.

## Run locally

Static preview (form submission won't work without the function running):
```bash
python3 -m http.server 8080
```

Full local dev with the function:
```bash
npm i -g netlify-cli
netlify dev      # serves the site + functions on http://localhost:8888
```
You'll need a `.env` file with `RESEND_API_KEY` and `RESEND_FROM` for the function to actually send.

## Deploy

```bash
netlify deploy --prod --dir .
```

Or push to GitHub — if the repo is connected to Netlify it deploys automatically.

## Admin

Visit `/admin.html` on the deployed site to manually add bookings (direct-text customers, personal time blocks, anything that didn't come through the public form). Paste your `ADMIN_KEY` once — it's saved to `sessionStorage` for the tab. The form supports a `duration_min` override for non-standard service durations and a `force` checkbox to bypass overlap detection.

## Files

- `index.html` — single-page site (nav, hero, services, add-ons, booking form, footer)
- `admin.html` — admin page for adding manual bookings
- `styles.css` — dark premium auto theme, amber accent
- `script.js` — date-input min, footer year, availability fetch, fetch-based form submit
- `netlify/functions/submit-booking.mjs` — receives form, checks availability, stores pending booking, sends emails
- `netlify/functions/booking-action.mjs` — owner confirm/cancel endpoint (clicked from notification email)
- `netlify/functions/manual-booking.mjs` — admin-only endpoint to create confirmed bookings directly
- `netlify/functions/availability.mjs` — public endpoint listing taken slots
- `netlify/functions/_services.mjs` — shared scheduling/duration config (do NOT deploy as endpoint — underscore prefix)
- `package.json` — declares `@netlify/blobs` dependency
- `netlify.toml` — Netlify config
