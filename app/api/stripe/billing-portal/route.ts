import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/server";

/**
 * POST /api/stripe/billing-portal
 *
 * Creates a Stripe Customer Portal session for the authenticated user.
 * Requires STRIPE_SECRET_KEY to be set.
 *
 * Body: { returnUrl?: string }
 *
 * The Stripe customer ID is looked up server-side from the authenticated user's
 * app_metadata (set by webhook). Client-supplied customer IDs are ignored to
 * prevent account-takeover attacks.
 */
export async function POST(req: NextRequest) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return NextResponse.json({ error: "Stripe secret key not configured" }, { status: 500 });
  }

  // Authenticate the caller server-side
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Look up the Stripe customer ID from trusted server-side metadata (set by Stripe webhook).
  // user_metadata is user-controlled and must not be used as a fallback — only app_metadata is safe.
  const customerId = user.app_metadata?.stripe_customer_id as string | undefined;

  let returnUrl: string = `${req.nextUrl.origin}/`;

  try {
    const body = await req.json() as { returnUrl?: string };
    // Validate returnUrl using proper URL parsing to prevent open-redirect attacks
    if (typeof body.returnUrl === "string") {
      try {
        const parsed = new URL(body.returnUrl);
        if (parsed.origin === req.nextUrl.origin) {
          returnUrl = body.returnUrl;
        }
      } catch {
        // Malformed URL — keep the default returnUrl
      }
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
