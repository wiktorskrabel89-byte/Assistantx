export const metadata = { title: "Admin · Revenue" };

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
      <p className="text-xs uppercase tracking-wider text-white/40">{label}</p>
      <p className="mt-2 text-3xl font-black tracking-tight text-white/70">{value}</p>
      {sub && <p className="mt-1 text-xs text-white/40">{sub}</p>}
    </div>
  );
}

export default function AdminRevenue() {
  return (
    <div>
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300/80">
          Revenue
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">
          <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
            Payments &amp; revenue
          </span>
        </h1>
        <p className="mt-2 text-sm text-white/40">
          Revenue metrics will populate once a payment provider is connected.
        </p>
      </header>

      <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-500/5 p-4 text-sm text-amber-100/80">
        No payment provider (Stripe / Dodo / Paddle) is wired to this project yet. The tiles below are placeholders — <strong>they intentionally do not show fake numbers</strong>. Add a provider integration and repoint this page.
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="MRR" value="—" sub="Monthly recurring revenue" />
        <Stat label="Active subs" value="—" sub="Recurring subscriptions" />
        <Stat label="Revenue this month" value="—" sub="Gross" />
        <Stat label="Total revenue" value="—" sub="All time" />
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-bold tracking-tight mb-3">Wiring guide</h2>
        <ol className="list-decimal ml-5 space-y-2 text-sm text-white/60">
          <li>Choose a provider (Stripe recommended) and store the secret key in <code>STRIPE_SECRET_KEY</code>.</li>
          <li>Create a webhook endpoint (e.g. <code>/api/stripe/webhook</code>) that stores checkout / subscription events into a <code>payment_events</code> table.</li>
          <li>Expose a service-role query aggregating those events; add tiles here.</li>
        </ol>
      </section>
    </div>
  );
}
