// WARNING: This endpoint is not secure for premium verification.
// Anyone can visit the success URL and appear as premium.
// You must implement a Stripe webhook to verify payment server-side before granting premium access.
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

// You must set STRIPE_SECRET_KEY in your environment variables
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

const PLAN_CONFIG = {
  starter: {
    name: "Starter Pack Subscription",
    unitAmount: 500, // $5.00
    successParam: "starter",
  },
  premium: {
    name: "Premium Plan Subscription",
    unitAmount: 1000, // $10.00
    successParam: "premium",
  },
} as const;

export async function POST(req: NextRequest) {
  if (!stripeSecretKey) {
    return NextResponse.json({ error: "Stripe secret key not set" }, { status: 500 });
  }

  const stripe = new Stripe(stripeSecretKey);

  let plan: "starter" | "premium" = "premium";
  try {
    const body = await req.json();
    if (body.plan === "starter" || body.plan === "premium") {
      plan = body.plan;
    }
  } catch {
    // default to premium if body parsing fails
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
    success_url: `${req.nextUrl.origin}/?premium=${config.successParam}`,
    cancel_url: `${req.nextUrl.origin}/?premium=cancel`,
  });

  return NextResponse.json({ url: session.url });
}
