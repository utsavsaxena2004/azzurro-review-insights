import { CORE_ASPECTS } from "@/data/properties";
import { getAiMode } from "@/lib/ai";
import {
  DashboardPayload,
  HeatmapCell,
  OpsIssueCluster,
  PropertyId,
  PropertyMeta,
  PropertySummary,
  ReviewRecord,
  SyncRunRecord,
  TopicInsight,
  WeeklyComparison,
  WeeklyTrendPoint,
} from "@/types";

export interface DashboardFilters {
  propertyId?: string;
  days?: number;
  startDate?: string;
  endDate?: string;
  sentiment?: string;
  aspect?: string;
  severity?: string;
  query?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function avgScoreOrNull(items: ReviewRecord[]): number | null {
  if (items.length === 0) return null;
  return round2(items.reduce((s, r) => s + r.score, 0) / items.length);
}

export function buildDashboardPayload(
  properties: PropertyMeta[],
  allReviews: ReviewRecord[],
  syncRuns: SyncRunRecord[],
  storageMode: "supabase" | "local_cached",
  filters: DashboardFilters = {}
): DashboardPayload {
  // Anchor weekly comparisons to the latest review date in the dataset (e.g. 2026-11-25)
  const latestDateStr =
    allReviews.length > 0
      ? allReviews.reduce((max, r) => (r.reviewDate > max ? r.reviewDate : max), allReviews[0].reviewDate)
      : "2026-11-25";
  const anchorMs = new Date(`${latestDateStr}T00:00:00Z`).getTime();

  const currStartIso = new Date(anchorMs - 6 * DAY_MS).toISOString().slice(0, 10);
  const prevEndIso = new Date(anchorMs - 7 * DAY_MS).toISOString().slice(0, 10);
  const prevStartIso = new Date(anchorMs - 13 * DAY_MS).toISOString().slice(0, 10);

  // Property-scoped (unfiltered by date) for accurate Week-over-Week KPI cards
  const propertyScoped = allReviews.filter((r) => {
    if (filters.propertyId && filters.propertyId !== "all" && r.propertyId !== filters.propertyId) {
      return false;
    }
    return true;
  });

  const currentWeekReviews = propertyScoped.filter(
    (r) => r.reviewDate >= currStartIso && r.reviewDate <= latestDateStr
  );
  const previousWeekReviews = propertyScoped.filter(
    (r) => r.reviewDate >= prevStartIso && r.reviewDate <= prevEndIso
  );

  const currentWeekAvg = avgScoreOrNull(currentWeekReviews);
  const previousWeekAvg = avgScoreOrNull(previousWeekReviews);
  const wowDelta =
    currentWeekAvg !== null && previousWeekAvg !== null
      ? round2(currentWeekAvg - previousWeekAvg)
      : null;

  const weekly: WeeklyComparison = {
    currentWeekAvg,
    previousWeekAvg,
    wowDelta,
    currentWeekCount: currentWeekReviews.length,
    previousWeekCount: previousWeekReviews.length,
    currentWeekRange: `${formatShortDate(currStartIso)} – ${formatShortDate(latestDateStr)}`,
    previousWeekRange: `${formatShortDate(prevStartIso)} – ${formatShortDate(prevEndIso)}`,
  };

  // Full filter set for charts, heatmap, ops queue, and review feed
  const filtered = propertyScoped.filter((r) => {
    if (filters.startDate && r.reviewDate < filters.startDate) return false;
    if (filters.endDate && r.reviewDate > filters.endDate) return false;
    if (!filters.startDate && !filters.endDate && filters.days && filters.days > 0) {
      const diffDays = (anchorMs - new Date(`${r.reviewDate}T00:00:00Z`).getTime()) / DAY_MS;
      if (diffDays >= filters.days) return false;
    }
    if (filters.sentiment && filters.sentiment !== "all" && r.sentiment !== filters.sentiment) {
      return false;
    }
    if (filters.severity && filters.severity !== "all" && r.severity !== filters.severity) {
      return false;
    }
    if (filters.aspect && filters.aspect !== "all" && !r.aspects.includes(filters.aspect)) {
      return false;
    }
    if (filters.query && filters.query.trim()) {
      const q = filters.query.trim().toLowerCase();
      const hay = `${r.title} ${r.positiveText} ${r.negativeText} ${r.reviewerName} ${r.roomType} ${r.department} ${r.aspects.join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Portfolio live Booking.com weighted average
  const totalBookingReviews = properties.reduce((acc, p) => acc + p.totalBookingReviews, 0);
  const weightedBookingScore =
    totalBookingReviews > 0
      ? round2(
          properties.reduce((acc, p) => acc + p.bookingScore * p.totalBookingReviews, 0) /
            totalBookingReviews
        )
      : 0;

  const filteredAvgScore =
    filtered.length > 0
      ? round2(filtered.reduce((acc, r) => acc + r.score, 0) / filtered.length)
      : 0;
  const p1OpenCount = filtered.filter((r) => r.severity === "P1").length;
  const p2OpenCount = filtered.filter((r) => r.severity === "P2").length;
  const positiveShare =
    filtered.length > 0
      ? Math.round((filtered.filter((r) => r.sentiment === "positive").length / filtered.length) * 100)
      : 0;
  const negativeShare =
    filtered.length > 0
      ? Math.round((filtered.filter((r) => r.sentiment === "negative").length / filtered.length) * 100)
      : 0;

  const lowestProp = [...properties].sort((a, b) => a.bookingScore - b.bookingScore)[0];
  const propMap = new Map(properties.map((p) => [p.id, p]));

  // Plain-English percentage-backed topic insights (e.g. "40% of negative reviews this week mentioned Cleanliness-related issues.")
  const negativeBase =
    currentWeekReviews.filter((r) => r.sentiment === "negative" || r.score < 6.0).length > 0
      ? currentWeekReviews.filter((r) => r.sentiment === "negative" || r.score < 6.0)
      : filtered.filter((r) => r.sentiment === "negative" || r.score < 6.0);
  const insightWindowLabel =
    currentWeekReviews.filter((r) => r.sentiment === "negative" || r.score < 6.0).length > 0
      ? "this week"
      : "in this period";

  const topicInsights: TopicInsight[] = CORE_ASPECTS.map((topic) => {
    const matching = negativeBase.filter((r) => r.aspects.includes(topic));
    const pct = negativeBase.length > 0 ? Math.round((matching.length / negativeBase.length) * 100) : 0;
    const byProp = new Map<PropertyId, number>();
    for (const r of matching) {
      byProp.set(r.propertyId, (byProp.get(r.propertyId) ?? 0) + 1);
    }
    const topPropId = Array.from(byProp.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
    const topPropName = topPropId ? propMap.get(topPropId)?.shortName ?? topPropId : "Portfolio";
    return {
      topic,
      negativeSharePct: pct,
      negativeCount: matching.length,
      totalNegativeBase: negativeBase.length,
      topProperty: topPropName,
      headline: `${pct}% of negative reviews ${insightWindowLabel} mentioned ${topic.toLowerCase()}-related issues (most frequent at ${topPropName}).`,
    };
  })
    .filter((t) => t.negativeCount > 0)
    .sort((a, b) => b.negativeSharePct - a.negativeSharePct)
    .slice(0, 4);

  // Per-property summaries with Current Week vs. Previous Week comparison
  const propertySummaries: PropertySummary[] = properties.map((prop) => {
    const propRevs = filtered.filter((r) => r.propertyId === prop.id);
    const propCurr = allReviews.filter(
      (r) => r.propertyId === prop.id && r.reviewDate >= currStartIso && r.reviewDate <= latestDateStr
    );
    const propPrev = allReviews.filter(
      (r) => r.propertyId === prop.id && r.reviewDate >= prevStartIso && r.reviewDate <= prevEndIso
    );
    const pCurrAvg = avgScoreOrNull(propCurr);
    const pPrevAvg = avgScoreOrNull(propPrev);

    const sampleCount = propRevs.length;
    const sampleAvgScore =
      sampleCount > 0 ? round1(propRevs.reduce((acc, r) => acc + r.score, 0) / sampleCount) : prop.bookingScore;
    const positiveRate =
      sampleCount > 0
        ? Math.round((propRevs.filter((r) => r.sentiment === "positive").length / sampleCount) * 100)
        : 0;
    const negativeRate =
      sampleCount > 0
        ? Math.round((propRevs.filter((r) => r.sentiment === "negative").length / sampleCount) * 100)
        : 0;

    const negAspectCounts = new Map<string, number>();
    const posAspectCounts = new Map<string, number>();
    for (const r of propRevs) {
      for (const asp of r.aspects) {
        if (r.score < 6.5) negAspectCounts.set(asp, (negAspectCounts.get(asp) ?? 0) + 1);
        if (r.score >= 7.5) posAspectCounts.set(asp, (posAspectCounts.get(asp) ?? 0) + 1);
      }
    }

    return {
      property: prop,
      sampleCount,
      sampleAvgScore,
      currentWeekAvg: pCurrAvg,
      previousWeekAvg: pPrevAvg,
      wowDelta: pCurrAvg !== null && pPrevAvg !== null ? round2(pCurrAvg - pPrevAvg) : null,
      positiveRate,
      negativeRate,
      p1Count: propRevs.filter((r) => r.severity === "P1").length,
      p2Count: propRevs.filter((r) => r.severity === "P2").length,
      topComplaintAspect:
        Array.from(negAspectCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "None flagged",
      topPraiseAspect:
        Array.from(posAspectCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Location",
    };
  });

  // Weekly Positive vs. Negative & Rating Trends (7-day buckets counting back from anchor)
  const weekBuckets = new Map<number, ReviewRecord[]>();
  for (const r of filtered) {
    const diffDays = Math.max(0, Math.floor((anchorMs - new Date(`${r.reviewDate}T00:00:00Z`).getTime()) / DAY_MS));
    const weekIdx = Math.floor(diffDays / 7);
    const list = weekBuckets.get(weekIdx) ?? [];
    list.push(r);
    weekBuckets.set(weekIdx, list);
  }

  const weeklyTrends: WeeklyTrendPoint[] = Array.from(weekBuckets.entries())
    .sort((a, b) => b[0] - a[0]) // oldest to newest
    .map(([weekIdx, list]) => {
      const startIso = new Date(anchorMs - (weekIdx * 7 + 6) * DAY_MS).toISOString().slice(0, 10);
      const avgFor = (pid: PropertyId) => {
        const sub = list.filter((x) => x.propertyId === pid);
        return sub.length > 0 ? round1(sub.reduce((s, x) => s + x.score, 0) / sub.length) : null;
      };
      return {
        weekStart: startIso,
        label: weekIdx === 0 ? "This Wk" : weekIdx === 1 ? "Last Wk" : formatShortDate(startIso),
        positive: list.filter((x) => x.sentiment === "positive").length,
        neutral: list.filter((x) => x.sentiment === "neutral").length,
        negative: list.filter((x) => x.sentiment === "negative").length,
        avgScore: round1(list.reduce((s, x) => s + x.score, 0) / list.length),
        reviewCount: list.length,
        "darling-harbour": avgFor("darling-harbour"),
        "central-sydney": avgFor("central-sydney"),
        "potts-point": avgFor("potts-point"),
        "olympic-paddington": avgFor("olympic-paddington"),
      };
    });

  // Aspect × Property sentiment heatmap
  const heatmap: HeatmapCell[] = [];
  for (const prop of properties) {
    for (const aspect of CORE_ASPECTS) {
      if (aspect === "Free Dinner" && !prop.hasFreeDinner) {
        heatmap.push({
          propertyId: prop.id,
          aspect,
          mentions: 0,
          avgScore: null,
          negativeCount: 0,
          notApplicable: true,
        });
        continue;
      }
      const matches = filtered.filter((r) => r.propertyId === prop.id && r.aspects.includes(aspect));
      heatmap.push({
        propertyId: prop.id,
        aspect,
        mentions: matches.length,
        avgScore:
          matches.length > 0
            ? round1(matches.reduce((acc, r) => acc + r.score, 0) / matches.length)
            : null,
        negativeCount: matches.filter((r) => r.score < 6.5).length,
      });
    }
  }

  // Operations Action Queue: cluster recurring P1/P2 issues by (propertyId, primary aspect)
  const clusterMap = new Map<string, ReviewRecord[]>();
  for (const r of filtered) {
    if (r.severity === "praise") continue;
    const primaryAspect = r.aspects[0] ?? "Room condition";
    const key = `${r.propertyId}::${primaryAspect}`;
    const arr = clusterMap.get(key) ?? [];
    arr.push(r);
    clusterMap.set(key, arr);
  }

  const opsQueue: OpsIssueCluster[] = Array.from(clusterMap.entries())
    .map(([key, items]) => {
      const [propertyId, aspect] = key.split("::") as [PropertyId, string];
      const prop = propMap.get(propertyId)!;
      const avgAffectedScore = round1(items.reduce((s, x) => s + x.score, 0) / items.length);
      const hasP1 = items.some((x) => x.severity === "P1");
      const propTotal = Math.max(1, filtered.filter((x) => x.propertyId === propertyId).length);
      const estimatedScoreDrag = round2(
        Math.max(0.05, ((7.5 - avgAffectedScore) * items.length) / propTotal)
      );
      const quotes = items
        .filter((x) => x.negativeText)
        .slice(0, 2)
        .map((x) => `"${x.negativeText}" — ${x.reviewerName} (${x.score}/10)`);

      return {
        id: key,
        propertyId,
        propertyName: prop.shortName,
        aspect,
        department: items[0].department,
        severity: (hasP1 ? "P1" : "P2") as "P1" | "P2",
        mentionCount: items.length,
        avgAffectedScore,
        estimatedScoreDrag,
        recommendedAction: items[0].recommendedAction,
        sampleQuotes: quotes,
      };
    })
    .sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "P1" ? -1 : 1;
      return b.estimatedScoreDrag - a.estimatedScoreDrag;
    })
    .slice(0, 12);

  // Weekly GM Brief incorporating WoW delta + top topic insight
  const wowText =
    weekly.currentWeekAvg !== null && weekly.previousWeekAvg !== null && weekly.wowDelta !== null
      ? `This week's average rating is ${weekly.currentWeekAvg.toFixed(2)}/10 (${weekly.wowDelta >= 0 ? "+" : ""}${weekly.wowDelta.toFixed(2)} vs. last week's ${weekly.previousWeekAvg.toFixed(2)}/10 across ${weekly.currentWeekCount} new reviews).`
      : `Weighted Booking.com portfolio score stands at ${weightedBookingScore}/10 across ${totalBookingReviews.toLocaleString()} live reviews.`;

  const weeklyBrief: string[] = [
    wowText,
    topicInsights[0]?.headline ?? "No negative topic clusters flagged this week.",
    topicInsights[1]?.headline ?? `Lowest-rated live property: ${lowestProp.shortName} (${lowestProp.bookingScore}/10).`,
    "Pre-arrival WhatsApp clarity on no-elevator stairs, $10 towel/padlock fees, 3.5% card surcharge, and Olympic Paddington's pub noise/no-dinner policy is the fastest zero-capex score lift.",
  ];

  return {
    storageMode,
    aiMode: getAiMode(),
    generatedAt: new Date().toISOString(),
    properties,
    weekly,
    portfolio: {
      weightedBookingScore,
      totalBookingReviews,
      filteredReviewCount: filtered.length,
      filteredAvgScore,
      p1OpenCount,
      p2OpenCount,
      positiveShare,
      negativeShare,
      lowestRatedProperty: `${lowestProp.shortName} (${lowestProp.bookingScore})`,
    },
    topicInsights,
    propertySummaries,
    weeklyTrends,
    aspects: [...CORE_ASPECTS],
    heatmap,
    opsQueue,
    weeklyBrief,
    reviews: filtered,
    syncRuns,
  };
}
