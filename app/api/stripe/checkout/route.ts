// WARNING: This endpoint is not secure for premium verification.
// Anyone can visit the success URL and appear as premium.
// You must implement a Stripe webhook to verify payment server-side before granting premium access.
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

const PLAN_CONFIG = {
  pro: {
    name: "Pro Plan Subscription",
    unitAmount: 1000, // $10.00
    successParam: "pro",
  },
  "pro+": {
    name: "Pro+ Plan Subscription",
    unitAmount: 3000, // $30.00
    successParam: "pro+",
  },
} as const;

export async function POST(req: NextRequest) {
  if (!stripeSecretKey) {
    return NextResponse.json({ error: "Stripe secret key not set" }, { status: 500 });
  }

  const stripe = new Stripe(stripeSecretKey);

  let plan: "pro" | "pro+" = "pro";
  try {
    const body = await req.json();
    if (body.plan === "pro" || body.plan === "pro+") {
      plan = body.plan;
    }
  } catch {
    // default to pro if body parsing fails
  }

  const config = PLAN_CONFIG[plan];

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "subscription",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: config.name,
          },
          unit_amount: config.unitAmount,
          recurring: { interval: "month" },
        },
        quantity: 1,
      },
    ],
    success_url: `${req.nextUrl.origin}/?plan=${encodeURIComponent(config.successParam)}`,
    cancel_url: `${req.nextUrl.origin}/pricing?cancelled=1`,
  });

  return NextResponse.json({ url: session.url });
}
