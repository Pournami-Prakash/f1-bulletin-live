# F1 Bulletin

F1 Bulletin is a live Formula 1 dashboard that brings together race context, driver and constructor standings, news intelligence, analytics, circuit profiles, and race prediction views.

Live site: https://f1bulletin.vercel.app

## What It Shows

- Live F1 news and story feeds
- Race weekend intelligence and summaries
- Driver, constructor, and standings views
- Circuit profiles with race-specific context
- Analytics from race sessions, laps, stints, and telemetry-backed data
- Prediction pages with model output, confidence, expected points, and scoring once actual results are available

## Tech Stack

- Next.js, React, TypeScript
- Neon Postgres for public app data
- FastF1-backed ETL for race/session data
- GitHub Actions for scheduled ingestion and prediction runs
- Vercel for hosting

## Project Layout

```text
.github/workflows/   Scheduled ingestion and prediction workflows
data/                Public static circuit geometry
etl/                 FastF1 ingestion and prediction pipeline
scripts/             Data sync helpers used by workflows
sql/                 Intelligence and reporting SQL
web/                 Next.js app
```

## Local Development

The deployable app lives in `web/`.

```bash
cd web
npm ci
npm run dev
```

Open `http://localhost:3000`.

For a production check:

```bash
cd web
npm run lint
npm run build
```

## Environment

Runtime secrets are intentionally not committed. The app expects environment variables such as:

- `NEON_DATABASE_URL`
- `INGEST_KEY`
- `APP_URL`

Optional enrichment jobs can use additional private data warehouse credentials through GitHub Actions secrets.

## Notes

This public repo contains the app and reproducible pipeline code. Generated caches, local model outputs, private research workspaces, and environment files are excluded from git.
