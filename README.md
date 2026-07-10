# F1 Bulletin

F1 Bulletin started as "let me see how F1 analytics works" and slowly turned into a live Formula 1 data product: part news hub, part race analytics notebook, part prediction experiment.

Live site: https://f1bulletin.vercel.app

## Why I Built It

Last December, I was trying to finish all seven seasons of *Drive to Survive* and kept hearing people say, "I have the data." That sent me into the FastF1 API, where I started with a small Python and Streamlit app for lap analysis, strategy, sector times, and circuit replay.

This season, I picked it back up with a simpler idea: scrape F1 news into one place. I also wanted to try Snowflake and Next.js on a real project, so the app grew from a news feed into a fuller race weekend dashboard.

The Snowflake part became the data engineering layer: ingestion, story grouping, clustering, and sentiment across sources. Neon became the fast app database for the frontend, so the site can serve the processed data quickly.

## Project Highlights

- Built an end-to-end F1 data product from ingestion to frontend
- Used Snowflake and Snowflake Cortex for news intelligence workflows
- Processed race/session data with Python and FastF1
- Synced app-ready data into Neon for fast frontend reads
- Built a prediction workflow that can be scored as race results arrive
- Designed a Next.js interface around live race context, standings, circuits, analytics, and predictions

## What It Does

- News feed with similar stories grouped across sources
- Driver and constructor sentiment from article text
- Race predictions using Bayesian priors, current-season data, and Monte Carlo simulations
- Lap pace, tyre strategy, sector times, and race analytics
- Circuit profiles and weekend context
- Live standings and calendar views

## Technical Breakdown

**News Intelligence**

The news side started as a simple scraper, then became a pipeline for grouping similar F1 stories across sources. Snowflake handles the heavier transformation layer, including clustering and sentiment-style analysis over article text. The frontend reads processed results from Neon instead of querying the warehouse directly.

**Race Analytics**

FastF1 powers the race/session data workflow. The analytics views focus on practical race-weekend questions: lap pace, stint shape, tyre strategy, sector comparisons, and replay-style circuit context.

**Predictions**

The prediction model starts from priors early in the season, then shifts toward current-season evidence as more races are completed. It uses simulation outputs to estimate win probability, podium probability, and expected points, then scores predictions once actual race results are available.

**Circuit Context**

The circuit page is built around the idea that every track changes how a result should be read. It combines circuit characteristics, historical context, model outlook, and recent race-weekend data instead of treating every Grand Prix the same.

## What Makes It Different

Most F1 dashboards show either results, standings, or news in isolation. I wanted F1 Bulletin to connect those layers: what happened on track, what the model expected, what the circuit tends to reward, and what the news cycle is emphasizing.

The project also follows a warehouse-to-app pattern: raw race and news data gets shaped into more useful intelligence layers, then served through a fast web app experience.

## What I Learned

- Working with real motorsport data is messy: missing sessions, delayed timing data, changing grids, and circuit naming inconsistencies all matter.
- Prediction quality changes a lot once current-season evidence starts to outweigh historical assumptions.
- Snowflake is useful when the work is more than storing rows: clustering, enrichment, and repeatable transformation logic fit naturally there.
- Keeping the frontend fast means not making the UI wait on heavy data processing.
- A public portfolio project needs different cleanup than a private working repo: generated data, caches, and experimental branches need clear boundaries.

## Tech Stack

- Python
- FastF1
- Snowflake
- Snowflake Cortex
- Neon Postgres
- Next.js, React, and TypeScript
- Vercel

## Note

This is an independent fan project and is not affiliated with Formula 1.
