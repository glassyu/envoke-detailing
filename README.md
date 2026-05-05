# Envoke Detailing

Marketing + booking site for Envoke Detailing (Central Columbus, OH).

Static HTML/CSS/JS — no build step.

## Run locally

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Setup before going live

1. **Cal.com link** — create an event type at [cal.com](https://cal.com), then update `CAL_LINK` in `script.js` to match your public link (e.g. `envokedetailing/detail`).
2. **Form submissions** — the form uses Netlify Forms (`data-netlify="true"`). Submissions go to your Netlify dashboard and email when deployed to Netlify. If you deploy elsewhere, swap the form `action` to a [Formspree](https://formspree.io) endpoint or wire up your own handler.

## Deploy

### Netlify (recommended)

```bash
# install once
npm i -g netlify-cli

netlify deploy --prod --dir .
```

Or drag-and-drop the folder at [app.netlify.com/drop](https://app.netlify.com/drop).

## Files

- `index.html` — single-page site (nav, hero, services, add-ons, booking, contact, footer)
- `styles.css` — dark premium auto theme, amber accent
- `script.js` — Cal.com inline embed + footer year
- `netlify.toml` — Netlify config
