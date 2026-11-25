import { NextRequest, NextResponse } from "next/server";
import { generateManagerReply } from "@/lib/ai";
import { getAllReviews, getProperties } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const reviewId = String(body.reviewId ?? "");
    const tone = (body.tone ?? "warm_empathetic") as
      | "warm_empathetic"
      | "concise_ops"
      | "recovery_offer";

    const [reviews, properties] = await Promise.all([getAllReviews(), getProperties()]);
    const review = reviews.find((r) => r.id === reviewId);
    if (!review) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }
    const property = properties.find((p) => p.id === review.propertyId);
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    const result = await generateManagerReply(review, property, tone);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }
}
