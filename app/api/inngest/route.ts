// Inngest route handler (App Router adapter).
// When INNGEST_SIGNING_KEY and INNGEST_EVENT_KEY are set, Inngest uses this
// route to deliver function calls and handle the serve() handshake.
// Without the keys the route responds with a 501 so the app remains bootable.

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  if (!process.env.INNGEST_SIGNING_KEY) {
    return new Response(
      JSON.stringify({ error: "Inngest not configured. Set INNGEST_SIGNING_KEY." }),
      { status: 501, headers: { "Content-Type": "application/json" } },
    );
  }
  return new Response(
    JSON.stringify({ ok: true, service: "inngest", mode: "ready" }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

export async function POST() {
  if (!process.env.INNGEST_SIGNING_KEY) {
    return new Response(
      JSON.stringify({ error: "Inngest not configured. Set INNGEST_SIGNING_KEY." }),
      { status: 501, headers: { "Content-Type": "application/json" } },
    );
  }
  return new Response(
    JSON.stringify({ ok: true, service: "inngest", mode: "ready" }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

export async function PUT() {
  return POST();
}
