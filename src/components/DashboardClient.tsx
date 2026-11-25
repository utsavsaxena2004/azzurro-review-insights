"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Download,
  Filter,
  Grid3X3,
  MessageSquareText,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { DashboardPayload } from "@/types";
import PortfolioOverview from "./PortfolioOverview";
import AspectHeatmap from "./AspectHeatmap";
import OpsActionQueue from "./OpsActionQueue";
import ReviewExplorer from "./ReviewExplorer";
import SyncPipelinePanel from "./SyncPipelinePanel";

type TabId = "overview" | "heatmap" | "ops" | "reviews" | "pipeline";

export default function DashboardClient({ initialData }: { initialData: DashboardPayload }) {
  const [data, setData] = useState<DashboardPayload>(initialData);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [propertyId, setPropertyId] = useState<string>("all");
  const [days, setDays] = useState<string>("0");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [sentiment, setSentiment] = useState<string>("all");
  const [aspect, setAspect] = useState<string>("all");
  const [severity, setSeverity] = useState<string>("all");
  const [query, setQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncBanner, setSyncBanner] = useState<string | null>(null);

  const buildQueryString = useCallback(() => {
    const params = new URLSearchParams();
    if (propertyId !== "all") params.set("property", propertyId);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (!startDate && !endDate && days !== "0") params.set("days", days);
    if (sentiment !== "all") params.set("sentiment", sentiment);
    if (aspect !== "all") params.set("aspect", aspect);
    if (severity !== "all") params.set("severity", severity);
    if (query.trim()) params.set("q", query.trim());
    return params.toString();
  }, [propertyId, days, startDate, endDate, sentiment, aspect, severity, query]);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const qs = buildQueryString();
      const res = await fetch(`/api/dashboard${qs ? `?${qs}` : ""}`, { cache: "no-store" });
      if (res.ok) {
        const json = (await res.json()) as DashboardPayload;
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, [buildQueryString]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchDashboard();
    }, 180);
    return () => clearTimeout(timer);
  }, [fetchDashboard]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncBanner(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const json = await res.json();
      setSyncBanner(json?.run?.notes ?? "Sync completed.");
      await fetchDashboard();
    } catch {
      setSyncBanner("Sync request failed. Check network or APIFY_API_TOKEN.");
    } finally {
      setSyncing(false);
    }
  };

  const resetFilters = () => {
    setPropertyId("all");
    setDays("0");
    setStartDate("");
    setEndDate("");
    setSentiment("all");
    setAspect("all");
    setSeverity("all");
    setQuery("");
  };

  const exportUrl = `/api/export${buildQueryString() ? `?${buildQueryString()}` : ""}`;

  const tabs: { id: TabId; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "overview", label: "Portfolio Overview", icon: <BarChart3 className="w-4 h-4" /> },
    { id: "ops", label: "Ops Action Queue", icon: <AlertTriangle className="w-4 h-4" />, badge: data.opsQueue.length },
    { id: "heatmap", label: "Topic Heatmap", icon: <Grid3X3 className="w-4 h-4" /> },
    { id: "reviews", label: "Review Feed", icon: <MessageSquareText className="w-4 h-4" />, badge: data.reviews.length },
    { id: "pipeline", label: "Sync & Pipeline", icon: <Activity className="w-4 h-4" /> },
  ];

  const hasActiveFilters =
    propertyId !== "all" ||
    days !== "0" ||
    Boolean(startDate) ||
    Boolean(endDate) ||
    sentiment !== "all" ||
    aspect !== "all" ||
    severity !== "all" ||
    Boolean(query);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-700 text-white font-bold text-sm">
                AZ
              </span>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                Azzurro Hotels — Booking.com Review Insights
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              4 Sydney Properties · {data.portfolio.totalBookingReviews.toLocaleString()} live Booking.com reviews ·{" "}
              <span className="font-mono text-slate-700">
                {data.storageMode === "supabase" ? "Supabase Postgres" : "Cached Demo Store"}
              </span>{" "}
              ·{" "}
              <span className="font-mono text-slate-700">
                Classifier: {data.aiMode === "deterministic" ? "Keyword + Ops Rules" : data.aiMode}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <a
              href={exportUrl}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </a>
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-60 transition"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing..." : "Sync Booking.com"}
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-1 overflow-x-auto border-t border-slate-100">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition ${
                  active
                    ? "border-blue-700 text-blue-700"
                    : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.icon}
                {tab.label}
                {typeof tab.badge === "number" && (
                  <span
                    className={`text-xs font-mono px-1.5 py-0.5 rounded-full ${
                      active ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {syncBanner && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 flex items-start justify-between gap-4">
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 mt-0.5 shrink-0 text-blue-700" />
              <span>{syncBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setSyncBanner(null)}
              className="text-xs font-medium text-blue-700 hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Global Filter Bar with Date Range & Property Filters */}
        <section className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 mr-1">
              <Filter className="w-3.5 h-3.5" />
              Filters
            </div>

            <select
              aria-label="Filter by property"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="text-sm rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">All 4 Sydney Properties</option>
              {data.properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.shortName} ({p.bookingScore})
                </option>
              ))}
            </select>

            <select
              aria-label="Quick date range"
              value={startDate || endDate ? "custom" : days}
              onChange={(e) => {
                setStartDate("");
                setEndDate("");
                setDays(e.target.value === "custom" ? "0" : e.target.value);
              }}
              className="text-sm rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="0">All Collected Dates (10 Wks)</option>
              <option value="7">Current Week (Last 7 Days)</option>
              <option value="14">Last 14 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="60">Last 60 Days</option>
              {(startDate || endDate) && <option value="custom">Custom Date Range</option>}
            </select>

            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <span>From</span>
              <input
                type="date"
                aria-label="Start date"
                value={startDate}
                onChange={(e) => {
                  setDays("0");
                  setStartDate(e.target.value);
                }}
                className="text-xs rounded-lg border border-slate-300 px-2 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <span>to</span>
              <input
                type="date"
                aria-label="End date"
                value={endDate}
                onChange={(e) => {
                  setDays("0");
                  setEndDate(e.target.value);
                }}
                className="text-xs rounded-lg border border-slate-300 px-2 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <select
              aria-label="Filter by topic"
              value={aspect}
              onChange={(e) => setAspect(e.target.value)}
              className="text-sm rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">All Operational Topics</option>
              {data.aspects.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by sentiment"
              value={sentiment}
              onChange={(e) => setSentiment(e.target.value)}
              className="text-sm rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">All Sentiments</option>
              <option value="positive">Positive</option>
              <option value="neutral">Neutral</option>
              <option value="negative">Negative</option>
            </select>

            <select
              aria-label="Filter by severity"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="text-sm rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">All Priorities</option>
              <option value="P1">P1 Urgent</option>
              <option value="P2">P2 Recurring</option>
              <option value="praise">Praise</option>
            </select>

            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search cleanliness, noise, check-in..."
                className="w-full text-sm rounded-lg border border-slate-300 pl-9 pr-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs font-medium text-blue-700 hover:underline px-2 py-1"
              >
                Reset
              </button>
            )}

            {loading && <span className="text-xs text-slate-400 font-mono">Updating...</span>}
          </div>
        </section>

        {activeTab === "overview" && (
          <PortfolioOverview
            data={data}
            onSelectProperty={(pid) => {
              setPropertyId(pid);
              setActiveTab("reviews");
            }}
            onSelectTopic={(topic) => {
              setAspect(topic);
              setSentiment("negative");
              setActiveTab("reviews");
            }}
          />
        )}
        {activeTab === "ops" && (
          <OpsActionQueue
            data={data}
            onDrillDown={(pid, asp) => {
              setPropertyId(pid);
              setAspect(asp);
              setActiveTab("reviews");
            }}
          />
        )}
        {activeTab === "heatmap" && (
          <AspectHeatmap
            data={data}
            onCellClick={(pid, asp) => {
              setPropertyId(pid);
              setAspect(asp);
              setActiveTab("reviews");
            }}
          />
        )}
        {activeTab === "reviews" && <ReviewExplorer data={data} />}
        {activeTab === "pipeline" && (
          <SyncPipelinePanel data={data} syncing={syncing} onTriggerSync={handleSync} />
        )}
      </main>
    </div>
  );
}
