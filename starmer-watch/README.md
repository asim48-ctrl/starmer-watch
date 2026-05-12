# Starmer Watch

Static dashboard for tracking Labour leadership pressure around Keir Starmer.

## What It Shows

- MPs publicly calling for Starmer to resign or announce a departure timetable.
- MPs reported as backing him through a public support statement.
- A modeled leadership contest threshold, kept in `data/manual-overrides.json`.
- Wes Streeting and Andy Burnham maneuver summaries.
- Ministerial exits, PPS exits, and other proxy pressure signals.
- Latest relevant RSS/news hits from LabourList, Sky, Guardian, BBC, and optional GDELT discovery.
- Polymarket prices for Starmer exit, Labour leadership election timing, next UK PM, and cabinet resignation markets.

## Local Preview

From this directory:

```bash
node scripts/refresh-data.mjs
python3 -m http.server 4173
```

Open `http://127.0.0.1:4173`.

## Data Pipeline

`scripts/refresh-data.mjs` builds `data/latest.json` with no paid services and no API keys.

1. Scrapes the LabourList tracker for the public resignation-call count, support-statement count, MP names, and resignation moves.
2. Reads RSS feeds from Sky News Politics, Guardian Politics, BBC Politics, and LabourList.
3. Can use GDELT as an optional discovery layer when `ENABLE_GDELT=1`. It is disabled by default to avoid rate-limit noise.
4. Queries Polymarket public search for `Starmer 2026`, `Labour leader`, `UK Prime Minister 2026`, and `UK Cabinet Minister resigns`.
5. Merges everything into `data/latest.json`, which the static dashboard fetches.

Manual corrections and rule constants live in `data/manual-overrides.json`. Use it for named support lists, threshold changes, or source markup breakages.

## Free Hosting

Recommended: GitHub Pages with Actions.

1. Push this repository to GitHub.
2. In repository settings, set Pages source to `GitHub Actions`.
3. Keep `.github/workflows/starmer-watch-refresh.yml` enabled. It refreshes `data/latest.json`, commits changes, and deploys the `starmer-watch` folder every 30 minutes.

Alternative: Cloudflare Pages.

- Build command: `node starmer-watch/scripts/refresh-data.mjs`
- Output directory: `starmer-watch`
- Add the GitHub Actions refresh workflow as well if you want the JSON to update between manual deployments.

## Source Notes

This is a public-source monitor, not an official count. A public MP statement count is not the same thing as a formal leadership challenge. The dashboard shows source health so stale or broken feeds are visible.
