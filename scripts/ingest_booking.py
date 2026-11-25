#!/usr/bin/env python3
"""
Azzurro Hotels — Resilient Booking.com Review Ingestion Worker
Collects publicly available Booking.com guest reviews for all 4 Azzurro properties:
  - Olympic Hotel Paddington (olympic-paddington)
  - Potts Point (venus-potts-point-sydney)
  - Central Sydney (venus-surry-hills)
  - Darling Harbour (chateau-de-venus)

Resilience & Data Quality Features:
  - Three providers: apify (WAF-safe cloud API), playwright (headless Chromium GraphQL
    interceptor + DOM selector fallback), and seed (offline verification).
  - Exponential backoff retries (up to 3 attempts per property) for transient network/WAF errors.
  - Per-property fault isolation: if one property fails, the remaining properties still sync.
  - Incremental merge + deterministic deduplication keyed by (propertyId, externalReviewId).
  - Exports updated JSON and CSV sample files plus optional Supabase PostgreSQL upsert.

Usage:
  python3 scripts/ingest_booking.py --provider playwright --max-per-property 50 --enrich
  python3 scripts/ingest_booking.py --provider apify --max-per-property 100 --enrich --push-supabase
  python3 scripts/ingest_booking.py --provider seed --enrich
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from enrich_reviews import enrich_review

ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT_DIR / "src" / "data" / "seed-reviews.json"
SAMPLE_JSON_OUT = ROOT_DIR / "data" / "sample_reviews.json"
SAMPLE_CSV_OUT = ROOT_DIR / "data" / "sample_reviews.csv"

PROPERTIES: list[dict[str, Any]] = [
    {
        "id": "darling-harbour",
        "name": "Azzurro Pod Hotel Darling Harbour - Near Convention Center",
        "shortName": "Darling Harbour",
        "bookingSlug": "chateau-de-venus",
        "bookingUrl": "https://www.booking.com/hotel/au/chateau-de-venus.html",
        "address": "22 Allen Street, Pyrmont NSW 2009",
        "propertyType": "pod_hotel",
        "hasFreeDinner": True,
    },
    {
        "id": "central-sydney",
        "name": "Azzurro Pod Hotel Central Sydney - Near Central Station",
        "shortName": "Central Sydney",
        "bookingSlug": "venus-surry-hills",
        "bookingUrl": "https://www.booking.com/hotel/au/venus-surry-hills.html",
        "address": "90 Wentworth Avenue, Surry Hills NSW 2010",
        "propertyType": "pod_hotel",
        "hasFreeDinner": True,
    },
    {
        "id": "potts-point",
        "name": "Azzurro Pod Hotel Potts Point - Near Kings Cross Station",
        "shortName": "Potts Point",
        "bookingSlug": "venus-potts-point-sydney",
        "bookingUrl": "https://www.booking.com/hotel/au/venus-potts-point-sydney.html",
        "address": "141–143 Victoria Street, Potts Point NSW 2011",
        "propertyType": "pod_hotel",
        "hasFreeDinner": True,
    },
    {
        "id": "olympic-paddington",
        "name": "Olympic Hotel Paddington",
        "shortName": "Olympic Paddington",
        "bookingSlug": "olympic-paddington",
        "bookingUrl": "https://www.booking.com/hotel/au/olympic-paddington.html",
        "address": "308 Moore Park Road, Paddington NSW 2021",
        "propertyType": "boutique_pub_hotel",
        "hasFreeDinner": False,
    },
]

# Fallback CSS selectors in case Booking.com changes UI attributes
REVIEW_DRAWER_SELECTORS = [
    '[data-testid="review-score-right-component"]',
    '[data-testid="read-all-actionable"]',
    'a[href*="#tab-reviews"]',
    'button:has-text("Read all reviews")',
]

NEXT_PAGE_SELECTORS = [
    'button[aria-label="Next page"]',
    '[data-testid="review-pagination-next"]',
    'a.pagenext',
]


def deterministic_id(property_id: str, external_id: str) -> str:
    digest = hashlib.sha256(f"{property_id}:{external_id}".encode("utf-8")).hexdigest()[:12]
    return f"rev_{property_id[:4]}_{digest}"


def with_retries(fn: Any, label: str, max_attempts: int = 3, base_delay: float = 2.0) -> Any:
    last_err: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            return fn()
        except Exception as exc:
            last_err = exc
            if attempt < max_attempts:
                sleep_s = base_delay * (2 ** (attempt - 1))
                print(f"[retry] {label} failed (attempt {attempt}/{max_attempts}): {exc}. Waiting {sleep_s:.1f}s...", file=sys.stderr)
                time.sleep(sleep_s)
    raise RuntimeError(f"{label} failed after {max_attempts} attempts: {last_err}")


def normalize_apify_item(prop: dict[str, Any], raw: dict[str, Any]) -> dict[str, Any]:
    ext_id = str(
        raw.get("reviewId")
        or raw.get("id")
        or hashlib.md5(
            f"{raw.get('userName','')}|{raw.get('reviewDate','')}|{raw.get('reviewTitle','')}".encode()
        ).hexdigest()[:12]
    )
    score = float(raw.get("rating") or raw.get("score") or 6.5)
    if score <= 5.0 and raw.get("maxRating") == 5:
        score = round(score * 2.0, 1)
    review_date = str(raw.get("reviewDate") or raw.get("reviewedAt") or datetime.now(timezone.utc).date())[:10]
    return {
        "id": deterministic_id(prop["id"], ext_id),
        "propertyId": prop["id"],
        "externalReviewId": ext_id,
        "reviewerName": raw.get("userName") or raw.get("reviewerName") or "Verified Guest",
        "reviewerCountry": raw.get("userLocation") or raw.get("country") or "Australia",
        "travelerType": raw.get("travelerType") or "Solo traveler",
        "roomType": raw.get("roomInfo") or raw.get("roomType") or "Standard Room",
        "stayNights": int(raw.get("numberOfNights") or 2),
        "reviewDate": review_date,
        "score": round(min(10.0, max(1.0, score)), 1),
        "title": raw.get("reviewTitle") or raw.get("title") or "Guest Review",
        "positiveText": (raw.get("likedText") or raw.get("positiveText") or "").strip(),
        "negativeText": (raw.get("dislikedText") or raw.get("negativeText") or "").strip(),
        "sourceMode": "live_apify",
    }


def fetch_via_apify(max_per_property: int) -> tuple[list[dict[str, Any]], list[str]]:
    token = os.getenv("APIFY_API_TOKEN", "").strip()
    if not token:
        raise RuntimeError("APIFY_API_TOKEN is not set. Export it in .env or use --provider playwright/seed.")

    actor = os.getenv("APIFY_BOOKING_ACTOR", "voyager~booking-reviews-scraper")
    endpoint = f"https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items?token={token}"

    def _call() -> list[dict[str, Any]]:
        payload = {
            "startUrls": [{"url": p["bookingUrl"]} for p in PROPERTIES],
            "maxReviewsPerHotel": max_per_property,
            "sortReviewsBy": "f_recent_desc",
        }
        req = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=180) as resp:
            return json.loads(resp.read().decode("utf-8"))

    items = with_retries(_call, "Apify Booking.com sync")
    slug_map = {p["bookingSlug"]: p for p in PROPERTIES}
    normalized: list[dict[str, Any]] = []
    for item in items:
        url = str(item.get("hotelUrl") or item.get("url") or "")
        matched = next((p for slug, p in slug_map.items() if slug in url), None)
        if matched:
            normalized.append(normalize_apify_item(matched, item))
    return normalized, []


def fetch_via_playwright(max_per_property: int) -> tuple[list[dict[str, Any]], list[str]]:
    """
    Launches headless Chromium, opens each Booking.com property page, expands the
    reviews drawer using resilient fallback selectors, and intercepts /dml/graphql
    ReviewListFrontend JSON payloads with per-property fault isolation.
    """
    try:
        from playwright.sync_api import sync_playwright  # type: ignore
    except ImportError as exc:
        raise RuntimeError(
            "Playwright is not installed. Run: pip install playwright && playwright install chromium"
        ) from exc

    collected: list[dict[str, Any]] = []
    errors: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1366, "height": 900},
            locale="en-AU",
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
            ),
        )
        for prop in PROPERTIES:
            def _scrape_property(target: dict[str, Any] = prop) -> list[dict[str, Any]]:
                prop_reviews: list[dict[str, Any]] = []
                page = context.new_page()
                try:
                    def handle_response(response: Any) -> None:
                        if "/dml/graphql" not in response.url or response.status != 200:
                            return
                        try:
                            data = response.json()
                            cards = (
                                data.get("data", {})
                                .get("reviewListFrontend", {})
                                .get("reviewCard", [])
                            )
                            for card in cards:
                                if len(prop_reviews) >= max_per_property:
                                    return
                                guest = card.get("guestDetails") or {}
                                booking = card.get("bookingDetails") or {}
                                text = card.get("textDetails") or {}
                                ext_id = str(card.get("reviewUrl") or card.get("id") or len(prop_reviews))
                                prop_reviews.append(
                                    {
                                        "id": deterministic_id(target["id"], ext_id),
                                        "propertyId": target["id"],
                                        "externalReviewId": ext_id,
                                        "reviewerName": guest.get("username") or "Verified Guest",
                                        "reviewerCountry": guest.get("countryName") or "Australia",
                                        "travelerType": booking.get("customerType") or "Solo traveler",
                                        "roomType": (booking.get("roomType") or {}).get("name") or "Standard Room",
                                        "stayNights": int(booking.get("numNights") or 2),
                                        "reviewDate": str(card.get("reviewedDate") or datetime.now(timezone.utc).date())[:10],
                                        "score": round(float(card.get("reviewScore") or 6.5), 1),
                                        "title": text.get("title") or "Guest Review",
                                        "positiveText": (text.get("positiveText") or "").strip(),
                                        "negativeText": (text.get("negativeText") or "").strip(),
                                        "sourceMode": "live_playwright",
                                    }
                                )
                        except Exception:
                            return

                    page.on("response", handle_response)
                    page.goto(target["bookingUrl"], wait_until="domcontentloaded", timeout=45000)
                    page.wait_for_timeout(2800)

                    # Try resilient selector chain to open reviews drawer
                    for sel in REVIEW_DRAWER_SELECTORS:
                        loc = page.locator(sel).first
                        if loc.is_visible():
                            loc.click()
                            page.wait_for_timeout(2800)
                            break

                    for _ in range(max(1, max_per_property // 10)):
                        if len(prop_reviews) >= max_per_property:
                            break
                        clicked_next = False
                        for next_sel in NEXT_PAGE_SELECTORS:
                            btn = page.locator(next_sel).first
                            if btn.is_visible() and btn.is_enabled():
                                btn.click()
                                page.wait_for_timeout(1800)
                                clicked_next = True
                                break
                        if not clicked_next:
                            break
                    return prop_reviews
                finally:
                    page.close()

            try:
                rows = with_retries(_scrape_property, f"Playwright scrape ({prop['shortName']})", max_attempts=2)
                collected.extend(rows)
            except Exception as exc:
                errors.append(f"{prop['shortName']}: {exc}")
                print(f"[warn] Partial failure for {prop['shortName']}: {exc}", file=sys.stderr)

        browser.close()
    return collected, errors


def write_sample_exports(reviews: list[dict[str, Any]]) -> None:
    SAMPLE_JSON_OUT.parent.mkdir(parents=True, exist_ok=True)
    SAMPLE_JSON_OUT.write_text(json.dumps(reviews, indent=2, ensure_ascii=False), encoding="utf-8")

    fieldnames = [
        "id", "propertyId", "externalReviewId", "reviewDate", "score",
        "sentiment", "severity", "department", "aspects", "reviewerName",
        "reviewerCountry", "travelerType", "roomType", "stayNights",
        "title", "positiveText", "negativeText", "opsSummary", "recommendedAction",
    ]
    with SAMPLE_CSV_OUT.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in reviews:
            row = {k: r.get(k, "") for k in fieldnames}
            row["aspects"] = "; ".join(r.get("aspects", []))
            writer.writerow(row)


def push_to_supabase(reviews: list[dict[str, Any]], provider: str, status: str, notes: str) -> None:
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not supabase_url or not service_key:
        raise RuntimeError("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --push-supabase.")

    rows = [
        {
            "id": r["id"],
            "property_id": r["propertyId"],
            "external_review_id": r["externalReviewId"],
            "reviewer_name": r["reviewerName"],
            "reviewer_country": r["reviewerCountry"],
            "traveler_type": r["travelerType"],
            "room_type": r["roomType"],
            "stay_nights": r["stayNights"],
            "review_date": r["reviewDate"],
            "score": r["score"],
            "title": r["title"],
            "positive_text": r["positiveText"],
            "negative_text": r["negativeText"],
            "sentiment": r["sentiment"],
            "aspects": r["aspects"],
            "severity": r["severity"],
            "department": r["department"],
            "ops_summary": r["opsSummary"],
            "recommended_action": r["recommendedAction"],
            "draft_reply": r["draftReply"],
            "source_mode": r.get("sourceMode", provider),
        }
        for r in reviews
    ]

    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    req = urllib.request.Request(
        f"{supabase_url}/rest/v1/reviews?on_conflict=property_id,external_review_id",
        data=json.dumps(rows).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        if resp.status not in (200, 201):
            raise RuntimeError(f"Supabase upsert failed with HTTP {resp.status}")

    sync_row = {
        "provider": provider,
        "status": status,
        "reviews_fetched": len(reviews),
        "reviews_upserted": len(reviews),
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "notes": notes,
    }
    log_req = urllib.request.Request(
        f"{supabase_url}/rest/v1/sync_runs",
        data=json.dumps(sync_row).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(log_req, timeout=30):
        pass


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest Booking.com reviews for Azzurro Hotels.")
    parser.add_argument("--provider", choices=["apify", "playwright", "seed"], default="seed")
    parser.add_argument("--max-per-property", type=int, default=50)
    parser.add_argument("--enrich", action="store_true", help="Run AI / keyword ops classification.")
    parser.add_argument("--no-merge", action="store_true", help="Replace existing dataset instead of incremental merge.")
    parser.add_argument("--push-supabase", action="store_true", help="Upsert results to Supabase Postgres.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    errors: list[str] = []
    if args.provider == "apify":
        fetched, errors = fetch_via_apify(args.max_per_property)
    elif args.provider == "playwright":
        fetched, errors = fetch_via_playwright(args.max_per_property)
    else:
        if not args.output.exists():
            print(f"Seed file not found at {args.output}", file=sys.stderr)
            return 1
        fetched = json.loads(args.output.read_text(encoding="utf-8"))

    prop_lookup = {p["id"]: p for p in PROPERTIES}
    if args.enrich:
        fetched = [enrich_review(r, prop_lookup[r["propertyId"]]) for r in fetched]

    # Incremental merge with existing reviews + deduplication by (propertyId, externalReviewId)
    deduped: dict[tuple[str, str], dict[str, Any]] = {}
    if not args.no_merge and args.output.exists():
        for existing in json.loads(args.output.read_text(encoding="utf-8")):
            deduped[(existing["propertyId"], existing["externalReviewId"])] = existing
    for rev in fetched:
        deduped[(rev["propertyId"], rev["externalReviewId"])] = rev

    final_reviews = sorted(deduped.values(), key=lambda x: x["reviewDate"], reverse=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(final_reviews, indent=2, ensure_ascii=False), encoding="utf-8")
    write_sample_exports(final_reviews)

    status = "partial" if errors else "success"
    notes = f"Synced {len(fetched)} reviews ({len(final_reviews)} total deduplicated). Errors: {len(errors)}."
    print(f"[ingest_booking] {notes}")

    if args.push_supabase:
        push_to_supabase(final_reviews, args.provider, status, notes)
        print("[ingest_booking] Upserted reviews and logged sync_run in Supabase.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
