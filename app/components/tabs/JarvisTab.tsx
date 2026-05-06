"use client";

export default function JarvisTab() {

  async function downloadForWindows() {
    let arch = "x64";
    try {
      const nav = navigator as Navigator & {
        userAgentData?: {
          getHighEntropyValues: (hints: string[]) => Promise<{ architecture?: string }>;
        };
      };
      if (nav.userAgentData) {
        const data = await nav.userAgentData.getHighEntropyValues(["architecture"]);
        if (data.architecture === "arm") arch = "arm64";
      }
    } catch {
      // fall back to x64
    }

    // Navigate directly to the API route so the browser handles redirects and
    // streaming natively — avoids CORS issues and user-gesture restrictions.
    window.location.href = `/api/jarvis/download?arch=${arch}`;
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-auto bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.16),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.14),transparent_36%),linear-gradient(140deg,#f8fafc,#e2e8f0_48%,#dbeafe)] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6">
        <div className="rounded-3xl border border-sky-200/60 bg-white/90 p-6 shadow-[0_24px_80px_-28px_rgba(14,116,144,0.25)] backdrop-blur sm:p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/80 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-800 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-sky-500 to-amber-400" />
            AssistantX Jarvis
          </div>

          <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Download Jarvis
            <span className="block bg-gradient-to-r from-sky-700 via-cyan-600 to-amber-500 bg-clip-text text-transparent">
              for desktop and mobile
            </span>
          </h1>

          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
            Keep your AssistantX assistant close at hand. Install Jarvis on Windows or Android and continue your workflows with the same account and ecosystem.
          </p>

          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            {/* Windows */}
            <div className="flex flex-col gap-2">
              <button
                onClick={downloadForWindows}
                className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
                title="Download Jarvis for Windows"
              >
                Download for Windows
              </button>
              <p className="text-center text-[11px] font-medium text-green-600">
                ✅ Auto-detects x64 or ARM64
              </p>
            </div>

            {/* Android */}
            <div className="flex flex-col gap-2">
              <div className="rounded-xl border border-slate-200 bg-white/60 px-5 py-3 text-sm font-semibold text-slate-500 shadow-sm">
                <p>Download for Android</p>
                <p className="mt-1 text-[11px] font-normal text-slate-400">v0.1.0 · React Native 0.78</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-700">
                <p className="font-semibold">Build from source</p>
                <p className="mt-0.5">
                  APK is not pre-built. Clone the repo, open{" "}
                  <code className="rounded bg-amber-100 px-1">jarvis/android/</code> and run{" "}
                  <code className="rounded bg-amber-100 px-1">npm install && npx react-native run-android</code>.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-sky-200/70 bg-white/85 px-5 py-4 shadow-sm backdrop-blur">
            <div className="text-sm font-semibold text-slate-900">Fast install</div>
            <p className="mt-2 text-xs leading-6 text-slate-600">Get up and running in minutes with a direct installer and APK package.</p>
          </div>
          <div className="rounded-2xl border border-amber-200/70 bg-white/85 px-5 py-4 shadow-sm backdrop-blur">
            <div className="text-sm font-semibold text-slate-900">Same ecosystem</div>
            <p className="mt-2 text-xs leading-6 text-slate-600">Continue using your AssistantX flows, tools, and integrations across platforms.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/85 px-5 py-4 shadow-sm backdrop-blur">
            <div className="text-sm font-semibold text-slate-900">Private workflow</div>
            <p className="mt-2 text-xs leading-6 text-slate-600">Use your own account context and keep your work sessions organized per device.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
