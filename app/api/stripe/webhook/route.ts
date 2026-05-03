/**
 * POST /api/stripe/webhook
 *
 * Receives Stripe webhook events, verifies the signature with
 * STRIPE_WEBHOOK_SECRET, and grants or revokes user plans in Supabase.
 *
 * Required environment variables:
 *   STRIPE_SECRET_KEY          – Stripe secret key
 *   STRIPE_WEBHOOK_SECRET      – Signing secret from Stripe webhook dashboard
 *   NEXT_PUBLIC_SUPABASE_URL   – Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY  – Supabase service-role key (bypasses RLS)
 *
 * Supported events:
 *   checkout.session.completed  – Payment succeeded; activate the plan
 *   customer.subscription.deleted – Subscription cancelled; downgrade to free
 */
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient, type User } from "@supabase/supabase-js";
import type { UserPlan } from "@/lib/ai-config";

export const runtime = "nodejs"; // required for Stripe signature verification

// Plans that a paid checkout session can legitimately grant.
// "free" is excluded because it is the default and should not be upgradeable
// via a Stripe checkout (downgrade to free happens only via subscription deletion).
const GRANTABLE_PAID_PLANS: ReadonlySet<string> = new Set(["pro", "pro+"]);

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase admin credentials not configured.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Merges the new userPlan into the user's workspace_states row.
 * Uses upsert so the row is created if it does not exist yet.
 */
async function setUserPlan(userId: string, plan: UserPlan): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Read the current state so we can do a non-destructive merge
  const { data: existing } = await supabase
    .from("workspace_states")
    .select("state_json")
    .eq("user_id", userId)
    .maybeSingle();

  const currentState =
    existing?.state_json && typeof existing.state_json === "object"
      ? (existing.state_json as Record<string, unknown>)
      : {};

  const mergedState: Record<string, unknown> = {
    ...currentState,
    userPlan: plan,
  };

  const { error } = await supabase
    .from("workspace_states")
    .upsert(
      {
        user_id: userId,
        state_json: mergedState,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    throw new Error(`Failed to update plan for user ${userId}: ${error.message}`);
  }
}

/**
 * Look up the Supabase user ID for a Stripe customer.
 * The checkout route stores userId in session.metadata.
 * For subscription events, fall back to customer email lookup via the admin API.
 */
async function resolveUserId(
  stripe: Stripe,
  metadata: Stripe.Metadata | null,
  customerId: string | null
): Promise<string | null> {
  // Fast path: user ID was stored in session metadata during checkout
  if (metadata?.userId) return metadata.userId;

  // Fallback: look up customer email from Stripe then find the matching user
  if (!customerId) return null;
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted || !("email" in customer) || !customer.email) return null;

  const supabase = getSupabaseAdmin();
  const { data } = await supabase.auth.admin.listUsers();
  const match = data?.users?.find((u: User) => u.email === customer.email);
  return match?.id ?? null;
}

export async function POST(req: NextRequest) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecretKey || !webhookSecret) {
    console.error("[stripe/webhook] Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe-Signature header." }, { status: 400 });
  }

  const stripe = new Stripe(stripeSecretKey);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe/webhook] Signature verification failed:", message);
    return NextResponse.json({ error: `Webhook verification failed: ${message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status !== "paid") break;

        const plan = session.metadata?.plan;
        if (!plan || !GRANTABLE_PAID_PLANS.has(plan)) {
          console.error("[stripe/webhook] checkout.session.completed: invalid plan in metadata", plan);
          break;
        }

        const userId = await resolveUserId(
          stripe,
          session.metadata,
          typeof session.customer === "string" ? session.customer : null
        );

        if (!userId) {
          console.error("[stripe/webhook] checkout.session.completed: could not resolve user", {
            sessionId: session.id,
          });
          break;
        }

        await setUserPlan(userId, plan as UserPlan);
        console.info(`[stripe/webhook] Granted plan "${plan}" to user ${userId}`);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === "string" ? subscription.customer : null;

        const userId = await resolveUserId(stripe, null, customerId);
        if (!userId) {
          console.error("[stripe/webhook] customer.subscription.deleted: could not resolve user");
          break;
        }

        await setUserPlan(userId, "free");
        console.info(`[stripe/webhook] Downgraded user ${userId} to free after subscription deletion`);
        break;
      }

      default:
        // Unhandled event type — return 200 so Stripe does not retry
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe/webhook] Handler error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
