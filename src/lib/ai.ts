import { PropertyMeta, ReviewRecord } from "@/types";

export function getAiMode(): "gemini" | "openai" | "deterministic" {
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "deterministic";
}

export async function generateManagerReply(
  review: ReviewRecord,
  property: PropertyMeta,
  tone: "warm_empathetic" | "concise_ops" | "recovery_offer" = "warm_empathetic"
): Promise<{ reply: string; provider: string }> {
  const toneGuide =
    tone === "concise_ops"
      ? "Keep it crisp, direct, and operational (2 sentences max)."
      : tone === "recovery_offer"
      ? "Acknowledge the issue sincerely and invite them to message frontdesk@azzurrohotels.com or WhatsApp for a direct-booking perk on their next Sydney trip."
      : "Warm, hospitable, specific to the guest's exact praise and complaint (3 sentences max).";

  const prompt = `You are the General Manager of ${property.name} (${property.address}) in Sydney.
Write a Booking.com management reply to this guest review.
${toneGuide}
Never invent amenities (note: hasFreeDinner=${property.hasFreeDinner}).
Guest: ${review.reviewerName} (${review.reviewerCountry}), Score: ${review.score}/10
Title: ${review.title}
Liked: ${review.positiveText || "None stated"}
Disliked: ${review.negativeText || "None stated"}
Return ONLY the reply text with no quotes or preamble.`;

  if (process.env.GEMINI_API_KEY) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 220 },
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) return { reply: text, provider: "gemini-2.0-flash" };
      }
    } catch {
      // Fall through to deterministic fallback
    }
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.4,
          max_tokens: 220,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content?.trim();
        if (text) return { reply: text, provider: "gpt-4o-mini" };
      }
    } catch {
      // Fall through to deterministic fallback
    }
  }

  // Deterministic hospitality fallback so the demo always works without API keys
  if (tone === "recovery_offer") {
    return {
      reply: `Hi ${review.reviewerName}, thank you for taking the time to review ${property.shortName}. We're sorry about the ${review.aspects[0]?.toLowerCase() ?? "comfort"} friction you experienced—we've shared this with our ${review.department} team to fix promptly. If you return to Sydney, please message us at frontdesk@azzurrohotels.com so we can look after you directly.`,
      provider: "deterministic_ops_template",
    };
  }
  if (tone === "concise_ops") {
    return {
      reply: `Hi ${review.reviewerName}, thanks for staying at ${property.shortName} and for the candid feedback. We've logged your notes on ${(review.aspects[0] ?? "your stay").toLowerCase()} with our ${review.department} team and appreciate you helping us improve.`,
      provider: "deterministic_ops_template",
    };
  }
  return {
    reply: review.draftReply,
    provider: "deterministic_ops_template",
  };
}
