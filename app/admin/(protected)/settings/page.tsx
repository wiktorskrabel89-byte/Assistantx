import { getSetting } from "@/app/lib/admin-settings";
import { LaunchDateForm } from "@/app/admin/(protected)/settings/launch-date-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Settings" };

export default async function AdminSettings() {
  const launchDateRaw = await getSetting<string | null>("launch_date");
  const launchDate = typeof launchDateRaw === "string" ? launchDateRaw : "";

  return (
    <div>
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300/80">
          Settings
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">
          <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
            Site settings
          </span>
        </h1>
        <p className="mt-2 text-sm text-white/40">
          Small controls that change the public site without needing a redeploy.
        </p>
      </header>

      <LaunchDateForm initial={launchDate} />
    </div>
  );
}
