import { NextRequest, NextResponse } from "next/server";
import { buildDashboardPayload } from "@/lib/analytics";
import { getAllReviews, getProperties, getStorageMode, getSyncRuns } from "@/lib/db";

export const dynamic = "force-dynamic";

function csvEscape(val: unknown): string {
  const s = String(val ?? "").replace(/"/g, '""');
  return `"${s}"`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const [properties, reviews, syncRuns] = await Promise.all([
    getProperties(),
    getAllReviews(),
    getSyncRuns(),
  ]);

  const payload = buildDashboardPayload(properties, reviews, syncRuns, getStorageMode(), {
    propertyId: searchParams.get("property") ?? "all",
    days: Number(searchParams.get("days") ?? "0"),
    startDate: searchParams.get("startDate") || undefined,
    endDate: searchParams.get("endDate") || undefined,
    sentiment: searchParams.get("sentiment") ?? "all",
    aspect: searchParams.get("aspect") ?? "all",
    severity: searchParams.get("severity") ?? "all",
    query: searchParams.get("q") ?? "",
  });

  const propNames = new Map(properties.map((p) => [p.id, p.shortName]));
  const headers = [
    "Review Date",
    "Property",
    "Score",
    "Severity",
    "Sentiment",
    "Department",
    "Topics",
    "Reviewer",
    "Country",
    "Traveler Type",
    "Room Type",
    "Title",
    "Positive",
    "Negative",
    "Ops Summary",
    "Recommended Action",
  ];

  const rows = payload.reviews.map((r) =>
    [
      r.reviewDate,
      propNames.get(r.propertyId) ?? r.propertyId,
      r.score,
      r.severity,
      r.sentiment,
      r.department,
      r.aspects.join("; "),
      r.reviewerName,
      r.reviewerCountry,
      r.travelerType,
      r.roomType,
      r.title,
      r.positiveText,
      r.negativeText,
      r.opsSummary,
      r.recommendedAction,
    ]
      .map(csvEscape)
      .join(",")
  );

  const csv = [headers.map(csvEscape).join(","), ...rows].join("\n");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="azzurro-booking-review-ops-export.csv"',
    },
  });
}
