"use client";

import { DashboardPayload, PropertyId } from "@/types";

function scoreCellClasses(score: number | null, notApplicable?: boolean): string {
  if (notApplicable) return "bg-slate-100 text-slate-400";
  if (score === null) return "bg-slate-50 text-slate-400";
  if (score >= 7.5) return "bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100";
  if (score >= 6.0) return "bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100";
  return "bg-red-50 text-red-900 border-red-200 hover:bg-red-100";
}

export default function AspectHeatmap({
  data,
  onCellClick,
}: {
  data: DashboardPayload;
  onCellClick: (propertyId: PropertyId, aspect: string) => void;
}) {
  const cellMap = new Map(data.heatmap.map((c) => [`${c.propertyId}::${c.aspect}`, c]));

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">
          Operational Aspect × Property Sentiment Matrix
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Click any cell to drill directly into the underlying Booking.com guest reviews for that
          property and operational category. Note that Free Dinner applies only to the three Azzurro
          pod hotels (not Olympic Paddington).
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="text-left py-2.5 px-3 font-mono text-xs uppercase text-slate-500 border-b border-slate-200">
                Operational Aspect
              </th>
              {data.properties.map((p) => (
                <th
                  key={p.id}
                  className="text-center py-2.5 px-3 font-semibold text-slate-800 border-b border-slate-200"
                >
                  {p.shortName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.aspects.map((aspect) => (
              <tr key={aspect} className="border-b border-slate-100 last:border-b-0">
                <td className="py-3 px-3 font-medium text-slate-800 whitespace-nowrap">{aspect}</td>
                {data.properties.map((prop) => {
                  const cell = cellMap.get(`${prop.id}::${aspect}`);
                  if (!cell || cell.notApplicable) {
                    return (
                      <td key={prop.id} className="p-2 text-center">
                        <div className="rounded-lg py-2.5 px-2 text-xs font-mono bg-slate-100 text-slate-400">
                          N/A
                        </div>
                      </td>
                    );
                  }
                  return (
                    <td key={prop.id} className="p-2 text-center">
                      <button
                        type="button"
                        disabled={cell.mentions === 0}
                        onClick={() => onCellClick(prop.id, aspect)}
                        className={`w-full rounded-lg border py-2 px-2 transition disabled:opacity-60 disabled:cursor-default ${scoreCellClasses(
                          cell.avgScore
                        )}`}
                      >
                        <div className="font-mono font-bold text-sm">
                          {cell.avgScore !== null ? cell.avgScore.toFixed(1) : "—"}
                        </div>
                        <div className="text-[11px] opacity-80">
                          {cell.mentions} {cell.mentions === 1 ? "mention" : "mentions"}
                          {cell.negativeCount > 0 ? ` · ${cell.negativeCount} neg` : ""}
                        </div>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-emerald-200 inline-block" /> ≥ 7.5 Strong
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-amber-200 inline-block" /> 6.0–7.4 Watchlist
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-200 inline-block" /> &lt; 6.0 Urgent Friction
        </span>
      </div>
    </div>
  );
}
