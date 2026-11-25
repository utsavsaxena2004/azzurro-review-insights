"use client";

import { useState } from "react";
import { Check, Copy, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { DashboardPayload, ReviewRecord } from "@/types";

export default function ReviewExplorer({ data }: { data: DashboardPayload }) {
  const [selectedReview, setSelectedReview] = useState<ReviewRecord | null>(null);
  const [tone, setTone] = useState<"warm_empathetic" | "concise_ops" | "recovery_offer">(
    "warm_empathetic"
  );
  const [replyText, setReplyText] = useState<string>("");
  const [replyProvider, setReplyProvider] = useState<string>("");
  const [drafting, setDrafting] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const propMap = new Map(data.properties.map((p) => [p.id, p]));

  const openReplyDrawer = (rev: ReviewRecord) => {
    setSelectedReview(rev);
    setReplyText(rev.draftReply);
    setReplyProvider("cached_enrichment");
    setCopied(false);
  };

  const regenerateReply = async (nextTone: "warm_empathetic" | "concise_ops" | "recovery_offer") => {
    if (!selectedReview) return;
    setTone(nextTone);
    setDrafting(true);
    try {
      const res = await fetch("/api/draft-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: selectedReview.id, tone: nextTone }),
      });
      if (res.ok) {
        const json = await res.json();
        setReplyText(json.reply);
        setReplyProvider(json.provider);
      }
    } finally {
      setDrafting(false);
    }
  };

  const copyReply = async () => {
    await navigator.clipboard.writeText(replyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      <div className="lg:col-span-2 space-y-3">
        {data.reviews.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-500">
            No reviews match the active filters.
          </div>
        ) : (
          data.reviews.map((rev) => {
            const prop = propMap.get(rev.propertyId);
            const isSelected = selectedReview?.id === rev.id;
            return (
              <article
                key={rev.id}
                className={`bg-white rounded-xl border p-5 shadow-sm transition ${
                  isSelected ? "border-blue-600 ring-1 ring-blue-600" : "border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-blue-800 bg-blue-50 px-2 py-0.5 rounded">
                        {prop?.shortName ?? rev.propertyId}
                      </span>
                      <span
                        className={`text-xs font-mono font-semibold px-2 py-0.5 rounded ${
                          rev.severity === "P1"
                            ? "bg-red-100 text-red-800"
                            : rev.severity === "P2"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {rev.severity}
                      </span>
                      <span className="text-xs text-slate-500">
                        {rev.reviewDate} · {rev.reviewerName} ({rev.reviewerCountry}) · {rev.travelerType}
                      </span>
                    </div>
                    <h3 className="font-semibold text-slate-900 mt-1.5">{rev.title}</h3>
                    <p className="text-xs text-slate-500">{rev.roomType} · {rev.stayNights} nights</p>
                  </div>

                  <div
                    className={`font-mono font-bold text-base px-2.5 py-1 rounded-lg shrink-0 ${
                      rev.score >= 7.5
                        ? "bg-emerald-100 text-emerald-900"
                        : rev.score >= 5.5
                        ? "bg-amber-100 text-amber-900"
                        : "bg-red-100 text-red-900"
                    }`}
                  >
                    {rev.score.toFixed(1)}
                  </div>
                </div>

                <div className="mt-3 space-y-2 text-sm">
                  {rev.positiveText && (
                    <p className="flex items-start gap-2 text-slate-700">
                      <ThumbsUp className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{rev.positiveText}</span>
                    </p>
                  )}
                  {rev.negativeText && (
                    <p className="flex items-start gap-2 text-slate-700">
                      <ThumbsDown className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <span>{rev.negativeText}</span>
                    </p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {rev.aspects.map((a) => (
                      <span
                        key={a}
                        className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700"
                      >
                        {a}
                      </span>
                    ))}
                    <span className="text-[11px] font-mono text-slate-500 ml-1">
                      → {rev.department}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => openReplyDrawer(rev)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Draft Manager Reply
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* Sticky AI Manager Reply Assistant */}
      <aside className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm lg:sticky lg:top-36 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-700" />
          <h3 className="text-sm font-semibold text-slate-900">AI Manager Reply Drafter</h3>
        </div>

        {!selectedReview ? (
          <p className="text-xs text-slate-500 leading-relaxed">
            Select <strong>Draft Manager Reply</strong> on any guest review to generate a tailored
            Booking.com response matched to Azzurro’s property rules (free dinner policy,
            department escalation, and direct-booking recovery).
          </p>
        ) : (
          <div className="space-y-3">
            <div className="text-xs bg-slate-50 rounded-lg p-3 border border-slate-100">
              <div className="font-semibold text-slate-900">
                {selectedReview.reviewerName} · {selectedReview.score.toFixed(1)}/10
              </div>
              <div className="text-slate-600 mt-1">{selectedReview.opsSummary}</div>
              <div className="text-blue-800 mt-1.5 font-medium">
                Ops Action: {selectedReview.recommendedAction}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {(
                [
                  ["warm_empathetic", "Warm"],
                  ["concise_ops", "Concise"],
                  ["recovery_offer", "Recovery"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => regenerateReply(id)}
                  className={`flex-1 text-xs font-medium py-1.5 rounded-lg border transition ${
                    tone === id
                      ? "bg-blue-700 text-white border-blue-700"
                      : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <textarea
              rows={6}
              value={drafting ? "Generating tailored manager reply..." : replyText}
              onChange={(e) => setReplyText(e.target.value)}
              className="w-full text-sm rounded-lg border border-slate-300 p-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />

            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-slate-500">via {replyProvider}</span>
              <button
                type="button"
                onClick={copyReply}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white font-medium hover:bg-slate-800"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied" : "Copy Reply"}
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
