#!/usr/bin/env python3
"""
Automated pipeline & data-integrity verification suite for Azzurro Hotels Review Insights.
Verifies ingestion deduplication, all 8 required operational topics, current-week vs.
previous-week coverage across all 4 properties, and CSV/JSON exports.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEED_PATH = ROOT / "src" / "data" / "seed-reviews.json"
SAMPLE_JSON = ROOT / "data" / "sample_reviews.json"
SAMPLE_CSV = ROOT / "data" / "sample_reviews.csv"

REQUIRED_TOPICS = {
    "Cleanliness",
    "Check-in experience",
    "Staff or receptionist behaviour",
    "Noise",
    "Facilities",
    "Location",
    "Room condition",
    "Value for money",
}


def main() -> int:
    res = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "ingest_booking.py"), "--provider", "seed", "--enrich"],
        capture_output=True,
        text=True,
        check=True,
    )
    print(res.stdout.strip())

    reviews = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    assert len(reviews) == 96, f"Expected 96 reviews, got {len(reviews)}"
    assert SAMPLE_JSON.exists() and SAMPLE_CSV.exists(), "Sample exports missing"

    expected_props = {"darling-harbour", "central-sydney", "potts-point", "olympic-paddington"}
    assert {r["propertyId"] for r in reviews} == expected_props

    # Verify current week (2026-11-19..2026-11-25) & previous week (2026-11-12..2026-11-18) coverage
    curr_week = [r for r in reviews if "2026-11-19" <= r["reviewDate"] <= "2026-11-25"]
    prev_week = [r for r in reviews if "2026-11-12" <= r["reviewDate"] <= "2026-11-18"]
    assert len(curr_week) == 20, f"Expected 20 current-week reviews, got {len(curr_week)}"
    assert len(prev_week) == 20, f"Expected 20 previous-week reviews, got {len(prev_week)}"
    assert {r["propertyId"] for r in curr_week} == expected_props
    assert {r["propertyId"] for r in prev_week} == expected_props

    seen_ids = set()
    seen_topics = set()
    for r in reviews:
        assert r["id"] not in seen_ids
        seen_ids.add(r["id"])
        assert 1.0 <= float(r["score"]) <= 10.0
        assert r["sentiment"] in {"positive", "neutral", "negative"}
        assert r["severity"] in {"P1", "P2", "praise"}
        seen_topics.update(r["aspects"])
        if r["propertyId"] == "olympic-paddington":
            assert "Free Dinner" not in r["aspects"]

    missing_topics = REQUIRED_TOPICS - seen_topics
    assert not missing_topics, f"Missing required topics in dataset: {missing_topics}"

    print(
        f"ALL PIPELINE CHECKS PASSED ({len(reviews)} reviews, {len(curr_week)} current-week, "
        f"{len(prev_week)} prev-week, all 8 required topics verified)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
