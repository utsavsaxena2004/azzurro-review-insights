import { NextRequest, NextResponse } from "next/server";
import { buildDashboardPayload } from "@/lib/analytics";
import { getAllReviews, getProperties, getStorageMode, getSyncRuns } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const propertyId = searchParams.get("property") ?? "all";
  const days = Number(searchParams.get("days") ?? "0");
  const startDate = searchParams.get("startDate") ?? "";
  const endDate = searchParams.get("endDate") ?? "";
  const sentiment = searchParams.get("sentiment") ?? "all";
  const aspect = searchParams.get("aspect") ?? "all";
  const severity = searchParams.get("severity") ?? "all";
  const query = searchParams.get("q") ?? "";

  const [properties, reviews, syncRuns] = await Promise.all([
    getProperties(),
    getAllReviews(),
    getSyncRuns(),
  ]);

  const payload = buildDashboardPayload(properties, reviews, syncRuns, getStorageMode(), {
    propertyId,
    days: Number.isFinite(days) ? days : 0,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    sentiment,
    aspect,
    severity,
    query,
  });

  return NextResponse.json(payload);
}
