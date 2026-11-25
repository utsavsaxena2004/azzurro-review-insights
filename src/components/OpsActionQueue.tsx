"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, Wrench } from "lucide-react";
import { DashboardPayload, PropertyId } from "@/types";

export default function OpsActionQueue({
  data,
  onDrillDown,
}: {
  data: DashboardPayload;
  onDrillDown: (propertyId: PropertyId, aspect: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            AI-Prioritized Operations Action Queue
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Recurring negative review clusters ranked by severity (P1/P2) and estimated Booking.com
            score drag, auto-routed to the owning property department.
          </p>
        </div>
        <div className="text-xs font-mono bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg shrink-0">
          {data.opsQueue.length} active clusters
        </div>
      </div>

      {data.opsQueue.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-500">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
          No operational issues match the current filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {data.opsQueue.map((issue) => (
            <div
              key={issue.id}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${
                          issue.severity === "P1"
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {issue.severity}
                      </span>
                      <span className="text-sm font-semibold text-slate-900">
                        {issue.propertyName} · {issue.aspect}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      <Wrench className="w-3.5 h-3.5" />
                      Owner: <strong className="text-slate-700">{issue.department}</strong> ·{" "}
                      {issue.mentionCount} reviews · Avg {issue.avgAffectedScore.toFixed(1)}/10
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs text-slate-500">Est. Score Drag</div>
                    <div className="font-mono font-bold text-red-700 text-base">
                      -{issue.estimatedScoreDrag.toFixed(2)} pts
                    </div>
                  </div>
                </div>

                <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-950">
                  <span className="font-semibold">Recommended Action: </span>
                  {issue.recommendedAction}
                </div>

                {issue.sampleQuotes.length > 0 && (
                  <div className="space-y-1.5">
                    {issue.sampleQuotes.map((q, idx) => (
                      <p
                        key={idx}
                        className="text-xs text-slate-600 italic border-l-2 border-slate-300 pl-2.5"
                      >
                        {q}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1 text-slate-500">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  Ready for weekly GM standup
                </span>
                <button
                  type="button"
                  onClick={() => onDrillDown(issue.propertyId, issue.aspect)}
                  className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
                >
                  View reviews <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
