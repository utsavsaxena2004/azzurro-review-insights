#!/usr/bin/env python3
"""
Azzurro Hotels — Review Topic Classification & AI Operations Triage
Maps every Booking.com review to the 8 core operational topics plus Azzurro's
Free Dinner topic (for the 3 pod hotels only):
  - Cleanliness
  - Check-in experience
  - Staff or receptionist behaviour
  - Noise
  - Facilities
  - Location
  - Room condition
  - Value for money
  - Free Dinner (pod hotels only; excluded for Olympic Hotel Paddington)

Uses Gemini (GEMINI_API_KEY) or OpenAI (OPENAI_API_KEY) when configured,
and falls back cleanly to a deterministic hospitality-ops keyword classifier offline.
"""

from __future__ import annotations

import json
import os
import urllib.request
from typing import Any

ASPECT_KEYWORDS: dict[str, tuple[str, ...]] = {
    "Cleanliness": (
        "clean", "dirty", "hair", "mold", "mould", "smell", "stain", "dust",
        "housekeeping", "hygiene", "messy", "filthy", "fresh linen", "soap",
    ),
    "Check-in experience": (
        "check-in", "check in", "check-out", "checkout", "code", "keycard",
        "arrival", "late check", "reception took", "locked out", "instructions",
    ),
    "Staff or receptionist behaviour": (
        "staff", "host", "receptionist", "reception", "manager", "friendly",
        "rude", "helpful", "service", "welcoming", "whatsapp", "polite",
    ),
    "Noise": (
        "noise", "noisy", "loud", "pub", "bar", "music", "stadium", "snoring",
        "thin walls", "street", "slam", "bass", "earplugs", "sleep",
    ),
    "Facilities": (
        "bathroom", "shower", "toilet", "drain", "hot water", "wifi", "wi-fi",
        "elevator", "lift", "stairs", "kitchen", "laundry", "locker", "terrace",
        "parking", "water pressure", "shared bathroom",
    ),
    "Location": (
        "location", "central", "walk", "station", "harbour", "darling", "scg",
        "allianz", "kings cross", "convenient", "paddington", "chinatown", "cafes",
    ),
    "Room condition": (
        "pod", "bed", "mattress", "pillow", "blanket", "ac", "aircon", "air con",
        "ventilation", "curtain", "stuffy", "cramped", "carpet", "light", "broken",
        "dated", "compact", "kitchenette",
    ),
    "Value for money": (
        "value", "price", "cheap", "budget", "towel", "padlock", "surcharge",
        "3.5%", "fee", "charge", "extra", "worth", "money", "expensive", "fortune",
    ),
    "Free Dinner": (
        "dinner", "pasta", "meal", "food", "portion", "home-cooked",
    ),
}

ASPECT_TO_DEPARTMENT: dict[str, str] = {
    "Cleanliness": "Housekeeping",
    "Check-in experience": "Front Desk",
    "Staff or receptionist behaviour": "Front Desk",
    "Noise": "Operations",
    "Facilities": "Maintenance",
    "Location": "Management",
    "Room condition": "Maintenance",
    "Value for money": "Revenue & Front Desk",
    "Free Dinner": "F&B / Kitchen",
}

ACTION_PLAYBOOK: dict[str, str] = {
    "Cleanliness": "Schedule immediate housekeeping spot-check and enforce midday bathroom/room sign-off.",
    "Check-in experience": "Audit automated pre-arrival WhatsApp codes and streamline after-hours check-in instructions.",
    "Staff or receptionist behaviour": "Review shift handoff logs and coach front-desk team on response SLA and guest tone.",
    "Noise": "Enforce 10 PM quiet-hours signage, inspect door closers, and offer complimentary earplugs at check-in.",
    "Facilities": "Dispatch maintenance to inspect shower drainage, hot-water pressure, and floor Wi-Fi access points.",
    "Location": "Highlight proximity and local transit routes in pre-arrival guest guide.",
    "Room condition": "Inspect pod ventilation, AC thermostat calibration, lighting hardware, and mattress condition.",
    "Value for money": "Send clear pre-arrival summary covering $10 towel/padlock fees, 3.5% card surcharge, and no-elevator access.",
    "Free Dinner": "Replenish dinner trays halfway through the serving window and post clear start/end times.",
}


def call_gemini_enrichment(review: dict[str, Any], prop: dict[str, Any]) -> dict[str, Any] | None:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None
    allowed_topics = [
        k for k in ASPECT_KEYWORDS.keys()
        if not (k == "Free Dinner" and not prop.get("hasFreeDinner", True))
    ]
    prompt = (
        f"You are an Operations Analyst for Azzurro Hotels in Sydney. Analyze this Booking.com review for "
        f"{prop['name']} (hasFreeDinner={prop['hasFreeDinner']}). Return ONLY valid JSON with keys: "
        f"sentiment ('positive'|'neutral'|'negative'), aspects (1-4 items strictly from {allowed_topics}), "
        f"severity ('P1'|'P2'|'praise'), department (string), opsSummary (max 18 words), "
        f"recommendedAction (max 22 words), draftReply (warm, concise 2-3 sentence manager reply).\n"
        f"Score: {review['score']}/10\nTitle: {review['title']}\n"
        f"Liked: {review.get('positiveText', '')}\nDisliked: {review.get('negativeText', '')}"
    )
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2},
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        text = payload["candidates"][0]["content"]["parts"][0]["text"]
        parsed = json.loads(text)
        # Enforce allowed topic list
        parsed["aspects"] = [a for a in parsed.get("aspects", []) if a in allowed_topics] or ["Room condition"]
        return parsed
    except Exception:
        return None


def deterministic_enrichment(review: dict[str, Any], prop: dict[str, Any]) -> dict[str, Any]:
    score = float(review["score"])
    pos = (review.get("positiveText") or "").lower()
    neg = (review.get("negativeText") or "").lower()
    combined = f"{review.get('title', '').lower()} {pos} {neg}"

    # Match aspects, prioritizing negative-text matches first so primary topic reflects operational pain
    neg_matches: list[str] = []
    pos_matches: list[str] = []
    for aspect, keywords in ASPECT_KEYWORDS.items():
        if aspect == "Free Dinner" and not prop.get("hasFreeDinner", True):
            continue
        if any(kw in neg for kw in keywords):
            neg_matches.append(aspect)
        elif any(kw in combined for kw in keywords):
            pos_matches.append(aspect)

    matched_aspects = neg_matches + pos_matches
    if not matched_aspects:
        matched_aspects = ["Location" if score >= 7.0 else "Room condition"]

    if score >= 7.5:
        sentiment = "positive"
    elif score >= 5.5:
        sentiment = "neutral"
    else:
        sentiment = "negative"

    primary_aspect = neg_matches[0] if neg_matches else matched_aspects[0]

    urgent_markers = (
        "mold", "mould", "bug", "dirty", "broken", "no hot water",
        "unsafe", "locked out", "clogged", "rude", "filthy", "hair",
    )
    if score <= 5.0 or (score <= 6.5 and any(m in neg for m in urgent_markers)):
        severity = "P1"
    elif score < 7.5 or bool(neg.strip()):
        severity = "P2"
    else:
        severity = "praise"

    department = ASPECT_TO_DEPARTMENT.get(primary_aspect, "Operations")
    action = ACTION_PLAYBOOK.get(primary_aspect, "Review feedback in weekly property standup.")

    if severity == "praise":
        ops_summary = f"Guest praised {', '.join(matched_aspects[:2]).lower()} ({score}/10)."
        draft_reply = (
            f"Hi {review['reviewerName']}, thank you for staying with us at {prop['shortName']} and for the {score}/10 rating! "
            f"We're glad you enjoyed your stay, and our team looks forward to welcoming you back to Sydney soon."
        )
    elif severity == "P1":
        ops_summary = f"Urgent {primary_aspect.lower()} issue driving low {score}/10 rating."
        draft_reply = (
            f"Hi {review['reviewerName']}, thank you for flagging your experience regarding {primary_aspect.lower()} at {prop['shortName']}. "
            f"This falls short of our standard—we've escalated this directly to our {department} lead to resolve promptly and appreciate your honest feedback."
        )
    else:
        ops_summary = f"Recurring {primary_aspect.lower()} friction noted alongside {score}/10 rating."
        draft_reply = (
            f"Hi {review['reviewerName']}, thanks for sharing feedback on your stay at {prop['shortName']}. "
            f"We've shared your comments around {primary_aspect.lower()} with our {department} team as we continue improving guest comfort."
        )

    return {
        "sentiment": sentiment,
        "aspects": matched_aspects[:4],
        "severity": severity,
        "department": department,
        "opsSummary": ops_summary,
        "recommendedAction": action,
        "draftReply": draft_reply,
    }


def enrich_review(review: dict[str, Any], prop: dict[str, Any]) -> dict[str, Any]:
    ai_result = call_gemini_enrichment(review, prop)
    enriched = ai_result if ai_result else deterministic_enrichment(review, prop)
    return {**review, **enriched}
