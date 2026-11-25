import { createClient } from "@supabase/supabase-js";
import seedReviewsRaw from "@/data/seed-reviews.json";
import { AZZURRO_PROPERTIES } from "@/data/properties";
import { PropertyId, PropertyMeta, ReviewRecord, SyncRunRecord } from "@/types";

const initialSyncRuns: SyncRunRecord[] = [
  {
    id: "sync-initial-2026-11-24",
    startedAt: "2026-11-24T00:15:00.000Z",
    finishedAt: "2026-11-24T00:15:42.000Z",
    provider: "grounded_sample_seed",
    status: "success",
    reviewsFetched: (seedReviewsRaw as ReviewRecord[]).length,
    reviewsUpserted: (seedReviewsRaw as ReviewRecord[]).length,
    notes:
      "Loaded grounded Booking.com review dataset calibrated to live Azzurro Hotels scores (9,290 total reviews across 4 properties). Configure APIFY_API_TOKEN + Supabase to enable live scheduled refreshes.",
  },
];

// In-memory store used when Supabase env vars are not configured (keeps local/Vercel demo instant)
const memoryStore: {
  reviews: ReviewRecord[];
  syncRuns: SyncRunRecord[];
} = {
  reviews: seedReviewsRaw as ReviewRecord[],
  syncRuns: [...initialSyncRuns],
};

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function getStorageMode(): "supabase" | "local_cached" {
  return process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? "supabase"
    : "local_cached";
}

export async function getProperties(): Promise<PropertyMeta[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return AZZURRO_PROPERTIES;

  const { data, error } = await supabase.from("properties").select("*");
  if (error || !data || data.length === 0) return AZZURRO_PROPERTIES;

  const metaMap = new Map(AZZURRO_PROPERTIES.map((p) => [p.id, p]));
  return data.map((row) => {
    const base = metaMap.get(row.id as PropertyId);
    return {
      id: row.id as PropertyId,
      name: row.name,
      shortName: row.short_name,
      bookingSlug: row.booking_slug,
      bookingUrl: row.booking_url,
      address: row.address,
      propertyType: row.property_type,
      hasFreeDinner: row.has_free_dinner,
      dinnerWindow: row.dinner_window,
      bookingScore: Number(row.booking_score),
      totalBookingReviews: Number(row.total_booking_reviews),
      wifiScore: Number(row.wifi_score),
      opsNotes: base?.opsNotes ?? "",
    };
  });
}

export async function getAllReviews(): Promise<ReviewRecord[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return memoryStore.reviews;

  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .order("review_date", { ascending: false })
    .limit(500);

  if (error || !data || data.length === 0) return memoryStore.reviews;

  return data.map((r) => ({
    id: r.id,
    propertyId: r.property_id as PropertyId,
    externalReviewId: r.external_review_id,
    reviewerName: r.reviewer_name,
    reviewerCountry: r.reviewer_country,
    travelerType: r.traveler_type,
    roomType: r.room_type,
    stayNights: Number(r.stay_nights ?? 1),
    reviewDate: String(r.review_date).slice(0, 10),
    score: Number(r.score),
    title: r.title,
    positiveText: r.positive_text ?? "",
    negativeText: r.negative_text ?? "",
    sentiment: r.sentiment,
    aspects: Array.isArray(r.aspects) ? r.aspects : [],
    severity: r.severity,
    department: r.department,
    opsSummary: r.ops_summary,
    recommendedAction: r.recommended_action,
    draftReply: r.draft_reply,
    sourceMode: r.source_mode ?? "supabase",
  }));
}

export async function getSyncRuns(): Promise<SyncRunRecord[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return memoryStore.syncRuns;

  const { data, error } = await supabase
    .from("sync_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(12);

  if (error || !data || data.length === 0) return memoryStore.syncRuns;

  return data.map((row) => ({
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? row.started_at,
    provider: row.provider,
    status: row.status,
    reviewsFetched: Number(row.reviews_fetched ?? 0),
    reviewsUpserted: Number(row.reviews_upserted ?? 0),
    notes: row.notes ?? "",
  }));
}

export async function recordSyncRun(run: SyncRunRecord, newReviews?: ReviewRecord[]): Promise<void> {
  const supabase = getSupabaseClient();
  if (newReviews && newReviews.length > 0) {
    const existing = new Map(memoryStore.reviews.map((r) => [`${r.propertyId}:${r.externalReviewId}`, r]));
    for (const rev of newReviews) {
      existing.set(`${rev.propertyId}:${rev.externalReviewId}`, rev);
    }
    memoryStore.reviews = Array.from(existing.values()).sort((a, b) =>
      b.reviewDate.localeCompare(a.reviewDate)
    );
  }
  memoryStore.syncRuns = [run, ...memoryStore.syncRuns].slice(0, 15);

  if (!supabase) return;

  if (newReviews && newReviews.length > 0) {
    await supabase.from("reviews").upsert(
      newReviews.map((r) => ({
        id: r.id,
        property_id: r.propertyId,
        external_review_id: r.externalReviewId,
        reviewer_name: r.reviewerName,
        reviewer_country: r.reviewerCountry,
        traveler_type: r.travelerType,
        room_type: r.roomType,
        stay_nights: r.stayNights,
        review_date: r.reviewDate,
        score: r.score,
        title: r.title,
        positive_text: r.positiveText,
        negative_text: r.negativeText,
        sentiment: r.sentiment,
        aspects: r.aspects,
        severity: r.severity,
        department: r.department,
        ops_summary: r.opsSummary,
        recommended_action: r.recommendedAction,
        draft_reply: r.draftReply,
        source_mode: r.sourceMode,
      })),
      { onConflict: "property_id,external_review_id" }
    );
  }

  await supabase.from("sync_runs").insert({
    started_at: run.startedAt,
    finished_at: run.finishedAt,
    provider: run.provider,
    status: run.status,
    reviews_fetched: run.reviewsFetched,
    reviews_upserted: run.reviewsUpserted,
    notes: run.notes,
  });
}
