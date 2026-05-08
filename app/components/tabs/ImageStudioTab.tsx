"use client";

import { Image as ImageIcon, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type GeneratedImage = {
  id: string;
  prompt: string;
  enhanced_prompt?: string | null;
  provider: string;
  model: string;
  quality: "fast" | "high";
  image_url: string;
  created_at: string;
};

export function ImageStudioTab({ dark }: { dark: boolean }) {
  const [prompt, setPrompt] = useState("A futuristic AI workspace with holographic code panels");
  const [quality, setQuality] = useState<"fast" | "high">("fast");
  const [enhancePrompt, setEnhancePrompt] = useState(true);
  const [loading, setLoading] = useState(false);
  const [latestImage, setLatestImage] = useState<GeneratedImage | null>(null);
  const [history, setHistory] = useState<GeneratedImage[]>([]);

  const shell = dark ? "border-slate-800 bg-slate-900 text-slate-100" : "border-slate-200 bg-white text-slate-900";
  const card = dark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50";
  const muted = dark ? "text-slate-400" : "text-slate-600";

  const loadHistory = useCallback(async () => {
    const response = await fetch("/api/image");
    if (!response.ok) return;
    const payload = await response.json() as { images?: GeneratedImage[] };
    const images = Array.isArray(payload.images) ? payload.images : [];
    setHistory(images);
    setLatestImage((current) => current ?? images[0] ?? null);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadHistory();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadHistory]);

  const generate = useCallback(async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const response = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, quality, enhancePrompt }),
      });
      const payload = await response.json() as { url?: string; provider?: string; model?: string; promptUsed?: string };
      if (payload.url) {
        setLatestImage({
          id: `latest-${Date.now()}`,
          prompt,
          enhanced_prompt: payload.promptUsed ?? null,
          provider: payload.provider ?? "Unknown",
          model: payload.model ?? "Unknown",
          quality,
          image_url: payload.url,
          created_at: new Date().toISOString(),
        });
      }
      await loadHistory();
    } finally {
      setLoading(false);
    }
  }, [enhancePrompt, loadHistory, prompt, quality]);

  return (
    <section className={`flex h-full min-h-0 flex-col overflow-hidden rounded-[26px] border ${shell}`}>
      <div className={`border-b px-5 py-4 ${dark ? "border-slate-800" : "border-slate-200"}`}>
        <div className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5 text-emerald-500" />
          <h2 className="text-lg font-semibold">Image Studio</h2>
        </div>
        <p className={`mt-1 text-sm ${muted}`}>
          Generate images with fal.ai FLUX, keep a server-side history, and reuse your best prompts.
        </p>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 lg:grid-cols-[0.95fr_1.05fr]">
        <aside className={`min-h-0 overflow-y-auto rounded-2xl border p-4 ${card}`}>
          <label className="block text-sm font-medium">Prompt</label>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={6}
            className={`mt-2 w-full rounded-xl border px-3 py-2 text-sm outline-none ${dark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-300 bg-white text-slate-900"}`}
          />

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="block font-medium">Quality</span>
              <select
                value={quality}
                onChange={(event) => setQuality(event.target.value === "high" ? "high" : "fast")}
                className={`mt-2 w-full rounded-xl border px-3 py-2 text-sm ${dark ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-white"}`}
              >
                <option value="fast">Fast</option>
                <option value="high">High quality</option>
              </select>
            </label>
            <label className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${dark ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-white"}`}>
              <input type="checkbox" checked={enhancePrompt} onChange={(event) => setEnhancePrompt(event.target.checked)} />
              Enhance prompt
            </label>
          </div>

          <button
            type="button"
            onClick={() => void generate()}
            disabled={loading}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" />
            {loading ? "Generating..." : "Generate image"}
          </button>

          <div className="mt-6 space-y-3">
            <h3 className="text-sm font-semibold">Recent generations</h3>
            {history.length === 0 ? <p className={`text-sm ${muted}`}>No saved images yet.</p> : null}
            {history.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setLatestImage(item)}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${dark ? "border-slate-800 hover:bg-slate-900" : "border-slate-200 hover:bg-white"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.image_url} alt={item.prompt} className="h-16 w-16 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{item.prompt}</div>
                  <div className={`mt-1 text-xs ${muted}`}>{item.provider} • {item.model}</div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <div className={`min-h-0 overflow-y-auto rounded-2xl border p-4 ${card}`}>
          {latestImage ? (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={latestImage.image_url} alt={latestImage.prompt} className="w-full rounded-2xl border border-black/5 object-cover" />
              <div className="mt-4 space-y-2">
                <div className="text-sm font-semibold">{latestImage.prompt}</div>
                <div className={`text-xs ${muted}`}>{latestImage.provider} • {latestImage.model} • {latestImage.quality}</div>
                {latestImage.enhanced_prompt && latestImage.enhanced_prompt !== latestImage.prompt ? (
                  <p className={`text-sm leading-6 ${muted}`}>Enhanced prompt: {latestImage.enhanced_prompt}</p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className={`flex h-full items-center justify-center text-sm ${muted}`}>Generate an image to start building history.</div>
          )}
        </div>
      </div>
    </section>
  );
}
