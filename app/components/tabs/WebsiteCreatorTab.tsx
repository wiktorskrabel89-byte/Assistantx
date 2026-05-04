"use client";

import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Globe2,
  Loader2,
  PlusCircle,
  RefreshCw,
  Rocket,
  Sparkles,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useCallback, useEffect, useRef, useState } from "react";
import { SandboxEditor } from "../SandboxEditor";
import { createClient } from "@/lib/client";

// ─── Types ─────────────────────────────────────────────────────────────────────

type ProjectStatus = "draft" | "deploying" | "live" | "error";

type Project = {
  id: string;
  name: string;
  html: string;
  css: string;
  js: string;
  northflank_service_id: string | null;
  cloudflare_record_id: string | null;
  live_url: string | null;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
};

type Template = {
  id: string;
  label: string;
  description: string;
  html: string;
  css: string;
  js: string;
};

// ─── Starter templates ─────────────────────────────────────────────────────────

const TEMPLATES: Template[] = [
  {
    id: "blank",
    label: "Pusta strona",
    description: "Zacznij od zera",
    html: "<h1>Moja strona</h1>\n<p>Zacznij budować tutaj...</p>",
    css: "body { font-family: system-ui; padding: 40px; max-width: 800px; margin: 0 auto; }",
    js: "",
  },
  {
    id: "portfolio",
    label: "Portfolio",
    description: "Strona osobista",
    html: `<header class="hero">\n  <h1>Jan Kowalski</h1>\n  <p>Programista Full-Stack</p>\n</header>\n<section class="about">\n  <h2>O mnie</h2>\n  <p>Buduję nowoczesne aplikacje webowe.</p>\n</section>`,
    css: `body{font-family:system-ui;margin:0;padding:0;background:#0f172a;color:#e2e8f0}.hero{background:linear-gradient(135deg,#3b82f6,#8b5cf6);padding:80px 40px;text-align:center}.hero h1{font-size:3rem;margin:0}.hero p{font-size:1.25rem;opacity:.8}.about{max-width:700px;margin:40px auto;padding:0 20px}`,
    js: "",
  },
  {
    id: "landing",
    label: "Landing page",
    description: "Strona sprzedażowa",
    html: `<nav class="nav"><span class="logo">Brand</span><a href="#cta" class="btn">Zacznij</a></nav>\n<section class="hero"><h1>Rozwiązanie dla Twojego biznesu</h1><p>Prosta, skuteczna, nowoczesna platforma.</p><a href="#cta" class="btn-hero">Wypróbuj za darmo</a></section>\n<section id="cta" class="cta"><h2>Zacznij teraz</h2><input type="email" placeholder="Twój email"><button>Dołącz</button></section>`,
    css: `*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui;background:#f8fafc}.nav{display:flex;justify-content:space-between;align-items:center;padding:16px 40px;background:white;border-bottom:1px solid #e2e8f0}.logo{font-weight:700;font-size:1.25rem}.btn{background:#3b82f6;color:white;padding:8px 20px;border-radius:8px;text-decoration:none;font-size:.875rem}.hero{text-align:center;padding:100px 40px;background:linear-gradient(135deg,#eff6ff,#dbeafe)}.hero h1{font-size:2.5rem;font-weight:800;color:#1e3a8a;margin-bottom:16px}.hero p{font-size:1.125rem;color:#475569;margin-bottom:32px}.btn-hero{display:inline-block;background:#3b82f6;color:white;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:600}.cta{text-align:center;padding:80px 40px;background:white}.cta h2{font-size:1.75rem;font-weight:700;margin-bottom:24px;color:#1e293b}.cta input{padding:12px 16px;border:1px solid #e2e8f0;border-radius:8px;font-size:1rem;margin-right:8px;width:280px}.cta button{background:#3b82f6;color:white;padding:12px 24px;border:none;border-radius:8px;font-size:1rem;cursor:pointer}`,
    js: "",
  },
  {
    id: "blog",
    label: "Blog",
    description: "Strona z artykułami",
    html: `<header><h1>Mój Blog</h1></header>\n<main>\n  <article class="post"><h2>Pierwszy wpis</h2><span class="date">1 maja 2026</span><p>To jest mój pierwszy wpis na blogu. Zacznij pisać swoje artykuły tutaj.</p><a href="#" class="read-more">Czytaj więcej →</a></article>\n  <article class="post"><h2>Drugi wpis</h2><span class="date">28 kwietnia 2026</span><p>Kolejny artykuł na blogu z ciekawą treścią i wartościowymi informacjami.</p><a href="#" class="read-more">Czytaj więcej →</a></article>\n</main>`,
    css: `body{font-family:Georgia,serif;max-width:720px;margin:0 auto;padding:40px 20px;background:#fffbf7;color:#2d2d2d}header{border-bottom:2px solid #e5e7eb;padding-bottom:20px;margin-bottom:40px}header h1{font-size:2rem;color:#111}.post{border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:24px;background:white;box-shadow:0 2px 8px rgba(0,0,0,.04)}.post h2{font-size:1.375rem;margin:0 0 8px}.date{color:#9ca3af;font-size:.875rem;font-style:italic}.post p{line-height:1.7;color:#4b5563;margin:12px 0}.read-more{color:#3b82f6;text-decoration:none;font-size:.875rem;font-weight:600}`,
    js: "",
  },
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Panel administracyjny",
    html: `<div class="layout"><aside class="sidebar"><h2>Panel</h2><nav><a href="#">Przegląd</a><a href="#">Analityka</a><a href="#">Użytkownicy</a><a href="#">Ustawienia</a></nav></aside><main class="main"><h1>Przegląd</h1><div class="cards"><div class="card"><div class="card-num">1 234</div><div class="card-label">Użytkownicy</div></div><div class="card"><div class="card-num">56 789 zł</div><div class="card-label">Przychód</div></div><div class="card"><div class="card-num">98.5%</div><div class="card-label">Dostępność</div></div></div></main></div>`,
    css: `*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui;background:#f1f5f9}.layout{display:flex;min-height:100vh}.sidebar{width:220px;background:#1e293b;color:#e2e8f0;padding:24px 16px;flex-shrink:0}.sidebar h2{font-size:1rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:20px}.sidebar nav a{display:block;padding:10px 12px;border-radius:8px;color:#cbd5e1;text-decoration:none;font-size:.875rem;margin-bottom:4px;transition:background .15s}.sidebar nav a:hover{background:#334155;color:white}.main{flex:1;padding:32px}.main h1{font-size:1.5rem;font-weight:700;color:#1e293b;margin-bottom:24px}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.card{background:white;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.07)}.card-num{font-size:2rem;font-weight:700;color:#1e293b}.card-label{font-size:.875rem;color:#64748b;margin-top:4px}`,
    js: "",
  },
];

// ─── Build iframe preview document ────────────────────────────────────────────

function buildPreview(html: string, css: string, js: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${html}${js ? `<script>${js}<\/script>` : ""}</body></html>`;
}

// ─── AI streaming helper ───────────────────────────────────────────────────────

async function streamChat(
  prompt: string,
  signal: AbortSignal,
  onToken: (t: string) => void
): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ message: prompt, mode: "code", userPlan: "free", history: [] }),
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

// ─── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ProjectStatus }) {
  const map: Record<ProjectStatus, { label: string; cls: string }> = {
    draft:     { label: "Szkic",       cls: "bg-slate-500/20 text-slate-400" },
    deploying: { label: "Wdrażanie",   cls: "bg-amber-500/20 text-amber-400" },
    live:      { label: "Live",        cls: "bg-emerald-500/20 text-emerald-400" },
    error:     { label: "Błąd",        cls: "bg-red-500/20 text-red-400" },
  };
  const { label, cls } = map[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {status === "live" && <CheckCircle2 className="mr-1 h-2.5 w-2.5" />}
      {status === "deploying" && <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />}
      {label}
    </span>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function WebsiteCreatorTab({ dark }: { dark: boolean }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  // Code state
  const [html, setHtml] = useState(TEMPLATES[0].html);
  const [css, setCss] = useState(TEMPLATES[0].css);
  const [js, setJs] = useState(TEMPLATES[0].js);
  const [previewDoc, setPreviewDoc] = useState(() => buildPreview(TEMPLATES[0].html, TEMPLATES[0].css, TEMPLATES[0].js));

  // Right panel
  const [rightTab, setRightTab] = useState<"preview" | "logs" | "ai">("preview");
  const [deployLogs, setDeployLogs] = useState<string[]>([]);
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState("");
  const [subdomainInput, setSubdomainInput] = useState("");
  const [domainLoading, setDomainLoading] = useState(false);
  const [domainResult, setDomainResult] = useState("");

  // AI
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const aiAbortRef = useRef<AbortController | null>(null);

  // Preview debounce
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPreviewDoc(buildPreview(html, css, js));
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [html, css, js]);

  // Load projects on mount
  useEffect(() => {
    void loadProjects();
  }, []);

  async function getAuthToken(): Promise<string | null> {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function loadProjects() {
    setLoadingProjects(true);
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch("/api/website-creator/projects", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json() as { projects: Project[] };
        setProjects(data.projects ?? []);
      }
    } catch {
      // ignore — not authenticated or server not configured
    } finally {
      setLoadingProjects(false);
    }
  }

  async function saveActiveProject() {
    if (!activeProject) return;
    try {
      const token = await getAuthToken();
      if (!token) return;
      await fetch(`/api/website-creator/projects/${activeProject.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ html, css, js, name: activeProject.name }),
      });
      await loadProjects();
    } catch { /* ignore */ }
  }

  async function createProject(template: Template) {
    setShowTemplates(false);
    try {
      const token = await getAuthToken();
      if (!token) {
        // Work locally without auth
        const local: Project = {
          id: `local-${Date.now()}`,
          name: `Projekt ${Date.now()}`,
          html: template.html,
          css: template.css,
          js: template.js,
          northflank_service_id: null,
          cloudflare_record_id: null,
          live_url: null,
          status: "draft",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setProjects((p) => [local, ...p]);
        openProject(local);
        return;
      }
      const res = await fetch("/api/website-creator/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: `Projekt ${new Date().toLocaleDateString("pl-PL")}`, html: template.html, css: template.css, js: template.js }),
      });
      if (res.ok) {
        const data = await res.json() as { project: Project };
        setProjects((p) => [data.project, ...p]);
        openProject(data.project);
      }
    } catch { /* ignore */ }
  }

  function openProject(p: Project) {
    setActiveProject(p);
    setHtml(p.html);
    setCss(p.css);
    setJs(p.js);
    setDeployLogs([]);
    setDeployError("");
    setDomainResult("");
  }

  async function deleteProject(p: Project) {
    try {
      const token = await getAuthToken();
      if (token && !p.id.startsWith("local-")) {
        await fetch(`/api/website-creator/projects/${p.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch { /* ignore */ }
    setProjects((prev) => prev.filter((x) => x.id !== p.id));
    if (activeProject?.id === p.id) setActiveProject(null);
  }

  async function deployProject() {
    if (!activeProject) return;
    await saveActiveProject();
    setDeploying(true);
    setDeployLogs(["Przygotowywanie wdrożenia..."]);
    setDeployError("");
    setRightTab("logs");

    try {
      const token = await getAuthToken();
      const res = await fetch("/api/website-creator/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ projectId: activeProject.id, html, css, js, projectName: activeProject.name }),
      });
      const data = await res.json() as { previewUrl?: string; deploymentId?: string; error?: string; logs?: string[] };
      if (!res.ok || data.error) {
        setDeployError(data.error ?? "Wdrożenie nie powiodło się.");
        setDeployLogs((prev) => [...prev, `✗ ${data.error ?? "Nieznany błąd"}`]);
      } else {
        setDeployLogs((prev) => [...prev, "✓ Plik index.html przesłany.", `✓ URL podglądu: ${data.previewUrl ?? "—"}`, "Wdrożenie zakończone."]);
        if (data.previewUrl) {
          const previewUrl = data.previewUrl;
          setActiveProject((p) => p ? { ...p, live_url: previewUrl, status: "live" } : p);
          setProjects((ps) => ps.map((x) => x.id === activeProject.id ? { ...x, live_url: previewUrl, status: "live" } : x));
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Błąd wdrożenia.";
      setDeployError(msg);
      setDeployLogs((prev) => [...prev, `✗ ${msg}`]);
    } finally {
      setDeploying(false);
    }
  }

  async function handleSetDomain() {
    if (!subdomainInput.trim()) return;
    setDomainLoading(true);
    setDomainResult("");
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/website-creator/domain", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ projectId: activeProject?.id, subdomain: subdomainInput.trim(), targetUrl: activeProject?.live_url }),
      });
      const data = await res.json() as { liveUrl?: string; error?: string };
      if (data.liveUrl) {
        const liveUrl = data.liveUrl;
        setDomainResult(liveUrl);
        setActiveProject((p) => p ? { ...p, live_url: liveUrl } : p);
      } else {
        setDomainResult(`Błąd: ${data.error ?? "Nieznany błąd"}`);
      }
    } catch (e) {
      setDomainResult(`Błąd: ${e instanceof Error ? e.message : "Nieznany błąd"}`);
    } finally {
      setDomainLoading(false);
    }
  }

  const generateCode = useCallback(async (instruction: string) => {
    aiAbortRef.current?.abort();
    aiAbortRef.current = new AbortController();
    setAiResponse("");
    setAiLoading(true);
    setRightTab("ai");

    const prompt = `Wygeneruj kompletną stronę internetową (HTML + CSS + JavaScript) na podstawie poniższego opisu. Odpowiedz TYLKO w formacie JSON z kluczami "html", "css", "js" — nic więcej poza JSON.\n\nOpis: ${instruction}`;
    let full = "";
    try {
      await streamChat(prompt, aiAbortRef.current.signal, (t) => {
        full += t;
        setAiResponse(full);
      });
      // Try parsing JSON from response
      const jsonMatch = full.match(/\{[\s\S]*"html"[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]) as { html?: string; css?: string; js?: string };
          if (parsed.html !== undefined) setHtml(parsed.html);
          if (parsed.css !== undefined) setCss(parsed.css);
          if (parsed.js !== undefined) setJs(parsed.js);
        } catch { /* show raw response */ }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setAiResponse("Błąd generowania kodu.");
    } finally {
      setAiLoading(false);
    }
  }, []);

  async function troubleshootWithAI() {
    const logText = deployLogs.slice(-20).join("\n");
    const prompt = `Oto logi wdrożenia:\n${logText}\n\nOto kod:\nHTML:\n${html}\n\nCSS:\n${css}\n\nJS:\n${js}\n\nCo jest nie tak i jak to naprawić?`;
    setRightTab("ai");
    aiAbortRef.current?.abort();
    aiAbortRef.current = new AbortController();
    setAiResponse("");
    setAiLoading(true);
    let full = "";
    try {
      await streamChat(prompt, aiAbortRef.current.signal, (t) => { full += t; setAiResponse(full); });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setAiResponse("Błąd.");
    } finally {
      setAiLoading(false);
    }
  }

  // Styling
  const dark2 = dark;
  const bg = dark2 ? "bg-slate-950 text-slate-100" : "bg-white text-slate-900";
  const panelBg = dark2 ? "bg-slate-900 border-slate-700" : "bg-slate-50 border-slate-200";
  const itemHover = dark2 ? "hover:bg-slate-800/60" : "hover:bg-slate-100";
  const base = "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all";
  const sec = dark2
    ? `${base} border border-slate-600 text-slate-300 hover:border-slate-400 hover:text-white`
    : `${base} border border-slate-300 text-slate-600 hover:border-slate-500 hover:text-slate-900`;
  const pri = `${base} bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm hover:from-orange-400 hover:to-amber-400`;

  return (
    <div className={`flex h-full min-h-0 overflow-hidden ${bg}`}>

      {/* ── Left: Project list ── */}
      <aside className={`flex w-56 flex-shrink-0 flex-col border-r ${panelBg}`}>
        <div className={`flex items-center justify-between border-b px-3 py-3 ${dark2 ? "border-slate-700" : "border-slate-200"}`}>
          <div className="flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-orange-500" />
            <span className="text-sm font-semibold">Moje strony</span>
          </div>
          <button type="button" onClick={() => setShowTemplates(true)} title="Nowy projekt" aria-label="Nowy projekt"
            className={`rounded-lg p-1 ${dark2 ? "text-slate-400 hover:bg-slate-700 hover:text-white" : "text-slate-500 hover:bg-slate-200 hover:text-slate-800"}`}>
            <PlusCircle className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {loadingProjects ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className={`h-5 w-5 animate-spin ${dark2 ? "text-slate-600" : "text-slate-400"}`} />
            </div>
          ) : projects.length === 0 ? (
            <div className={`px-3 py-6 text-center text-xs ${dark2 ? "text-slate-500" : "text-slate-400"}`}>
              <Globe2 className="mx-auto mb-2 h-8 w-8 opacity-30" />
              <p>Brak projektów.</p>
              <button type="button" onClick={() => setShowTemplates(true)} className={`mt-2 ${sec}`}>
                <PlusCircle className="h-3 w-3" />Nowy
              </button>
            </div>
          ) : (
            projects.map((p) => (
              <div key={p.id}
                onClick={() => openProject(p)}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2.5 transition-colors ${itemHover} ${activeProject?.id === p.id ? (dark2 ? "bg-slate-800" : "bg-orange-50") : ""}`}>
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-xs font-medium ${dark2 ? "text-slate-200" : "text-slate-800"}`}>{p.name}</div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <StatusBadge status={p.status} />
                    <span className={`text-[10px] ${dark2 ? "text-slate-600" : "text-slate-400"}`}>
                      {new Date(p.updated_at).toLocaleDateString("pl-PL")}
                    </span>
                  </div>
                </div>
                <button type="button" onClick={(e) => { e.stopPropagation(); void deleteProject(p); }}
                  title="Usuń projekt" aria-label="Usuń projekt"
                  className={`flex-shrink-0 opacity-0 group-hover:opacity-100 rounded-lg p-1 transition-opacity ${dark2 ? "text-slate-500 hover:bg-slate-700 hover:text-red-400" : "text-slate-400 hover:bg-slate-200 hover:text-red-500"}`}>
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))
          )}
        </div>
        <div className={`border-t p-3 ${dark2 ? "border-slate-700" : "border-slate-200"}`}>
          <button type="button" onClick={() => void loadProjects()} className={`${sec} w-full justify-center text-[10px]`}>
            <RefreshCw className="h-3 w-3" />Odśwież
          </button>
        </div>
      </aside>

      {/* ── Center: Code workspace ── */}
      <div className="flex min-h-0 flex-1 flex-col border-r" style={{ borderColor: dark2 ? "#334155" : "#e2e8f0" }}>
        {/* Project overview card */}
        {activeProject ? (
          <div className={`flex flex-shrink-0 items-center gap-3 border-b px-4 py-2.5 ${dark2 ? "border-slate-700 bg-slate-900/60" : "border-slate-200 bg-white"}`}>
            {editingName ? (
              <input autoFocus value={nameInput} onChange={(e) => setNameInput(e.target.value)}
                onBlur={async () => {
                  setEditingName(false);
                  if (nameInput.trim() && nameInput !== activeProject.name) {
                    const updated = { ...activeProject, name: nameInput.trim() };
                    setActiveProject(updated);
                    setProjects((ps) => ps.map((x) => x.id === activeProject.id ? updated : x));
                    const token = await getAuthToken();
                    if (token && !activeProject.id.startsWith("local-")) {
                      void fetch(`/api/website-creator/projects/${activeProject.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ name: nameInput.trim() }),
                      });
                    }
                  }
                }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                className={`flex-1 rounded-lg border px-2 py-1 text-sm font-semibold outline-none ${dark2 ? "border-slate-600 bg-slate-800 text-slate-100" : "border-slate-300 bg-white text-slate-900"}`}
              />
            ) : (
              <button type="button" onClick={() => { setNameInput(activeProject.name); setEditingName(true); }}
                className={`truncate text-sm font-semibold ${dark2 ? "text-slate-100 hover:text-white" : "text-slate-800 hover:text-slate-900"}`}>
                {activeProject.name}
              </button>
            )}
            <StatusBadge status={activeProject.status} />
            {activeProject.live_url && (
              <a href={activeProject.live_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] text-sky-400 hover:underline">
                <ExternalLink className="h-3 w-3" />
                <span className="max-w-[120px] truncate">{activeProject.live_url}</span>
              </a>
            )}
            <div className="flex-1" />
            <span className={`hidden items-center gap-1 text-[10px] sm:flex ${dark2 ? "text-slate-500" : "text-slate-400"}`}>
              <Clock className="h-3 w-3" />
              {new Date(activeProject.updated_at).toLocaleString("pl-PL")}
            </span>
            <button type="button" onClick={() => void saveActiveProject()} className={sec}>Zapisz</button>
            <button type="button" onClick={() => void deployProject()} disabled={deploying} className={`${pri} disabled:opacity-50`}>
              {deploying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
              {deploying ? "Wdrażanie..." : "Wdróż"}
            </button>
          </div>
        ) : (
          <div className={`flex flex-shrink-0 items-center gap-3 border-b px-4 py-2.5 ${dark2 ? "border-slate-700" : "border-slate-200"}`}>
            <span className={`text-sm ${dark2 ? "text-slate-500" : "text-slate-400"}`}>Wybierz projekt lub utwórz nowy</span>
            <div className="flex-1" />
            <button type="button" onClick={() => setShowTemplates(true)} className={pri}>
              <PlusCircle className="h-3.5 w-3.5" />Nowy projekt
            </button>
          </div>
        )}

        {/* AI generation bar */}
        <div className={`flex flex-shrink-0 items-center gap-2 border-b px-4 py-2 ${dark2 ? "border-slate-700 bg-slate-900/40" : "border-slate-100 bg-slate-50/80"}`}>
          <Sparkles className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
          <input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && aiPrompt.trim()) { void generateCode(aiPrompt); setAiPrompt(""); } }}
            placeholder="Opisz stronę do wygenerowania... (np. strona portfolio dla fotografa)"
            className={`flex-1 bg-transparent text-xs outline-none ${dark2 ? "text-slate-300 placeholder-slate-600" : "text-slate-700 placeholder-slate-400"}`}
          />
          <button type="button" onClick={() => { if (aiPrompt.trim()) { void generateCode(aiPrompt); setAiPrompt(""); } }}
            disabled={aiLoading || !aiPrompt.trim()} className={`${pri} disabled:opacity-40 text-xs px-2.5 py-1.5`}>
            {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Sparkles className="h-3.5 w-3.5" />Generuj</>}
          </button>
        </div>

        {/* Three editors */}
        <div className="flex min-h-0 flex-1 flex-col divide-y divide-slate-700/60">
          <div className="min-h-0 flex-1">
            <SandboxEditor language="html" value={html} onChange={setHtml} dark={dark2} height="100%" label="HTML" labelColor="#60a5fa" />
          </div>
          <div className="min-h-0 flex-1">
            <SandboxEditor language="css" value={css} onChange={setCss} dark={dark2} height="100%" label="CSS" labelColor="#f97316" />
          </div>
          <div className="min-h-0 flex-1">
            <SandboxEditor language="javascript" value={js} onChange={setJs} dark={dark2} height="100%" label="JavaScript" labelColor="#eab308" />
          </div>
        </div>
      </div>

      {/* ── Right: Preview / Logs / AI ── */}
      <div className={`flex w-96 flex-shrink-0 flex-col ${dark2 ? "bg-slate-900" : "bg-white"}`}>
        {/* Tabs */}
        <div className={`flex flex-shrink-0 border-b ${dark2 ? "border-slate-700" : "border-slate-200"}`}>
          {(["preview", "logs", "ai"] as const).map((t) => {
            const labels = { preview: "Podgląd", logs: "Logi", ai: "AI" };
            const icons = { preview: Globe2, logs: Terminal, ai: Bot };
            const Icon = icons[t];
            return (
              <button key={t} type="button" onClick={() => setRightTab(t)}
                className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${rightTab === t ? (dark2 ? "border-b-2 border-orange-400 text-orange-400" : "border-b-2 border-orange-500 text-orange-600") : (dark2 ? "text-slate-500 hover:text-slate-300" : "text-slate-400 hover:text-slate-700")}`}>
                <Icon className="h-3.5 w-3.5" />{labels[t]}
              </button>
            );
          })}
        </div>

        {/* Preview pane */}
        {rightTab === "preview" && (
          <div className="flex min-h-0 flex-1 flex-col">
            <iframe srcDoc={previewDoc} title="Podgląd strony" className="min-h-0 flex-1 w-full border-none bg-white" sandbox="allow-scripts" />
            {activeProject?.live_url && (
              <div className={`flex flex-shrink-0 items-center gap-2 border-t px-3 py-2 text-xs ${dark2 ? "border-slate-700 text-slate-400" : "border-slate-200 text-slate-500"}`}>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <a href={activeProject.live_url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-sky-400 hover:underline">
                  {activeProject.live_url}
                </a>
                <button type="button" onClick={() => void navigator.clipboard.writeText(activeProject.live_url!)}
                  title="Kopiuj URL" aria-label="Kopiuj URL" className={sec}>Kopiuj</button>
              </div>
            )}
          </div>
        )}

        {/* Logs pane */}
        {rightTab === "logs" && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto p-3 font-mono text-[11px]">
              {deployLogs.length === 0 ? (
                <div className={`flex flex-col items-center justify-center gap-2 py-8 text-center ${dark2 ? "text-slate-600" : "text-slate-400"}`}>
                  <Terminal className="h-8 w-8 opacity-40" />
                  <p>Brak logów wdrożenia.</p>
                </div>
              ) : (
                deployLogs.map((log, i) => (
                  <div key={i} className={`py-0.5 ${log.startsWith("✗") ? "text-red-400" : log.startsWith("✓") ? "text-emerald-400" : dark2 ? "text-slate-400" : "text-slate-600"}`}>
                    {log}
                  </div>
                ))
              )}
              {deployError && (
                <div className="mt-2 rounded-lg bg-red-500/10 p-2 text-red-400">{deployError}</div>
              )}
            </div>
            {deployError && (
              <div className={`flex flex-shrink-0 gap-2 border-t p-2 ${dark2 ? "border-slate-700" : "border-slate-200"}`}>
                <button type="button" onClick={troubleshootWithAI} className={pri}>
                  <Sparkles className="h-3.5 w-3.5" />Rozwiąż z AI
                </button>
              </div>
            )}
            {/* Custom domain */}
            <div className={`flex-shrink-0 border-t p-3 ${dark2 ? "border-slate-700" : "border-slate-200"}`}>
              <p className={`mb-2 text-[10px] font-semibold uppercase tracking-wide ${dark2 ? "text-slate-500" : "text-slate-400"}`}>Własna domena</p>
              <div className="flex gap-2">
                <input value={subdomainInput} onChange={(e) => setSubdomainInput(e.target.value)}
                  placeholder="twoja-subdomena"
                  className={`flex-1 rounded-xl border px-2.5 py-1.5 text-xs outline-none ${dark2 ? "border-slate-600 bg-slate-800 text-slate-200 placeholder-slate-600 focus:border-orange-500" : "border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:border-orange-400"}`}
                />
                <button type="button" onClick={() => void handleSetDomain()} disabled={domainLoading || !subdomainInput.trim()} className={`${pri} disabled:opacity-40`}>
                  {domainLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe2 className="h-3.5 w-3.5" />}
                </button>
              </div>
              {domainResult && (
                <p className={`mt-1.5 text-[10px] ${domainResult.startsWith("Błąd") ? "text-red-400" : "text-emerald-400"}`}>{domainResult}</p>
              )}
            </div>
          </div>
        )}

        {/* AI pane */}
        {rightTab === "ai" && (
          <div className="flex min-h-0 flex-1 flex-col">
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
                <div className={`flex items-center gap-2 ${dark2 ? "text-slate-400" : "text-slate-500"}`}>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />Generowanie...
                </div>
              ) : (
                <div className={dark2 ? "text-slate-600" : "text-slate-400"}>
                  Użyj pola generowania powyżej lub poproś AI o pomoc.
                </div>
              )}
            </div>
            <div className={`flex flex-shrink-0 gap-2 border-t p-2 ${dark2 ? "border-slate-700" : "border-slate-200"}`}>
              <button type="button" onClick={troubleshootWithAI} disabled={aiLoading} className={`${sec} disabled:opacity-40 flex-1 justify-center`}>
                <Sparkles className="h-3.5 w-3.5" />Rozwiąż problem z AI
              </button>
              {aiLoading && (
                <button type="button" onClick={() => aiAbortRef.current?.abort()} className={sec}>
                  <X className="h-3.5 w-3.5" />Stop
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Template picker modal ── */}
      {showTemplates && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className={`w-full max-w-2xl overflow-hidden rounded-2xl border shadow-2xl ${dark2 ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}>
            <div className={`flex items-center justify-between border-b px-6 py-4 ${dark2 ? "border-slate-700" : "border-slate-200"}`}>
              <h2 className="text-base font-semibold">Wybierz szablon</h2>
              <button type="button" onClick={() => setShowTemplates(false)} title="Zamknij" aria-label="Zamknij"
                className={`rounded-xl p-1.5 ${dark2 ? "text-slate-400 hover:bg-slate-800" : "text-slate-500 hover:bg-slate-100"}`}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-4 p-6">
              {TEMPLATES.map((t) => (
                <button key={t.id} type="button" onClick={() => void createProject(t)}
                  className={`flex flex-col items-start rounded-xl border p-4 text-left transition-all ${dark2 ? "border-slate-700 bg-slate-800/60 hover:border-orange-500/60 hover:bg-slate-800" : "border-slate-200 bg-slate-50 hover:border-orange-400 hover:bg-orange-50/50"}`}>
                  <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${dark2 ? "bg-gradient-to-br from-orange-500/20 to-amber-500/10" : "bg-gradient-to-br from-orange-100 to-amber-100"}`}>
                    <Globe2 className="h-5 w-5 text-orange-500" />
                  </div>
                  <span className={`text-sm font-semibold ${dark2 ? "text-slate-100" : "text-slate-800"}`}>{t.label}</span>
                  <span className={`mt-0.5 text-xs ${dark2 ? "text-slate-400" : "text-slate-500"}`}>{t.description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Chevron right for collapsed projects */}
      {!activeProject && (
        <div className="pointer-events-none absolute inset-y-0 left-56 flex items-center">
          <ChevronRight className={`h-4 w-4 ${dark2 ? "text-slate-700" : "text-slate-300"}`} />
        </div>
      )}
    </div>
  );
}
