"use client";

import {
  Bot,
  BookMarked,
  ChevronDown,
  Globe,
  Loader2,
  Maximize2,
  Minimize2,
  Package,
  Play,
  RefreshCw,
  Sparkles,
  SquareTerminal,
  Trash2,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useCallback, useEffect, useRef, useState } from "react";
import { SandboxEditor } from "../SandboxEditor";
import { APP_FORCED_MODEL_ID, APP_FORCED_THINKING_EFFORT, LANGUAGE_OPTIONS } from "@/lib/ai-config";

// ─── Language mode types ───────────────────────────────────────────────────────

type SandboxMode = "html-css-js" | "typescript" | "python" | "bash" | "sql" | "json" | "markdown";

const SANDBOX_MODES: Array<{ id: SandboxMode; label: string; badge: string }> = [
  { id: "html-css-js", label: "HTML/CSS/JS", badge: "</>" },
  { id: "typescript", label: "TypeScript", badge: "TS" },
  { id: "python", label: "Python", badge: "Py" },
  { id: "bash", label: "Bash", badge: "$_" },
  { id: "sql", label: "SQL", badge: "DB" },
  { id: "json", label: "JSON", badge: "{}" },
  { id: "markdown", label: "Markdown", badge: "Md" },
];

const MONACO_LANG: Record<SandboxMode, string> = {
  "html-css-js": "html",
  typescript: "typescript",
  python: "python",
  bash: "shell",
  sql: "sql",
  json: "json",
  markdown: "markdown",
};

// ─── Initial code snippets ─────────────────────────────────────────────────────

const INITIAL_HTML = `<h1>Hello World!</h1>\n<p>Start coding here...</p>`;
const INITIAL_CSS = `body {\n  font-family: system-ui;\n  padding: 20px;\n}\n\nh1 {\n  color: #3b82f6;\n}`;
const INITIAL_JS = `console.log("Sandbox ready!");`;
const INITIAL_SINGLE: Record<SandboxMode, string> = {
  "html-css-js": "",
  typescript: `// TypeScript\nfunction greet(name: string): string {\n  return \`Hello, \${name}!\`;\n}\nconsole.log(greet("World"));`,
  python: `# Python\ndef greet(name: str) -> str:\n    return f"Hello, {name}!"\n\nprint(greet("World"))`,
  bash: `#!/bin/bash\necho "Hello, World!"`,
  sql: `-- SQL\nSELECT 'Hello, World!' AS greeting;`,
  json: `{\n  "greeting": "Hello, World!",\n  "version": 1\n}`,
  markdown: `# Hello World\n\nWelcome to the **Sandbox**!\n\n- Start writing Markdown here\n- Preview renders on the right`,
};

// ─── CDN library list ──────────────────────────────────────────────────────────

const CDN_LIBRARIES = [
  { name: "Tailwind CSS (Play CDN)", description: "Utility-first CSS framework", tag: '<script src="https://cdn.tailwindcss.com"></script>' },
  { name: "Alpine.js", description: "Lightweight reactive JS", tag: '<script defer src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js"></script>' },
  { name: "Three.js", description: "3D graphics library", tag: '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>' },
  { name: "Chart.js", description: "Charts & graphs", tag: '<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>' },
  { name: "GSAP", description: "Professional animations", tag: '<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>' },
  { name: "Animate.css", description: "CSS animation classes", tag: '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css">' },
  { name: "jQuery", description: "DOM manipulation library", tag: '<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>' },
  { name: "Bootstrap CSS", description: "CSS component framework", tag: '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css">' },
  { name: "D3.js", description: "Data visualizations", tag: '<script src="https://d3js.org/d3.v7.min.js"></script>' },
  { name: "Lodash", description: "JS utility functions", tag: '<script src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js"></script>' },
];

// ─── Build iframe preview document ────────────────────────────────────────────

function buildPreviewDoc(html: string, css: string, js: string): string {
  const interceptor = `<script>
(function(){var k=['log','warn','error','info'];k.forEach(function(t){var o=console[t].bind(console);console[t]=function(){var s=Array.prototype.slice.call(arguments).join(' ');window.parent.postMessage({type:'sandbox-console',kind:t,text:s},'*');o.apply(console,arguments);};});window.onerror=function(m,_,l){window.parent.postMessage({type:'sandbox-error',text:m+' (line '+l+')'},'*');return false;};})();
<\/script>`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style>${interceptor}</head><body>${html}<script>${js}<\/script></body></html>`;
}

// ─── Console log entry ─────────────────────────────────────────────────────────

type ConsoleEntry = { text: string; kind: "log" | "warn" | "error" | "info" };

// ─── AI streaming helper ───────────────────────────────────────────────────────

async function streamChatRequest(
  prompt: string,
  signal: AbortSignal,
  onToken: (t: string) => void
): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      message: prompt,
      mode: "code",
      userPlan: "free",
      history: [],
      modelId: APP_FORCED_MODEL_ID,
      thinkingEffort: APP_FORCED_THINKING_EFFORT,
      allowedModels: [APP_FORCED_MODEL_ID],
    }),
  });
  if (!res.body) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") return;
      try {
        const chunk = JSON.parse(raw) as { token?: string };
        if (chunk.token) onToken(chunk.token);
      } catch { /* ignore */ }
    }
  }
}

// ─── Main component ────────────────────────────────────────────────────────────

export function SandboxTab({ dark, initialCode }: { dark: boolean; initialCode?: { html: string; css: string; js: string } }) {
  const [sandboxMode, setSandboxMode] = useState<SandboxMode>("html-css-js");
  const [html, setHtml] = useState(() => {
    if (initialCode?.html !== undefined) return initialCode.html;
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem("sandbox-html-css-js") : null;
      if (saved) {
        const parsed = JSON.parse(saved) as { html?: string; css?: string; js?: string };
        if (parsed.html !== undefined) return parsed.html;
      }
    } catch { /* ignore */ }
    return INITIAL_HTML;
  });
  const [css, setCss] = useState(() => {
    if (initialCode?.css !== undefined) return initialCode.css;
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem("sandbox-html-css-js") : null;
      if (saved) {
        const parsed = JSON.parse(saved) as { html?: string; css?: string; js?: string };
        if (parsed.css !== undefined) return parsed.css;
      }
    } catch { /* ignore */ }
    return INITIAL_CSS;
  });
  const [js, setJs] = useState(() => {
    if (initialCode?.js !== undefined) return initialCode.js;
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem("sandbox-html-css-js") : null;
      if (saved) {
        const parsed = JSON.parse(saved) as { html?: string; css?: string; js?: string };
        if (parsed.js !== undefined) return parsed.js;
      }
    } catch { /* ignore */ }
    return INITIAL_JS;
  });
  const [singleCode, setSingleCode] = useState("");
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [responseLang, setResponseLang] = useState("auto");
  const [previewVisible, setPreviewVisible] = useState(true);
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleEntry[]>([]);
  const [previewDoc, setPreviewDoc] = useState(() =>
    buildPreviewDoc(INITIAL_HTML, INITIAL_CSS, INITIAL_JS)
  );
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [serverRunLoading, setServerRunLoading] = useState(false);
  const [runMode, setRunMode] = useState(false);
  const [deviceFrame, setDeviceFrame] = useState<"none" | "mobile" | "tablet">("none");
  const [showCdnPicker, setShowCdnPicker] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);

  // Auto-detect device size from window width
  useEffect(() => {
    function detectDevice() {
      const w = window.innerWidth;
      if (w < 640) setDeviceFrame("mobile");
      else if (w < 1024) setDeviceFrame("tablet");
      else setDeviceFrame("none");
    }
    detectDevice();
    window.addEventListener("resize", detectDevice);
    return () => window.removeEventListener("resize", detectDevice);
  }, []);

  // Save to localStorage whenever HTML/CSS/JS changes
  useEffect(() => {
    if (sandboxMode !== "html-css-js") return;
    try {
      localStorage.setItem("sandbox-html-css-js", JSON.stringify({ html, css, js }));
    } catch { /* ignore */ }
  }, [html, css, js, sandboxMode]);

  // Debounce preview rebuild
  useEffect(() => {
    if (sandboxMode !== "html-css-js") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPreviewDoc(buildPreviewDoc(html, css, js));
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [html, css, js, sandboxMode]);

  // Listen for console messages from preview iframe
  useEffect(() => {
    function handler(e: MessageEvent) {
      if (e.data?.type === "sandbox-console") {
        setConsoleLogs((p) => [...p, { text: e.data.text as string, kind: e.data.kind as ConsoleEntry["kind"] }]);
      }
      if (e.data?.type === "sandbox-error") {
        setConsoleLogs((p) => [...p, { text: e.data.text as string, kind: "error" }]);
      }
    }
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  function refreshPreview() {
    setConsoleLogs([]);
    if (sandboxMode === "html-css-js") setPreviewDoc(buildPreviewDoc(html, css, js));
  }

  function clearCode() {
    if (sandboxMode === "html-css-js") { setHtml(""); setCss(""); setJs(""); }
    else setSingleCode("");
    setConsoleLogs([]);
  }

  function switchMode(mode: SandboxMode) {
    setSandboxMode(mode);
    setShowModeDropdown(false);
    setConsoleLogs([]);
    if (mode !== "html-css-js" && !singleCode) setSingleCode(INITIAL_SINGLE[mode]);
  }

  function getCurrentCode(): string {
    if (sandboxMode === "html-css-js") {
      return `HTML:\n\`\`\`html\n${html}\n\`\`\`\n\nCSS:\n\`\`\`css\n${css}\n\`\`\`\n\nJavaScript:\n\`\`\`javascript\n${js}\n\`\`\``;
    }
    return `\`\`\`${MONACO_LANG[sandboxMode]}\n${singleCode}\n\`\`\``;
  }

  function getPageTitle(): string {
    const m = html.match(/<title[^>]*>(.*?)<\/title>/i);
    return m?.[1] ?? "(bez tytułu)";
  }

  const langLabel = LANGUAGE_OPTIONS.find((l) => l.code === responseLang)?.label ?? "Auto detect";

  const sendAI = useCallback(async (prompt: string) => {
    aiAbortRef.current?.abort();
    aiAbortRef.current = new AbortController();
    setAiResponse("");
    setAiLoading(true);
    const langHint = responseLang !== "auto"
      ? ` Odpowiadaj w języku: ${LANGUAGE_OPTIONS.find((l) => l.code === responseLang)?.label ?? responseLang}.`
      : "";
    try {
      let full = "";
      await streamChatRequest(prompt + langHint, aiAbortRef.current.signal, (t) => {
        full += t;
        setAiResponse(full);
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setAiResponse("Błąd podczas generowania odpowiedzi AI.");
    } finally {
      setAiLoading(false);
    }
  }, [responseLang]);

  function handleReview() {
    setAiPanelOpen(true);
    void sendAI(`Przejrzyj i oceń poniższy kod. Wskaż błędy, możliwe ulepszenia i najlepsze praktyki.\n\n${getCurrentCode()}`);
  }

  function handleTroubleshoot() {
    const errors = consoleLogs.filter((l) => l.kind === "error").map((l) => l.text).join("\n");
    setAiPanelOpen(true);
    void sendAI(`Napraw poniższy kod.${errors ? ` Błędy z konsoli:\n${errors}\n\n` : " "}Kod:\n${getCurrentCode()}`);
  }

  function handleCustomQuery() {
    if (!aiInput.trim()) return;
    const prompt = `${aiInput.trim()}\n\nKod:\n${getCurrentCode()}`;
    setAiInput("");
    void sendAI(prompt);
  }

  async function runOnServer() {
    if (sandboxMode === "html-css-js") return;
    setServerRunLoading(true);
    setConsoleOpen(true);
    setConsoleLogs((prev) => [...prev, { kind: "info", text: `Running ${currentMode.label} on the server...` }]);

    try {
      const response = await fetch("/api/runtime/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflow: "sandbox_execute",
          input: {
            language: sandboxMode,
            code: singleCode || INITIAL_SINGLE[sandboxMode],
          },
        }),
      });
      const data = await response.json().catch(() => ({})) as {
        error?: string;
        output?: { stdout?: string; stderr?: string; exitCode?: number; timedOut?: boolean };
      };
      if (!response.ok || !data.output) {
        throw new Error(data.error ?? "Server execution failed.");
      }

      const nextLogs: ConsoleEntry[] = [];
      if (data.output.stdout) nextLogs.push({ kind: "log", text: data.output.stdout.trim() });
      if (data.output.stderr) nextLogs.push({ kind: "error", text: data.output.stderr.trim() });
      nextLogs.push({
        kind: data.output.exitCode === 0 ? "info" : "warn",
        text: data.output.timedOut
          ? `Process timed out (${data.output.exitCode ?? 124}).`
          : `Process exited with code ${data.output.exitCode ?? 0}.`,
      });
      setConsoleLogs((prev) => [...prev, ...nextLogs]);
    } catch (error) {
      setConsoleLogs((prev) => [
        ...prev,
        { kind: "error", text: error instanceof Error ? error.message : "Server execution failed." },
      ]);
    } finally {
      setServerRunLoading(false);
    }
  }

  function insertCdn(lib: typeof CDN_LIBRARIES[0]) {
    const tagPrefix = lib.tag.slice(0, 40);
    if (html.includes(tagPrefix)) { setShowCdnPicker(false); return; }
    let updated = html;
    if (lib.tag.startsWith("<script")) {
      if (/<\/body>/i.test(updated)) {
        updated = updated.replace(/<\/body>/i, `  ${lib.tag}\n</body>`);
      } else {
        updated = updated + "\n" + lib.tag;
      }
    } else {
      if (/<\/head>/i.test(updated)) {
        updated = updated.replace(/<\/head>/i, `  ${lib.tag}\n</head>`);
      } else {
        updated = lib.tag + "\n" + updated;
      }
    }
    setHtml(updated);
    setShowCdnPicker(false);
  }

  // Styling helpers
  const toolbarCls = dark ? "border-slate-700 bg-slate-800/80" : "border-slate-200 bg-white/95";
  const panelCls = dark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-slate-50";
  const base = "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all";
  const sec = dark
    ? `${base} border border-slate-600 text-slate-300 hover:border-slate-400 hover:text-white`
    : `${base} border border-slate-300 text-slate-600 hover:border-slate-500 hover:text-slate-900`;
  const pri = `${base} bg-gradient-to-r from-sky-600 to-cyan-500 text-white shadow-sm hover:from-sky-500 hover:to-cyan-400`;
  const currentMode = SANDBOX_MODES.find((m) => m.id === sandboxMode)!;
  const errorCount = consoleLogs.filter((l) => l.kind === "error").length;

  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden ${dark ? "bg-slate-950 text-slate-100" : "bg-white text-slate-900"}`}>
      {/* ── Toolbar ── */}
      <div className={`flex flex-shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2 ${toolbarCls}`}>
        <div className="flex items-center gap-2 mr-1">
          <SquareTerminal className="h-4 w-4 text-sky-500" />
          <span className="text-sm font-semibold">Code Sandbox</span>
        </div>
        <div className={`h-5 w-px mx-1 ${dark ? "bg-slate-700" : "bg-slate-200"}`} />

        {/* Sandbox mode selector */}
        <div className="relative">
          <button type="button" onClick={() => { setShowModeDropdown((v) => !v); setShowLangDropdown(false); }} className={sec}>
            <span className="font-mono text-sky-400">{currentMode.badge}</span>
            <span>{currentMode.label}</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
          {showModeDropdown && (
            <div className={`absolute left-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-xl border shadow-lg ${dark ? "border-slate-600 bg-slate-800" : "border-slate-200 bg-white"}`}>
              {SANDBOX_MODES.map((m) => (
                <button key={m.id} type="button" onClick={() => switchMode(m.id)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-xs transition-colors ${m.id === sandboxMode ? (dark ? "bg-slate-700 text-white" : "bg-sky-50 text-sky-700") : (dark ? "text-slate-300 hover:bg-slate-700/60" : "text-slate-600 hover:bg-slate-50")}`}>
                  <span className="w-6 font-mono text-sky-400">{m.badge}</span>{m.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Response language */}
        <div className="relative">
          <button type="button" onClick={() => { setShowLangDropdown((v) => !v); setShowModeDropdown(false); }} className={sec}>
            <Globe className="h-3.5 w-3.5" />
            <span>{langLabel}</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
          {showLangDropdown && (
            <div className={`absolute left-0 top-full z-30 mt-1 w-44 max-h-64 overflow-y-auto rounded-xl border shadow-lg ${dark ? "border-slate-600 bg-slate-800" : "border-slate-200 bg-white"}`}>
              {LANGUAGE_OPTIONS.map((l) => (
                <button key={l.code} type="button" onClick={() => { setResponseLang(l.code); setShowLangDropdown(false); }}
                  className={`flex w-full items-center px-3 py-2 text-xs transition-colors ${l.code === responseLang ? (dark ? "bg-slate-700 text-white" : "bg-sky-50 text-sky-700") : (dark ? "text-slate-300 hover:bg-slate-700/60" : "text-slate-600 hover:bg-slate-50")}`}>
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* CDN library picker */}
        {sandboxMode === "html-css-js" && (
          <div className="relative">
            <button type="button" onClick={() => { setShowCdnPicker((v) => !v); setShowModeDropdown(false); setShowLangDropdown(false); }}
              title="Wstaw bibliotekę CDN" aria-label="Wstaw bibliotekę CDN" className={sec}>
              <Package className="h-3.5 w-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Biblioteki</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
            {showCdnPicker && (
              <div className={`absolute left-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-xl border shadow-lg ${dark ? "border-slate-600 bg-slate-800" : "border-slate-200 bg-white"}`}>
                <div className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wide ${dark ? "text-slate-500" : "text-slate-400"}`}>Wstaw CDN</div>
                {CDN_LIBRARIES.map((lib) => (
                  <button key={lib.name} type="button" onClick={() => insertCdn(lib)}
                    className={`flex w-full flex-col items-start px-3 py-2 text-xs transition-colors ${dark ? "text-slate-300 hover:bg-slate-700" : "text-slate-700 hover:bg-slate-50"}`}>
                    <span className="font-medium">{lib.name}</span>
                    <span className={`text-[10px] ${dark ? "text-slate-500" : "text-slate-400"}`}>{lib.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex-1" />

        <button type="button" onClick={refreshPreview} title="Odśwież podgląd" aria-label="Odśwież podgląd" className={sec}>
          <RefreshCw className="h-3.5 w-3.5" /><span className="hidden sm:inline">Odśwież</span>
        </button>
        <button type="button" onClick={clearCode} title="Wyczyść kod" aria-label="Wyczyść kod" className={sec}>
          <Trash2 className="h-3.5 w-3.5" /><span className="hidden sm:inline">Wyczyść</span>
        </button>

        <button type="button" onClick={handleReview} title="Przegląd kodu AI" aria-label="Przegląd kodu AI" className={sec}>
          <BookMarked className="h-3.5 w-3.5 text-violet-400" /><span className="hidden sm:inline">Przegląd AI</span>
        </button>
        {sandboxMode !== "html-css-js" && (
          <button type="button" onClick={() => void runOnServer()} title="Uruchom na serwerze" aria-label="Uruchom na serwerze" className={pri} disabled={serverRunLoading}>
            {serverRunLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Run on Server</span>
          </button>
        )}
        <button type="button" onClick={() => setAiPanelOpen((v) => !v)} title="Panel AI" aria-label="Panel AI" className={pri}>
          <Bot className="h-3.5 w-3.5" /><span className="hidden sm:inline">AI</span>
        </button>
        <button type="button" onClick={() => { setRunMode((v) => !v); if (!runMode) setPreviewVisible(true); }}
          title={runMode ? "Wyjdź z trybu prezentacji" : "Tryb prezentacji"} aria-label={runMode ? "Wyjdź z trybu prezentacji" : "Tryb prezentacji"}
          className={sec}>
          {runMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{runMode ? "Wyjdź" : "Prezentacja"}</span>
        </button>
        {!runMode && (
          <button type="button" onClick={() => setPreviewVisible((v) => !v)}
            title={previewVisible ? "Ukryj podgląd" : "Pokaż podgląd"} aria-label={previewVisible ? "Ukryj podgląd" : "Pokaż podgląd"}
            className={sec}>
            <Play className="h-3.5 w-3.5" /><span className="hidden sm:inline">{previewVisible ? "Ukryj podgląd" : "Podgląd"}</span>
          </button>
        )}
      </div>

      {/* ── Main area ── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Editor pane — hidden in run mode */}
        <div className={`flex min-h-0 flex-col border-r ${dark ? "border-slate-700" : "border-slate-200"} ${runMode ? "hidden" : (previewVisible || aiPanelOpen ? "w-1/2" : "flex-1")}`}>
          {sandboxMode === "html-css-js" ? (
            <div className="flex min-h-0 flex-1 flex-col divide-y divide-slate-700/60">
              <div className="min-h-0 flex-1">
                <SandboxEditor language="html" value={html} onChange={setHtml} dark={dark} height="100%" label="HTML" labelColor="#60a5fa" />
              </div>
              <div className="min-h-0 flex-1">
                <SandboxEditor language="css" value={css} onChange={setCss} dark={dark} height="100%" label="CSS" labelColor="#f97316" />
              </div>
              <div className="min-h-0 flex-1">
                <SandboxEditor language="javascript" value={js} onChange={setJs} dark={dark} height="100%" label="JavaScript" labelColor="#eab308" />
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1">
              <SandboxEditor language={MONACO_LANG[sandboxMode]} value={singleCode || INITIAL_SINGLE[sandboxMode]} onChange={setSingleCode} dark={dark} height="100%" />
            </div>
          )}

          {/* Console strip */}
          <div className={`flex-shrink-0 border-t ${dark ? "border-slate-700" : "border-slate-200"}`}>
            <button type="button" onClick={() => setConsoleOpen((v) => !v)}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs font-medium ${dark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-700"}`}>
              <span className="font-mono">{">"}_</span>
              <span>Konsola</span>
              {errorCount > 0 && (
                <span className="ml-1 rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-400">{errorCount}</span>
              )}
              <span className="ml-auto">{consoleOpen ? "▲" : "▼"}</span>
              {consoleLogs.length > 0 && (
                <button type="button" onClick={(e) => { e.stopPropagation(); setConsoleLogs([]); }} title="Wyczyść konsolę" aria-label="Wyczyść konsolę" className="opacity-60 hover:opacity-100">
                  <X className="h-3 w-3" />
                </button>
              )}
              {errorCount > 0 && (
                <button type="button" onClick={(e) => { e.stopPropagation(); handleTroubleshoot(); }}
                  title="Napraw z AI" aria-label="Napraw z AI"
                  className="flex items-center gap-1 rounded-lg bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-400 hover:bg-red-500/30">
                  <Sparkles className="h-2.5 w-2.5" />Napraw
                </button>
              )}
            </button>
            {consoleOpen && (
              <div className={`max-h-32 overflow-y-auto px-3 pb-2 font-mono text-[11px] ${dark ? "bg-slate-950" : "bg-slate-100"}`}>
                {consoleLogs.length === 0
                  ? <div className={`py-1 ${dark ? "text-slate-600" : "text-slate-400"}`}>Brak wyjścia konsoli.</div>
                  : consoleLogs.map((e, i) => (
                    <div key={i} className={e.kind === "error" ? "text-red-400" : e.kind === "warn" ? "text-yellow-400" : dark ? "text-slate-300" : "text-slate-700"}>
                      {e.kind === "error" ? "✗ " : e.kind === "warn" ? "⚠ " : "› "}{e.text}
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        </div>

        {/* Right pane — always visible in run mode */}
        {(previewVisible || aiPanelOpen || runMode) && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {(previewVisible || runMode) && (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className={`flex flex-shrink-0 items-center gap-2 border-b px-3 py-1.5 ${panelCls}`}>
                  <span className={`text-xs font-semibold ${dark ? "text-sky-400" : "text-sky-600"}`}>
                    {sandboxMode === "html-css-js" ? "Podgląd" : "Wyjście"}
                  </span>
                  {sandboxMode === "html-css-js" && (
                    <span className={`text-[10px] ${dark ? "text-slate-500" : "text-slate-400"}`}>{getPageTitle()}</span>
                  )}
                  <div className="flex-1" />
                  {runMode && (
                    <button type="button" onClick={() => setRunMode(false)}
                      title="Wyjdź z trybu prezentacji" aria-label="Wyjdź z trybu prezentacji"
                      className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] transition-colors ${dark ? "text-slate-400 hover:bg-slate-700 hover:text-white" : "text-slate-500 hover:bg-slate-200 hover:text-slate-800"}`}>
                      <Minimize2 className="h-3 w-3" />Wyjdź z prezentacji
                    </button>
                  )}
                  {/* Device frame label */}
                  {deviceFrame !== "none" && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${dark ? "bg-slate-700 text-sky-400" : "bg-sky-100 text-sky-700"}`}>
                      {deviceFrame === "mobile" ? "📱 375px" : "💻 768px"}
                    </span>
                  )}
                </div>
                {sandboxMode === "html-css-js" ? (
                  deviceFrame !== "none" ? (
                    <div className={`flex min-h-0 flex-1 items-center justify-center overflow-auto p-4 ${dark ? "bg-slate-800/40" : "bg-slate-100"}`}>
                      <div className={`overflow-hidden rounded-2xl border-4 shadow-2xl bg-white flex-shrink-0 ${dark ? "border-slate-500" : "border-slate-400"}`}
                        style={{ width: deviceFrame === "mobile" ? 375 : 768, height: deviceFrame === "mobile" ? 667 : 600 }}>
                        <iframe srcDoc={previewDoc} title="Podgląd sandboxa" className="w-full h-full border-none bg-white" sandbox="allow-scripts" />
                      </div>
                    </div>
                  ) : (
                    <iframe srcDoc={previewDoc} title="Podgląd sandboxa" className="min-h-0 flex-1 w-full border-none bg-white" sandbox="allow-scripts" />
                  )
                ) : (
                  <div className={`flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center ${dark ? "text-slate-400" : "text-slate-500"}`}>
                    <SquareTerminal className={`h-10 w-10 ${dark ? "text-slate-700" : "text-slate-300"}`} />
                     <p className="max-w-xs text-sm">
                       Tryb <strong>{currentMode.label}</strong> nie obsługuje podglądu w przeglądarce.
                       Użyj przycisku <strong>Run on Server</strong>, aby wykonać kod z limitem 10 sekund i zobaczyć stdout/stderr w konsoli.
                     </p>
                     <button type="button" onClick={() => void runOnServer()} className={pri} disabled={serverRunLoading}>
                       {serverRunLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Run on Server
                     </button>
                   </div>
                 )}
                {sandboxMode === "html-css-js" && (
                  <div className={`flex flex-shrink-0 items-center gap-3 border-t px-3 py-2 text-xs ${panelCls}`}>
                    <span className={`font-medium ${dark ? "text-slate-300" : "text-slate-700"}`}>{getPageTitle()}</span>
                    <span className={`rounded-full px-2 py-0.5 font-mono ${dark ? "bg-slate-700 text-sky-400" : "bg-sky-100 text-sky-700"}`}>HTML/CSS/JS</span>
                    <span className={dark ? "text-slate-500" : "text-slate-400"}>
                      {html.split("\n").length + css.split("\n").length + js.split("\n").length} wierszy
                    </span>
                    <div className="flex-1" />
                    <button type="button"
                      onClick={() => {
                        const payload = JSON.stringify({ html, css, js });
                        // Encode UTF-8 bytes via TextEncoder so non-ASCII characters survive btoa()
                        const bytes = new TextEncoder().encode(payload);
                        const encoded = btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
                        void navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?sandbox=${encoded}`);
                      }}
                      title="Kopiuj link do sandboxa" aria-label="Kopiuj link do sandboxa" className={sec}>
                      Udostępnij
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* AI Panel */}
            {aiPanelOpen && (
              <div className={`flex flex-shrink-0 flex-col border-t ${panelCls} ${previewVisible ? "h-72" : "flex-1"}`}>
                <div className={`flex flex-shrink-0 items-center gap-2 border-b px-3 py-2 ${dark ? "border-slate-700" : "border-slate-200"}`}>
                  <Bot className="h-4 w-4 text-sky-400" />
                  <span className="text-xs font-semibold">Asystent AI</span>
                  {aiLoading && <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin text-sky-400" />}
                  <div className="flex-1" />
                  <button type="button" onClick={handleReview} disabled={aiLoading} className={`${sec} text-[10px] px-2 py-1`}>
                    <BookMarked className="h-3 w-3" />Przegląd
                  </button>
                  <button type="button" onClick={handleTroubleshoot} disabled={aiLoading} className={`${sec} text-[10px] px-2 py-1`}>
                    <Sparkles className="h-3 w-3" />Napraw
                  </button>
                  <button type="button" onClick={() => { aiAbortRef.current?.abort(); setAiPanelOpen(false); }}
                    title="Zamknij panel AI" aria-label="Zamknij panel AI"
                    className={`ml-1 rounded-lg p-1 ${dark ? "text-slate-400 hover:bg-slate-700" : "text-slate-500 hover:bg-slate-200"}`}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3 text-xs">
                  {aiResponse ? (
                    <ReactMarkdown
                      components={{
                        code({ className, children, ...props }) {
                          const match = /language-(\w+)/.exec(className ?? "");
                          if (match) {
                            return (
                              <SyntaxHighlighter style={oneDark} language={match[1]} PreTag="div" className="rounded-lg text-[11px]">
                                {String(children).replace(/\n$/, "")}
                              </SyntaxHighlighter>
                            );
                          }
                          return <code className={`rounded bg-slate-700/50 px-1 font-mono text-[11px] ${className}`} {...props}>{children}</code>;
                        },
                      }}
                    >
                      {aiResponse}
                    </ReactMarkdown>
                  ) : aiLoading ? (
                    <div className={`flex items-center gap-2 ${dark ? "text-slate-400" : "text-slate-500"}`}>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />Generowanie odpowiedzi...
                    </div>
                  ) : (
                    <div className={dark ? "text-slate-500" : "text-slate-400"}>
                      Zadaj pytanie lub użyj przycisków powyżej, aby przeanalizować kod.
                    </div>
                  )}
                </div>
                <div className={`flex flex-shrink-0 gap-2 border-t p-2 ${dark ? "border-slate-700" : "border-slate-200"}`}>
                  <input id="sandbox-ai-input" name="sandboxAiInput" value={aiInput} onChange={(e) => setAiInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleCustomQuery(); } }}
                    placeholder="Zapytaj AI o swój kod..." disabled={aiLoading}
                    className={`flex-1 rounded-xl border px-3 py-1.5 text-xs outline-none transition-colors ${dark ? "border-slate-600 bg-slate-800 text-slate-200 placeholder-slate-500 focus:border-sky-500" : "border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:border-sky-400"}`}
                  />
                  <button type="button" onClick={handleCustomQuery} disabled={aiLoading || !aiInput.trim()} className={`${pri} disabled:opacity-40`}>
                    {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Close dropdowns on outside click */}
      {(showModeDropdown || showLangDropdown || showCdnPicker) && (
        <div className="fixed inset-0 z-20" onClick={() => { setShowModeDropdown(false); setShowLangDropdown(false); setShowCdnPicker(false); }} />
      )}
    </div>
  );
}
