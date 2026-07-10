# F1 Bulletin

F1 Bulletin started as "let me see how F1 analytics works" and slowly turned into a live Formula 1 data product: part news hub, part race analytics notebook, part prediction experiment.

## Why I Built It

Last December, I was trying to finish all seven seasons of *Drive to Survive* and kept hearing people say, "I have the data." That sent me into the FastF1 API, where I started with a small Python and Streamlit app for lap analysis, strategy, sector times, and circuit replay.

This season, I picked it back up with a simpler idea: scrape F1 news into one place. I also wanted to try Snowflake and Next.js on a real project, so the app grew from a news feed into a fuller race weekend dashboard.

Snowflake became the data engineering layer for shaping raw motorsport and news data into something useful. Neon became the app-facing database so the frontend could stay fast.

## Project Highlights

- Built an end-to-end F1 data product from ingestion to frontend
- Used Snowflake and Snowflake Cortex for story grouping, clustering, and sentiment
- Processed race and session data with Python and FastF1
- Synced processed data into Neon for fast app reads
- Built prediction outputs that can be scored after race results arrive
- Designed a Next.js interface around race context, analytics, circuits, standings, and predictions

## What It Does

- News feed with similar stories grouped across sources
- Driver and constructor sentiment from article text
- Race predictions using Bayesian priors, current-season data, and Monte Carlo simulations
- Lap pace, tyre strategy, sector times, and race analytics
- Circuit profiles and weekend context
- Live standings and calendar views

## Technical Breakdown

**News Intelligence**

The news side started as a simple scraper, then became a pipeline for grouping similar F1 stories across sources. Snowflake handles the heavier transformation work, including clustering and sentiment-style analysis over article text.

**Race Analytics**

FastF1 powers the race/session data workflow. The analytics views focus on practical race-weekend questions: lap pace, stint shape, tyre strategy, sector comparisons, and replay-style circuit context.

**Predictions**

The prediction model starts from priors early in the season, then shifts toward current-season evidence as more races are completed. Simulations estimate win probability, podium probability, and expected points, then predictions are scored once actual race results are available.

**Circuit Context**

The circuit page is built around the idea that every track changes how a result should be read. It combines circuit characteristics, historical context, model outlook, and recent race-weekend data instead of treating every Grand Prix the same.

## Methods and Design Choices

**Warehouse-to-app data flow**

I used Snowflake for the heavier data work because the news intelligence layer needed repeatable transformations across many sources: ingesting articles, grouping similar stories, extracting entities, and building sentiment-style signals. Neon is used as the app-facing database because the frontend needs fast reads, not warehouse-style processing on every page load.

**Current-season weighting**

For predictions, I did not want the model to overtrust history when the season context changes. The model starts with historical priors, then increases the weight of current-season race evidence as more 2026 results become available.

**Simulation over single-point ranking**

Instead of only ranking drivers from P1 to P20, the prediction workflow uses simulations to produce probabilities. That makes the output more useful because a driver can be ranked second while still having a very different win or podium probability from another driver nearby.

**Scored predictions**

Predictions are meant to be checked after the race, not just displayed before it. Once actual results are available, the workflow can score position error, podium hits, winner accuracy, and probability quality. That feedback loop is important because it shows whether the model is improving or just looking convincing.

**Circuit-specific context**

The circuit layer exists because track characteristics change how form should be interpreted. A good prediction page should know the difference between a high-degradation race, a street circuit, a low-overtaking track, and a power-sensitive layout.

## What Makes It Different

Most F1 dashboards show results, standings, or news in isolation. I wanted F1 Bulletin to connect those layers: what happened on track, what the model expected, what the circuit tends to reward, and what the news cycle is emphasizing.

## What I Learned

- Working with real motorsport data is messy: missing sessions, delayed timing data, changing grids, and circuit naming inconsistencies all matter.
- Prediction quality changes a lot once current-season evidence starts to outweigh historical assumptions.
- Snowflake is useful when the work is more than storing rows: clustering, enrichment, and repeatable transformation logic fit naturally there.
- Keeping the frontend fast means not making the UI wait on heavy data processing.
- A public portfolio project needs different cleanup than a private working repo: generated data, caches, and experimental branches need clear boundaries.

## Data Sources

The project combines public race/session data, public F1 calendar and standings data, and motorsport news sources. FastF1 is used for session-level race analytics, while news and standings data are processed into app-ready views.

## Tech Stack

Python, FastF1, Snowflake, Snowflake Cortex, Neon Postgres, Next.js, React, TypeScript, Vercel

## Note

This is an independent fan project and is not affiliated with Formula 1.
