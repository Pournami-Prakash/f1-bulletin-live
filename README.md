# F1 Bulletin

F1 Bulletin started as "let me see how F1 analytics works" and slowly turned into a live Formula 1 data product: part news hub, part race analytics notebook, part prediction experiment.

Live site: https://f1bulletin.vercel.app

## Why I Built It

Last December, I was trying to finish all seven seasons of *Drive to Survive* and kept hearing people say, "I have the data." That sent me into the FastF1 API, where I started with a small Python and Streamlit app for lap analysis, strategy, sector times, and circuit replay.

This season, I picked it back up with a simpler idea: scrape F1 news into one place. I also wanted to try Snowflake and Next.js on a real project, so the app grew from a news feed into a fuller race weekend dashboard.

The Snowflake part became the data engineering layer: ingestion, story grouping, clustering, and sentiment across sources. Neon became the fast app database for the frontend, so the site can serve the processed data quickly.

## What It Explores

- News feed with similar stories grouped across sources
- Driver and constructor sentiment from article text
- Race predictions using Bayesian priors, current-season data, and Monte Carlo simulations
- Lap pace, tyre strategy, sector times, and race analytics
- Circuit profiles and weekend context
- Live standings and calendar views

## Tech Stack

- Python
- FastF1
- Snowflake
- Neon Postgres
- Next.js, React, and TypeScript
- Vercel
