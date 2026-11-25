"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  Lightbulb,
  Wifi,
} from "lucide-react";
import { DashboardPayload, PropertyId } from "@/types";

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <span className="text-xs font-mono text-slate-400">No prior data</span>;
  }
  const positive = delta >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-mono font-semibold px-2 py-0.5 rounded-full ${
        positive ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
      }`}
    >
      {positive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
      {positive ? "+" : ""}
      {delta.toFixed(2)} pts
    </span>
  );
}

export default function PortfolioOverview({
  data,
  onSelectProperty,
  onSelectTopic,
}: {
  data: DashboardPayload;
  onSelectProperty: (id: PropertyId) => void;
  onSelectTopic: (topic: string) => void;
}) {
  const { weekly, portfolio, propertySummaries, weeklyTrends, topicInsights } = data;

  return (
    <div className="space-y-6">
      {/* KPI Row — Directly Answers Current Week, Previous Week Comparison, Sentiment & Live Portfolio */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Current Week Avg Rating
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono text-blue-700">
              {weekly.currentWeekAvg !== null ? weekly.currentWeekAvg.toFixed(2) : "—"}
            </span>
            <span className="text-sm text-slate-500">/ 10</span>
          </div>
          <div className="mt-1.5 text-xs text-slate-500">
            {weekly.currentWeekRange} · {weekly.currentWeekCount} reviews
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
            vs. Previous Week
          </div>
          <div className="mt-2 flex items-center gap-2.5">
            <DeltaBadge delta={weekly.wowDelta} />
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Prev wk ({weekly.previousWeekRange}):{" "}
            <span className="font-mono font-semibold text-slate-700">
              {weekly.previousWeekAvg !== null ? weekly.previousWeekAvg.toFixed(2) : "—"}
            </span>{" "}
            ({weekly.previousWeekCount} rev)
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Sentiment &amp; Ops Triage
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-2xl font-bold font-mono text-emerald-700">
              {portfolio.positiveShare}% pos
            </span>
            <span className="text-sm font-mono font-semibold text-red-700">
              {portfolio.negativeShare}% neg
            </span>
          </div>
          <div className="mt-1.5 text-xs text-slate-500">
            {portfolio.p1OpenCount} P1 urgent · {portfolio.p2OpenCount} P2 recurring
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Live Booking.com Portfolio
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono text-slate-900">
              {portfolio.weightedBookingScore}
            </span>
            <span className="text-sm text-slate-500">/ 10</span>
          </div>
          <div className="mt-1.5 text-xs text-slate-500">
            {portfolio.totalBookingReviews.toLocaleString()} live reviews · Lowest:{" "}
            {portfolio.lowestRatedProperty}
          </div>
        </div>
      </div>

      {/* Plain-English Operational Insights Banner (Exact Trial Example Format) */}
      <div className="bg-slate-900 text-slate-100 rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-blue-300">
            <Lightbulb className="w-4 h-4" />
            Automated Weekly Operational Insights (Click Any Topic to Inspect)
          </div>
          <span className="text-xs text-slate-400">
            Computed from negative review topic tags
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {topicInsights.map((ins) => (
            <button
              key={ins.topic}
              type="button"
              onClick={() => onSelectTopic(ins.topic)}
              className="text-left rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700 px-4 py-3 transition flex items-start justify-between gap-3"
            >
              <div className="text-sm text-slate-100 leading-snug">{ins.headline}</div>
              <span className="font-mono text-sm font-bold text-amber-300 shrink-0">
                {ins.negativeSharePct}%
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Charts Row: Positive vs. Negative Trend + Weekly Score Trend by Property */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">
            Positive vs. Negative Review Trend (Weekly)
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            Weekly volume of positive (≥7.5), neutral (5.5–7.4), and negative (&lt;5.5) guest reviews
          </p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="positive" name="Positive" stackId="a" fill="#059669" />
                <Bar dataKey="neutral" name="Neutral" stackId="a" fill="#f59e0b" />
                <Bar dataKey="negative" name="Negative" stackId="a" fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">
            Weekly Average Rating Trend by Property
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            Compare week-by-week score movement across all four Sydney properties
          </p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weeklyTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis domain={[3, 10]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="darling-harbour" name="Darling Harbour" stroke="#1d4ed8" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="central-sydney" name="Central Sydney" stroke="#0f766e" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="potts-point" name="Potts Point" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="olympic-paddington" name="Olympic Paddington" stroke="#d97706" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Property-by-Property Rating Breakdown */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
          Property-by-Property Rating Breakdown (This Week vs. Last Week)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {propertySummaries.map((s) => (
            <div
              key={s.property.id}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-slate-900">{s.property.shortName}</h3>
                      <span
                        className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                          s.property.hasFreeDinner
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : "bg-slate-100 text-slate-700 border border-slate-200"
                        }`}
                      >
                        {s.property.hasFreeDinner ? "Pod + Free Dinner" : "Pub Hotel (No Dinner)"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{s.property.address}</p>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-2xl font-bold font-mono text-slate-900">
                        {s.currentWeekAvg !== null ? s.currentWeekAvg.toFixed(1) : s.property.bookingScore.toFixed(1)}
                      </span>
                      <DeltaBadge delta={s.wowDelta} />
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      This wk · Live Booking.com: {s.property.bookingScore.toFixed(1)} ({s.property.totalBookingReviews.toLocaleString()})
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-xs bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <div>
                    <div className="text-slate-500">Top Complaint</div>
                    <div className="font-semibold text-red-700 mt-0.5">{s.topComplaintAspect}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Top Strength</div>
                    <div className="font-semibold text-emerald-700 mt-0.5">{s.topPraiseAspect}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 flex items-center gap-1">
                      <Wifi className="w-3 h-3" /> Wi-Fi
                    </div>
                    <div className="font-semibold font-mono text-slate-800 mt-0.5">
                      {s.property.wifiScore.toFixed(1)} / 10
                    </div>
                  </div>
                </div>

                <p className="mt-3 text-xs text-slate-600 leading-relaxed">{s.property.opsNotes}</p>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                <div className="flex items-center gap-2.5">
                  {s.p1Count > 0 && (
                    <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {s.p1Count} P1 alerts
                    </span>
                  )}
                  <a
                    href={s.property.bookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-slate-500 hover:text-blue-700"
                  >
                    Booking.com <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectProperty(s.property.id)}
                  className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
                >
                  Browse {s.sampleCount} reviews <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
