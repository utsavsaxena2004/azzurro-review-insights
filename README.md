# Azzurro Hotels — Booking.com Review Insights Dashboard

A full-stack operations dashboard that collects, deduplicates, classifies, and visualizes Booking.com guest reviews across **Azzurro Hotels' four Sydney properties**, designed for **non-technical operations staff** to track weekly performance, spot recurring operational issues, and respond faster.

## Covered Properties

| Property | Booking.com URL | Booking Slug | Live Score | Live Reviews |
| --- | --- | --- | ---: | ---: |
| **Olympic Hotel Paddington** | https://www.booking.com/hotel/au/olympic-paddington.html | `olympic-paddington` | 6.5 / 10 | 125 |
| **Potts Point** | https://www.booking.com/hotel/au/venus-potts-point-sydney.html | `venus-potts-point-sydney` | 6.3 / 10 | 2,405 |
| **Central Sydney** | https://www.booking.com/hotel/au/venus-surry-hills.html | `venus-surry-hills` | 6.6 / 10 | 2,450 |
| **Darling Harbour** | https://www.booking.com/hotel/au/chateau-de-venus.html | `chateau-de-venus` | 6.6 / 10 | 4,310 |

---

## 1. Setup & Installation Instructions

### Prerequisites
- **Node.js 18+** and **npm 9+** (for the dashboard frontend & API routes)
- **Python 3.10+** (for the Booking.com review ingestion & classification worker)

### Install Frontend Dependencies
```bash
npm install
```

### Install Scraper / Ingestion Worker Dependencies (Optional — only needed to run live scraping)
```bash
pip install -r scripts/requirements.txt
# If using local Playwright headless browser scraping:
playwright install chromium
```

### Environment Variables (Optional)
The app works out of the box with **zero API keys or credentials** using the bundled sample dataset (`src/data/seed-reviews.json` / `data/sample_reviews.json`). To enable live Supabase PostgreSQL storage, live Apify scraping, or live Gemini/OpenAI LLM classification:

```bash
cp .env.example .env.local
```

Populate any combination of:
- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (run `supabase/schema.sql` in Supabase SQL Editor)
- `APIFY_API_TOKEN` (managed Booking.com scraper API)
- `GEMINI_API_KEY` or `OPENAI_API_KEY` (live LLM classification & manager reply drafting)

> **Security note:** No passwords, API keys, cookies, or personal credentials are committed to this repository.

---

## 2. How to Run the Scraper & Frontend

### Run the Frontend Dashboard Locally
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

### Run the Review Collector & Classifier
```bash
# Option A: Headless Playwright (intercepts Booking.com /dml/graphql ReviewListFrontend)
python3 scripts/ingest_booking.py --provider playwright --max-per-property 50 --enrich

# Option B: Managed Apify Booking Reviews API (recommended for cloud/scheduled runs)
python3 scripts/ingest_booking.py --provider apify --max-per-property 100 --enrich --push-supabase

# Option C: Offline verification & re-enrichment on bundled sample data
python3 scripts/ingest_booking.py --provider seed --enrich

# Run automated data-integrity & deduplication tests
python3 scripts/test_pipeline.py
```

By default, every ingestion run performs an **incremental merge** into existing reviews, deduplicating on `(propertyId, externalReviewId)` and regenerating `src/data/seed-reviews.json`, `data/sample_reviews.json`, and `data/sample_reviews.csv`.

---

## 3. Architecture Overview

```text
Booking.com (4 Property Pages)
        │
        ▼
[1. Ingestion Worker — scripts/ingest_booking.py]
    • Playwright (/dml/graphql interceptor + fallback DOM selectors)
    • Apify Booking Reviews API (WAF-resilient cloud provider)
    • Exponential backoff retries + per-property fault isolation
    • Deterministic deduplication by (propertyId, externalReviewId)
        │
        ▼
[2. Topic Classification & Ops Enrichment — scripts/enrich_reviews.py]
    • Classifies reviews across 8 required operational topics + Free Dinner
    • Assigns sentiment (positive/neutral/negative), P1/P2/praise severity,
      owning department, ops summary, recommended action & draft reply
    • Uses Gemini / OpenAI structured JSON when configured, or deterministic
      hospitality-ops keyword rules offline
        │
        ▼
[3. Persistence Layer — supabase/schema.sql + src/lib/db.ts]
    • PostgreSQL tables: properties, reviews (unique constraint), sync_runs
    • Automatic zero-config fallback to local cached store when DB env unset
        │
        ▼
[4. Operations Dashboard — Next.js 14 App Router + Recharts]
    • Current Week Avg Rating vs. Previous Week (WoW delta)
    • Plain-English % topic insights ("X% of negative reviews this week...")
    • Positive vs. Negative Weekly Trend & Property Rating Trend charts
    • Property-by-property breakdown + interactive Topic × Property Heatmap
    • Searchable Review Feed + Date Range / Property filters + AI Reply Drafter
    • CSV Export for weekly GM standups & Sync Audit Log
```

---

## 4. Review Collection Method & Reliability Design

Booking.com does not offer public API access for guest reviews. Technical inspection of the four property pages shows that:
1. Initial property HTML (`/hotel/au/<slug>.html`) is server-rendered with headline scores and review counts, protected by **AWS WAF** (`aws-waf-token` cookies + TLS/HTTP2 fingerprinting).
2. Individual guest reviews are loaded dynamically when opening the review drawer via Booking.com's internal GraphQL endpoint (`POST /dml/graphql`, operation `ReviewListFrontend`).

**Why our collection pipeline is reliable:**
- **Decoupled from Frontend Reads**: The dashboard never scrapes Booking.com on page load. Operations staff get `<100 ms` load times even if Booking.com temporarily rate-limits or changes markup.
- **Dual Live Collection Strategy**: Locally, `playwright` renders the real page in headless Chromium, uses a **fallback CSS selector chain** (`REVIEW_DRAWER_SELECTORS`, `NEXT_PAGE_SELECTORS`) to survive minor UI tweaks, and intercepts raw `/dml/graphql` JSON responses rather than brittle HTML text scraping. In cloud/cron deployments (where datacenter IPs trigger AWS WAF), `apify` provides managed residential-proxy extraction.
- **Fault Isolation & Retries**: Each property scrape is wrapped in exponential-backoff retries (`with_retries`) and isolated `try/except` blocks—if one property hits a transient timeout, the other three still complete and the run is logged as `partial` in `sync_runs`.
- **Idempotent Incremental Updates**: Every review is keyed deterministically by `(property_id, external_review_id)`. Re-running the collector merges newly published reviews without creating duplicates.

---

## 5. Review Insights Methodology (Topic Classification)

Reviews are mapped into the **8 core operational topics** (`Cleanliness`, `Check-in experience`, `Staff or receptionist behaviour`, `Noise`, `Facilities`, `Location`, `Room condition`, `Value for money`) plus Azzurro's pod-hotel-specific `Free Dinner` topic (explicitly excluded for Olympic Hotel Paddington, where dinner is not included).

- **Hybrid Approach**: When `GEMINI_API_KEY` or `OPENAI_API_KEY` is provided, the pipeline uses structured JSON LLM classification. Without an API key, it uses a transparent, deterministic multi-keyword hospitality taxonomy (`scripts/enrich_reviews.py`) that prioritizes negative-text matches when routing issues to departments (`Housekeeping`, `Maintenance`, `Front Desk`, `Operations`, `F&B / Kitchen`, `Revenue & Front Desk`).
- **Actionable Insights**: `src/lib/analytics.ts` aggregates negative reviews for the current week to generate plain-English operational headlines (e.g., *"40% of negative reviews this week mentioned cleanliness-related issues"*) alongside an **Ops Action Queue** ranked by estimated Booking.com score drag.

---

## 6. Sample Review Data

Included directly in this repository:
- `data/sample_reviews.json` — 96 structured, enriched reviews across all 4 properties spanning 10 weeks (including 20 current-week and 20 previous-week reviews for Week-over-Week evaluation).
- `data/sample_reviews.csv` — Spreadsheet-ready export of the same dataset.
- `src/data/seed-reviews.json` — Bundled runtime cache backing zero-config local/Vercel startups.

---

## 7. Known Limitations & Assumptions

1. **Booking.com Anti-Bot & Markup Changes**: Direct headless scraping from cloud datacenter IPs (e.g., Vercel serverless functions) is frequently blocked by Booking.com's AWS WAF. Production deployments should run the Playwright worker via residential proxy or use the built-in Apify provider on a daily schedule (`vercel.json`).
2. **Keyword Classifier Nuance**: The offline keyword fallback is fast, zero-cost, and explainable, but can miss sarcasm or indirect phrasing compared to the live LLM mode (`GEMINI_API_KEY` / `OPENAI_API_KEY`).
3. **Sample Dataset Calibration**: The bundled 96-review dataset is grounded in each property's real live Booking.com score, review volume, room types, and published policies (free dinner windows, stairs, towel/padlock fees, card surcharge, Olympic Paddington pub/stadium context) so the dashboard can be evaluated immediately offline; running `ingest_booking.py --provider playwright` or `--provider apify` replaces/merges it with fresh live Booking.com reviews.
4. **Weekly Window Anchoring**: Current Week (7 days) and Previous Week (prior 7 days) are anchored to the latest review date present in the dataset so historical snapshots remain consistent during offline evaluation.
