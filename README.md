# Envoke Detailing

Marketing + booking-request site for Envoke Detailing — mobile auto detailing, Central Columbus, OH.

Static HTML/CSS/JS + a single Netlify Function that sends transactional email via [Resend](https://resend.com).

## How booking works

1. Customer fills out the form on the site (vehicle, service, preferred date/time, address, etc.).
2. Form POSTs to `/.netlify/functions/submit-booking`.
3. Function sends two emails via Resend:
   - **Notification** → `rsabdon@gmail.com` with all the booking details. Reply-to is the customer's email.
   - **Confirmation** → the customer, telling them you'll text to confirm.
4. You text the customer at the cell number they provided to lock in time + quote. Track the booking in your own calendar (Google, Apple, whatever).
5. Detail happens. Customer pays after.

No payment processing, no third-party widgets, no auto-dedup. Conflicts get resolved manually in the text exchange.

## One-time setup (required before the form will work)

### Resend account
1. Sign up at [resend.com](https://resend.com) (free tier — 3,000 emails/mo).
2. Add and verify a domain (e.g. `envokedetailing.com`).
3. Create an API key at [resend.com/api-keys](https://resend.com/api-keys).

### Netlify env vars
Site settings → Environment variables, add:

| Key | Value |
| --- | --- |
| `RESEND_API_KEY` | The key from above |
| `RESEND_FROM` | `Envoke Detailing <bookings@envokedetailing.com>` |
| `OWNER_EMAIL` | `rsabdon@gmail.com` (optional — defaults to this) |
| `OWNER_PHONE` | `380-222-1158` (optional — defaults to this) |

Redeploy after adding env vars.

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

Or push to GitHub — if the repo is connected to Netlify, it deploys automatically.

## Files

- `index.html` — single-page site (nav, hero, services, add-ons, booking form, footer)
- `styles.css` — dark premium auto theme, amber accent
- `script.js` — date-input min, footer year, fetch-based form submit
- `netlify/functions/submit-booking.mjs` — receives the form, sends the two emails
- `netlify.toml` — Netlify config
- `package.json` — Node engine pin
