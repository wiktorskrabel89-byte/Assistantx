// WARNING: This endpoint is not secure for premium verification.
// Anyone can visit the success URL and appear as premium.
// You must implement a Stripe webhook to verify payment server-side before granting premium access.
import { NextRequest, NextResponse } from "next/server";

// You must set STRIPE_SECRET_KEY in your environment variables
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

export async function POST(req: NextRequest) {
  if (!stripeSecretKey) {
    return NextResponse.json({ error: "Stripe secret key not set" }, { status: 500 });
  }

  const stripe = require("stripe")(stripeSecretKey);

  // You can customize the price, currency, and product details here
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "subscription",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "Premium Plan Subscription",
          },
          unit_amount: 1000, // $10.00
          recurring: { interval: "month" },
        },
        quantity: 1,
      },
    ],
    success_url: `${req.nextUrl.origin}/?premium=success`,
    cancel_url: `${req.nextUrl.origin}/?premium=cancel`,
  });

  return NextResponse.json({ url: session.url });
}
