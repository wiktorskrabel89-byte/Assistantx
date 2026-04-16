import Link from "next/link";

type CloudSyncStatus = "checking" | "syncing" | "synced" | "error" | "local";

const STATUS_STYLES: Record<CloudSyncStatus, string> = {
  checking: "border-amber-300/60 bg-amber-100 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  syncing: "border-sky-300/60 bg-sky-100 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200",
  synced: "border-emerald-300/60 bg-emerald-100 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  error: "border-rose-300/60 bg-rose-100 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200",
  local: "border-slate-300/60 bg-slate-100 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
};

const STATUS_LABELS: Record<CloudSyncStatus, string> = {
  checking: "Checking",
  syncing: "Syncing",
  synced: "Synced",
  error: "Needs setup",
  local: "Local",
};

export function RoadmapPanel({
  dark,
  userEmail,
  cloudSyncStatus,
  cloudSyncMessage,
}: {
  dark: boolean;
  userEmail: string | null;
  cloudSyncStatus: CloudSyncStatus;
  cloudSyncMessage: string;
}) {
  return (
    <section className={`rounded-3xl border p-4 ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Account status</h2>
          <p className="mt-1 text-xs text-gray-500">Current session and cloud sync state.</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLES[cloudSyncStatus]}`}>
          Cloud {STATUS_LABELS[cloudSyncStatus]}
        </span>
      </div>

      <div className={`mt-4 rounded-2xl border px-3 py-3 text-xs leading-6 ${dark ? "border-gray-800 bg-gray-950 text-gray-300" : "border-gray-200 bg-gray-50 text-gray-600"}`}>
        <div className="font-medium text-gray-900 dark:text-gray-100">Account</div>
        <div className="mt-1 truncate">{userEmail ?? "Session loading..."}</div>
        <div className="mt-2 text-[11px] opacity-80">{cloudSyncMessage}</div>
      </div>

      <div className={`mt-4 rounded-2xl border px-3 py-3 text-xs leading-6 ${dark ? "border-gray-800 bg-gray-950 text-gray-300" : "border-gray-200 bg-gray-50 text-gray-600"}`}>
        <div className="font-medium text-gray-900 dark:text-gray-100">Legal</div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/privacy" className="hover:text-blue-500">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-blue-500">
            Terms of Service
          </Link>
        </div>
      </div>
    </section>
  );
}