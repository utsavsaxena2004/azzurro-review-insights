# Azzurro Hotels — Booking.com Review Insights Dashboard

I built this full-stack application for Azzurro Hotels' operations team to collect, classify, and act on Booking.com guest reviews across all four Sydney properties. The goal was to build something a non-technical property manager can open on Monday morning and immediately see how this week compares to last week, which operational issues are pulling scores down, and what needs attention first.

## Covered Properties

| Property | Booking.com Page | Slug | Live Score | Live Reviews | Operational Context |
| --- | --- | --- | ---: | ---: | --- |
| **Olympic Hotel Paddington** | https://www.booking.com/hotel/au/olympic-paddington.html | `olympic-paddington` | 6.5 / 10 | 125 | Private-room pub hotel across Allianz Stadium & SCG; dinner not included |
| **Potts Point** | https://www.booking.com/hotel/au/venus-potts-point-sydney.html | `venus-potts-point-sydney` | 6.3 / 10 | 2,405 | Pod hotel near Kings Cross; free dinner; shared bathrooms & terrace |
| **Central Sydney** | https://www.booking.com/hotel/au/venus-surry-hills.html | `venus-surry-hills` | 6.6 / 10 | 2,450 | Pod hotel near Central Station; free dinner; highest Wi-Fi rating (9.0) |
| **Darling Harbour** | https://www.booking.com/hotel/au/chateau-de-venus.html | `chateau-de-venus` | 6.6 / 10 | 4,310 | Pod hotel near ICC Sydney; free dinner; highest review volume (46.4%) |

## Checklist Against the Trial Brief

| Requirement | Status | How I Implemented It |
| --- | --- | --- |
| Collect review text, rating, date, property, and metadata from all 4 pages | Done | `scripts/ingest_booking.py` extracts score, date, reviewer, country, traveler type, room type, stay length, title, positive text, and negative text across all 4 Booking.com slugs. |
| Avoid duplicate reviews | Done | Deterministic SHA-256 IDs + unique deduplication key `(property_id, external_review_id)` in both the Python worker and PostgreSQL schema (`supabase/schema.sql`). |
| Support updating the dataset with newly published reviews | Done | Incremental merge is enabled by default in `scripts/ingest_booking.py` and `POST /api/sync` upserts new records without overwriting historical reviews. |
| Handle page changes, errors, and temporary failures | Done | Exponential-backoff retries (`with_retries`), per-property fault isolation (`partial` run logging if one property fails), fallback CSS selector chains, and decoupled DB/cache reads so the UI never 403s. |
| Average rating for the current week + previous week comparison | Done | Top KPI cards and per-property cards in `src/components/PortfolioOverview.tsx` show Current Week Avg Rating, Previous Week Avg Rating, and Week-over-Week delta badges (`+/- pts`). |
| Property-by-property rating breakdown | Done | Dedicated 4-property breakdown cards with this week's score, WoW delta, live Booking.com score, top complaint, top strength, and Wi-Fi rating. |
| Review feed + date and property filters | Done | `src/components/ReviewExplorer.tsx` + `src/components/DashboardClient.tsx` with property selector, quick date presets (`7d`, `14d`, `30d`, `60d`, `All`), custom `From`/`To` date pickers, topic/sentiment/priority filters, and keyword search. |
| Positive and negative review trends | Done | Weekly stacked Positive / Neutral / Negative bar chart paired with a Weekly Average Rating line chart by property (`Recharts`). |
| Operational topic grouping (8 required topics) + percentage insights | Done | Classifies every review into `Cleanliness`, `Check-in experience`, `Staff or receptionist behaviour`, `Noise`, `Facilities`, `Location`, `Room condition`, `Value for money` (+ `Free Dinner` for pod hotels only), and generates plain-English insights like *"40% of negative reviews this week mentioned cleanliness-related issues."* |
| Sample review data + complete README + zero committed secrets | Done | Bundled `data/sample_reviews.json` and `data/sample_reviews.csv` (96 enriched reviews), `.env.example` only, and automated verification via `scripts/test_pipeline.py`. |

## What I Built, How It Works, and Why

When I inspected the four Booking.com pages, two technical realities shaped the entire architecture:

1. **Booking.com does not expose reviews in static HTML.** The initial `/hotel/au/<slug>.html` page is server-rendered with the headline rating and total count, while paginated guest reviews load dynamically via Booking.com's internal GraphQL endpoint (`POST /dml/graphql`, operation `ReviewListFrontend`) behind **AWS WAF** (`aws-waf-token` + TLS/HTTP2 fingerprinting).
2. **Operations staff need fast, reliable answers—not broken scrapers.** If a dashboard scrapes Booking.com live on page load, cloud datacenter IPs quickly get hit with HTTP 403s and pages time out.

Because of that, I separated the system into four clean layers:

### 1. Review Collection Layer (`scripts/ingest_booking.py`)
- **Playwright mode (`--provider playwright`)**: Launches headless Chromium, opens each Booking.com property page, clicks into the reviews drawer using a fallback selector chain (`REVIEW_DRAWER_SELECTORS`, `NEXT_PAGE_SELECTORS`) so minor markup changes do not break it, and intercepts the raw `/dml/graphql` JSON responses directly instead of brittle HTML scraping.
- **Apify mode (`--provider apify`)**: Calls Apify's managed Booking.com Reviews Scraper API for cloud or scheduled cron jobs where datacenter IPs get blocked by AWS WAF.
- **Resilience & Deduplication**: Wraps each property fetch in exponential-backoff retries (`with_retries`) and isolated `try/except` blocks—if one property times out, the other three still sync and the run is logged as `partial`. Every review is keyed by `(propertyId, externalReviewId)` and merged incrementally into existing data so re-runs never create duplicates.

### 2. Topic Classification & Ops Enrichment (`scripts/enrich_reviews.py` and `src/lib/ai.ts`)
- Every review is tagged across the **8 core operational topics** (`Cleanliness`, `Check-in experience`, `Staff or receptionist behaviour`, `Noise`, `Facilities`, `Location`, `Room condition`, `Value for money`) plus Azzurro's `Free Dinner` topic (explicitly excluded for Olympic Hotel Paddington since dinner is not included there).
- **Hybrid Classification**: When `GEMINI_API_KEY` or `OPENAI_API_KEY` is configured, it uses structured JSON LLM extraction. When no API key is set, it falls back to a deterministic hospitality-ops keyword classifier that prioritizes negative-text matches when routing each review to an owning department (`Housekeeping`, `Maintenance`, `Front Desk`, `Operations`, `F&B / Kitchen`, `Revenue & Front Desk`) and assigning `P1` (urgent), `P2` (recurring friction), or `praise` severity.

### 3. Storage & Analytics Layer (`supabase/schema.sql`, `src/lib/db.ts`, `src/lib/analytics.ts`)
- **Zero-Config + Production Postgres**: `src/lib/db.ts` connects to **Supabase PostgreSQL** (`properties`, `reviews`, `sync_runs` tables with a unique constraint on `(property_id, external_review_id)` and GIN index on `aspects`) whenever Supabase environment variables are present, and falls back to the local cached dataset (`src/data/seed-reviews.json`) when running locally without credentials.
- **Analytics Engine (`src/lib/analytics.ts`)**: Computes Current Week vs. Previous Week ratings and deltas (both portfolio-wide and per property), weekly Positive / Neutral / Negative sentiment trends, plain-English percentage insights for negative topics, an interactive `Topic × Property` heatmap, and an **Ops Action Queue** ranked by estimated Booking.com score drag.

### 4. Non-Technical Operations Dashboard (`src/components/` & `src/app/api/`)
- **Portfolio Overview (`PortfolioOverview.tsx`)**: Displays Current Week Avg Rating, Week-over-Week change, Positive vs. Negative share, Live Booking.com portfolio score, clickable plain-English weekly insights, Weekly Positive vs. Negative bar chart, Weekly Rating Trend by property, and 4 property breakdown cards.
- **Ops Action Queue (`OpsActionQueue.tsx`)**: Groups recurring P1/P2 complaints by property and topic, shows the owning department, estimated score drag (`-0.xx pts`), recommended operational fix, and guest quotes.
- **Topic Heatmap (`AspectHeatmap.tsx`)**: A `9 Topics × 4 Properties` matrix color-coded by average score (green/amber/red, with `N/A` for Free Dinner at Olympic Paddington). Clicking any cell jumps straight to those filtered reviews.
- **Review Feed + AI Manager Reply Drafter (`ReviewExplorer.tsx`)**: Lets staff browse, search, and filter individual reviews by property, date range (`From`/`To` or presets), topic, sentiment, or priority—and draft a Booking.com reply in Warm, Concise, or Recovery tone via `POST /api/draft-reply`.
- **Sync & Pipeline Panel + CSV Export (`SyncPipelinePanel.tsx`, `/api/sync`, `/api/export`)**: Shows storage/classifier mode, recent sync audit logs, a manual Sync button, and one-click CSV download of any filtered view for weekly GM standups.

## How to Run Locally & Pull Fresh Live Reviews

### 1. Run the Frontend Dashboard (Zero Config)
Requires **Node.js 18+** and **npm 9+**.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The dashboard starts immediately with the bundled 96-review sample dataset (`data/sample_reviews.json` and `data/sample_reviews.csv`).

### 2. Pull Fresh Live Reviews from Booking.com
Requires **Python 3.10+**.

```bash
pip install -r scripts/requirements.txt
```

**Option A — Local Headless Browser (Free, No API Keys Required):**
```bash
playwright install chromium
python3 scripts/ingest_booking.py --provider playwright --max-per-property 50 --enrich
```
This opens all four Booking.com pages in headless Chromium, intercepts `/dml/graphql` review payloads, classifies every review into the 8 operational topics, deduplicates against existing reviews, and updates `src/data/seed-reviews.json`, `data/sample_reviews.json`, and `data/sample_reviews.csv`.

**Option B — Managed Apify Scraper (Recommended for Cloud / Scheduled Cron):**
1. Copy `.env.example` to `.env.local` and set `APIFY_API_TOKEN` (plus optional `GEMINI_API_KEY` or `OPENAI_API_KEY` for live LLM tagging).
2. Run:
```bash
python3 scripts/ingest_booking.py --provider apify --max-per-property 100 --enrich
```

**Option C — Push Live Reviews Directly to Supabase PostgreSQL:**
1. Run `supabase/schema.sql` in your Supabase SQL Editor.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
3. Add `--push-supabase` to either command above:
```bash
python3 scripts/ingest_booking.py --provider playwright --max-per-property 50 --enrich --push-supabase
```

### 3. Run the Automated Pipeline Test Suite
```bash
python3 scripts/test_pipeline.py
```
This verifies ingestion deduplication, schema integrity, coverage across all 4 properties and all 8 required topics, and Current Week / Previous Week data consistency.

### 4. Deploy to Vercel
Push the repository to GitHub and import it in Vercel (`vercel.json` is pre-configured for the Sydney `syd1` region and a daily cron on `/api/sync`). Add optional environment variables in Vercel Project Settings, or deploy immediately with zero env vars for demo mode.

## Project Structure

```text
azzurro-review-insights/
├── data/
│   ├── sample_reviews.json          # 96 structured sample reviews across all 4 properties
│   └── sample_reviews.csv           # Spreadsheet-ready CSV export
├── scripts/
│   ├── ingest_booking.py            # Playwright / Apify / seed ingestion worker with retries & dedup
│   ├── enrich_reviews.py            # Hybrid LLM + keyword topic classifier & ops router
│   ├── test_pipeline.py             # Offline data quality & pipeline verification suite
│   └── requirements.txt
├── supabase/
│   └── schema.sql                   # PostgreSQL schema (properties, reviews, sync_runs + indexes)
├── src/
│   ├── app/
│   │   ├── page.tsx                 # Server Component bootstrapping dashboard payload
│   │   └── api/                     # /api/dashboard, /api/sync, /api/draft-reply, /api/export
│   ├── components/                  # DashboardClient, PortfolioOverview, OpsActionQueue,
│   │                                # AspectHeatmap, ReviewExplorer, SyncPipelinePanel
│   ├── data/                        # Canonical property metadata + runtime seed cache
│   ├── lib/                         # db.ts (Supabase/cache), analytics.ts, ai.ts
│   └── types/index.ts               # Shared TypeScript interfaces
├── .env.example                     # Optional env var template (no secrets committed)
└── vercel.json                      # Sydney (syd1) deployment + daily /api/sync cron
```

## Known Limitations & Assumptions

- **Cloud IP Blocking (AWS WAF):** Booking.com actively challenges datacenter IP ranges with AWS WAF. Local Playwright runs work well from residential IPs, while cloud/scheduled runs should use the built-in Apify provider or a residential proxy.
- **Keyword Classifier vs. Live LLM:** The offline keyword fallback is fast, zero-cost, and fully deterministic, but can misread sarcasm or nuanced phrasing compared to enabling `GEMINI_API_KEY` or `OPENAI_API_KEY`.
- **Booking.com UI Changes:** While intercepting `/dml/graphql` JSON is far more stable than scraping DOM text, Booking.com can change GraphQL operation names or pagination buttons; fallback selector chains and per-property error logging make failures visible quickly.
- **Sample Data & Weekly Window:** The bundled 96-review dataset is calibrated to each property's live Booking.com rating, review volume, and published policies so the dashboard can be evaluated immediately offline; running `ingest_booking.py` replaces/merges it with fresh live Booking.com reviews. Weekly windows anchor to the latest review date in the dataset so historical snapshots remain reproducible.
