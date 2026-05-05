# Envoke Detailing

Marketing + booking-request site for Envoke Detailing (Central Columbus, OH).

Static HTML/CSS/JS — no build step.

## How booking works

1. Customer fills out the booking-request form on the site (vehicle, service, preferred date + time, etc.).
2. Submission is delivered to Ryan via Netlify Forms (email + Netlify dashboard).
3. Ryan texts the customer at the cell number they provided to confirm time + quote.
4. Detail happens. Customer pays after.

No payment processing on the site. No third-party calendar widget.

## Run locally

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy

### Netlify (recommended — required for the form to work)

```bash
# install once
npm i -g netlify-cli

netlify deploy --prod --dir .
```

Or drag-and-drop the folder at [app.netlify.com/drop](https://app.netlify.com/drop).

After first deploy, in the Netlify dashboard:
- **Forms → Settings → Form notifications** — add email notification to `rsabdon@gmail.com`.
- Optional: connect a Zapier/Make webhook to forward submissions to SMS, Slack, etc.

## Files

- `index.html` — single-page site (nav, hero, services, add-ons, booking form, footer)
- `styles.css` — dark premium auto theme, amber accent
- `script.js` — date-input min, footer year, post-submit thank-you state
- `netlify.toml` — Netlify config
