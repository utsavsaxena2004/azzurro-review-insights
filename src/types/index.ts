export type PropertyId =
  | "darling-harbour"
  | "central-sydney"
  | "potts-point"
  | "olympic-paddington";

export type Sentiment = "positive" | "neutral" | "negative";
export type Severity = "P1" | "P2" | "praise";

export interface PropertyMeta {
  id: PropertyId;
  name: string;
  shortName: string;
  bookingSlug: string;
  bookingUrl: string;
  address: string;
  propertyType: "pod_hotel" | "boutique_pub_hotel";
  hasFreeDinner: boolean;
  dinnerWindow: string | null;
  bookingScore: number;
  totalBookingReviews: number;
  wifiScore: number;
  opsNotes: string;
}

export interface ReviewRecord {
  id: string;
  propertyId: PropertyId;
  externalReviewId: string;
  reviewerName: string;
  reviewerCountry: string;
  travelerType: string;
  roomType: string;
  stayNights: number;
  reviewDate: string; // YYYY-MM-DD
  score: number;
  title: string;
  positiveText: string;
  negativeText: string;
  sentiment: Sentiment;
  aspects: string[];
  severity: Severity;
  department: string;
  opsSummary: string;
  recommendedAction: string;
  draftReply: string;
  sourceMode: string;
}

export interface SyncRunRecord {
  id: string;
  startedAt: string;
  finishedAt: string;
  provider: string;
  status: "success" | "partial" | "failed";
  reviewsFetched: number;
  reviewsUpserted: number;
  notes: string;
}

export interface WeeklyComparison {
  currentWeekAvg: number | null;
  previousWeekAvg: number | null;
  wowDelta: number | null;
  currentWeekCount: number;
  previousWeekCount: number;
  currentWeekRange: string;
  previousWeekRange: string;
}

export interface PropertySummary {
  property: PropertyMeta;
  sampleCount: number;
  sampleAvgScore: number;
  currentWeekAvg: number | null;
  previousWeekAvg: number | null;
  wowDelta: number | null;
  positiveRate: number;
  negativeRate: number;
  p1Count: number;
  p2Count: number;
  topComplaintAspect: string;
  topPraiseAspect: string;
}

export interface WeeklyTrendPoint {
  weekStart: string; // YYYY-MM-DD
  label: string;     // e.g. "Nov 19"
  positive: number;
  neutral: number;
  negative: number;
  avgScore: number;
  reviewCount: number;
  "darling-harbour": number | null;
  "central-sydney": number | null;
  "potts-point": number | null;
  "olympic-paddington": number | null;
}

export interface TopicInsight {
  topic: string;
  negativeSharePct: number;
  negativeCount: number;
  totalNegativeBase: number;
  topProperty: string;
  headline: string;
}

export interface HeatmapCell {
  propertyId: PropertyId;
  aspect: string;
  mentions: number;
  avgScore: number | null;
  negativeCount: number;
  notApplicable?: boolean;
}

export interface OpsIssueCluster {
  id: string;
  propertyId: PropertyId;
  propertyName: string;
  aspect: string;
  department: string;
  severity: "P1" | "P2";
  mentionCount: number;
  avgAffectedScore: number;
  estimatedScoreDrag: number;
  recommendedAction: string;
  sampleQuotes: string[];
}

export interface DashboardPayload {
  storageMode: "supabase" | "local_cached";
  aiMode: "gemini" | "openai" | "deterministic";
  generatedAt: string;
  properties: PropertyMeta[];
  weekly: WeeklyComparison;
  portfolio: {
    weightedBookingScore: number;
    totalBookingReviews: number;
    filteredReviewCount: number;
    filteredAvgScore: number;
    p1OpenCount: number;
    p2OpenCount: number;
    positiveShare: number;
    negativeShare: number;
    lowestRatedProperty: string;
  };
  topicInsights: TopicInsight[];
  propertySummaries: PropertySummary[];
  weeklyTrends: WeeklyTrendPoint[];
  aspects: string[];
  heatmap: HeatmapCell[];
  opsQueue: OpsIssueCluster[];
  weeklyBrief: string[];
  reviews: ReviewRecord[];
  syncRuns: SyncRunRecord[];
}
