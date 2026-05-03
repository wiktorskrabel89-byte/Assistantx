import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/server";

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

  // Require authentication so we can attach the user ID to the Stripe session.
  // The webhook uses this ID to grant the plan without relying on the success URL.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
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
    // Embed the user ID and plan so the webhook can grant access server-side
    // without relying on the success URL (which would be trivially bypassable).
    metadata: {
      userId: user.id,
      plan,
    },
    customer_email: user.email,
    // The success URL is a neutral confirmation page; plan activation is handled
    // exclusively by the Stripe webhook (/api/stripe/webhook).
    success_url: `${req.nextUrl.origin}/?checkout_success=1`,
    cancel_url: `${req.nextUrl.origin}/pricing?cancelled=1`,
  });

  return NextResponse.json({ url: session.url });
}
