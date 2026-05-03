import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

/**
 * POST /api/stripe/billing-portal
 *
 * Creates a Stripe Customer Portal session for the authenticated user.
 * Requires STRIPE_SECRET_KEY to be set.
 *
 * Body: { customerId?: string; returnUrl?: string }
 *
 * Note: A customerId is required to open the portal. This should be stored
 * in your database when a Stripe Checkout session completes (via webhook).
 * If no customerId is available, the response includes a redirect to /pricing.
 */
export async function POST(req: NextRequest) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return NextResponse.json({ error: "Stripe secret key not configured" }, { status: 500 });
  }

  let customerId: string | undefined;
  let returnUrl: string = `${req.nextUrl.origin}/`;

  try {
    const body = await req.json() as { customerId?: string; returnUrl?: string };
    customerId = body.customerId;
    // Only accept returnUrl values that belong to the same origin to prevent open-redirect
    if (typeof body.returnUrl === "string" && body.returnUrl.startsWith(req.nextUrl.origin)) {
      returnUrl = body.returnUrl;
    }
  } catch {
    // Use defaults if body parsing fails
  }

  if (!customerId) {
    // No customer ID available — redirect to pricing page to re-subscribe
    return NextResponse.json({ url: `${req.nextUrl.origin}/pricing` });
  }

  try {
    const stripe = new Stripe(stripeSecretKey);
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
