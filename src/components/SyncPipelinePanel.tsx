"use client";

import { CheckCircle2, Database, RefreshCw, ShieldAlert, Terminal } from "lucide-react";
import { DashboardPayload } from "@/types";

export default function SyncPipelinePanel({
  data,
  syncing,
  onTriggerSync,
}: {
  data: DashboardPayload;
  syncing: boolean;
  onTriggerSync: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
            <Database className="w-4 h-4 text-blue-700" />
            Storage Layer
          </div>
          <div className="mt-2 text-lg font-bold text-slate-900">
            {data.storageMode === "supabase" ? "Supabase PostgreSQL" : "Local Cached JSON Store"}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Idempotent upsert keyed by <code className="font-mono">(property_id, external_review_id)</code>.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
            <ShieldAlert className="w-4 h-4 text-amber-600" />
            Booking.com AWS WAF Handling
          </div>
          <div className="mt-2 text-lg font-bold text-slate-900">Decoupled Ingestion</div>
          <p className="text-xs text-slate-500 mt-1">
            UI reads from DB (&lt;100 ms) so Booking.com WAF 403s never crash the live ops dashboard.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
              <Terminal className="w-4 h-4 text-emerald-700" />
              On-Demand Sync
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Runs Apify live sync when <code>APIFY_API_TOKEN</code> is configured, or verifies the
              deduplicated cache safely.
            </p>
          </div>
          <button
            type="button"
            onClick={onTriggerSync}
            disabled={syncing}
            className="mt-3 inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Running Sync..." : "Run Sync Now"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Recent Ingestion Audit Log</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-mono">
                <th className="py-2 pr-4">Timestamp (UTC)</th>
                <th className="py-2 pr-4">Provider</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Fetched / Upserted</th>
                <th className="py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {data.syncRuns.map((run) => (
                <tr key={run.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="py-2.5 pr-4 font-mono whitespace-nowrap text-slate-700">
                    {run.startedAt.replace("T", " ").slice(0, 19)}
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-slate-800">{run.provider}</td>
                  <td className="py-2.5 pr-4">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-medium">
                      <CheckCircle2 className="w-3 h-3" />
                      {run.status}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-slate-700">
                    {run.reviewsFetched} / {run.reviewsUpserted}
                  </td>
                  <td className="py-2.5 text-slate-600">{run.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
