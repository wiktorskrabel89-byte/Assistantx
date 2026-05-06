"use client";

import {
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Mic,
  MicOff,
  Plus,
  Send,
  Stethoscope,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/client";
import { ALL_MODELS } from "@/lib/ai-config";

// ─── Types ───────────────────────────────────────────────────────────────────

type Language = "pl" | "en";

export type ClinicalFramework = {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  isCustom?: boolean;
};

type ChatEntry = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
const FRAMEWORKS_STORAGE_KEY = "clinical_frameworks";

export const BUILT_IN_FRAMEWORKS: ClinicalFramework[] = [
  {
    id: "dsm5",
    name: "DSM-5 (APA)",
    description: "Diagnostic and Statistical Manual of Mental Disorders, 5th Edition",
    systemPrompt:
      "Apply DSM-5 (Diagnostic and Statistical Manual of Mental Disorders, Fifth Edition, American Psychiatric Association) diagnostic criteria when reasoning about symptoms, conditions, and diagnoses. Reference relevant DSM-5 categories, specifiers, and severity ratings where appropriate.",
  },
  {
    id: "icd11",
    name: "ICD-11 (WHO)",
    description: "International Classification of Diseases, 11th Revision",
    systemPrompt:
      "Apply ICD-11 (International Classification of Diseases, 11th Revision, World Health Organization) diagnostic criteria and classification codes when discussing symptoms, conditions, and diagnoses. Reference relevant ICD-11 chapter codes and qualifiers where appropriate.",
  },
];

// ─── Bilingual labels ─────────────────────────────────────────────────────────

export const CLINICAL_LABELS = {
  pl: {
    title: "Asystent Kliniczny",
    subtitle: "Prywatna przestrzeń dla indywidualnego praktyka",
    langLabel: "Język",
    frameworkLabel: "Schemat diagnostyczny",
    modelLabel: "Model AI",
    noFramework: "Bez schematu",
    customFrameworks: "Własne schematy",
    addFramework: "Dodaj schemat",
    editFramework: "Edytuj",
    deleteFramework: "Usuń",
    frameworkName: "Nazwa schematu",
    frameworkDesc: "Opis (opcjonalnie)",
    frameworkPrompt: "Instrukcja systemowa",
    save: "Zapisz",
    cancel: "Anuluj",
    placeholder: "Opisz objawy lub zadaj pytanie kliniczne...",
    send: "Wyślij",
    voiceStart: "Nagrywaj glos",
    voiceStop: "Zatrzymaj nagrywanie",
    voiceUnsupported: "Rozpoznawanie mowy niedostępne w tej przeglądarce.",
    sessionSummary: "Podsumowanie SOAP",
    exportTxt: "Eksportuj .txt",
    clearSession: "Wyczyść sesję",
    you: "Ty",
    assistant: "Asystent",
    generating: "Generowanie...",
    selectModel: "Wybierz model",
    defaultModel: "Domyślny (Llama 3.3 70B - darmowy)",
    allModels: "Wszystkie modele (OpenRouter)",
    sessionEmpty: "Brak wiadomosci do eksportu.",
    soapPrompt:
      "Wygeneruj podsumowanie sesji klinicznej w formacie SOAP (Subjective, Objective, Assessment, Plan) na podstawie powyższej rozmowy. Używaj języka polskiego.",
    soapPromptEn:
      "Generate a SOAP clinical session summary (Subjective, Objective, Assessment, Plan) based on the conversation above.",
  },
  en: {
    title: "Clinical Assistant",
    subtitle: "Private workspace for the individual practitioner",
    langLabel: "Language",
    frameworkLabel: "Diagnostic framework",
    modelLabel: "AI Model",
    noFramework: "No framework",
    customFrameworks: "Custom frameworks",
    addFramework: "Add framework",
    editFramework: "Edit",
    deleteFramework: "Delete",
    frameworkName: "Framework name",
    frameworkDesc: "Description (optional)",
    frameworkPrompt: "System instruction",
    save: "Save",
    cancel: "Cancel",
    placeholder: "Describe symptoms or ask a clinical question...",
    send: "Send",
    voiceStart: "Start voice input",
    voiceStop: "Stop voice input",
    voiceUnsupported: "Speech recognition is not available in this browser.",
    sessionSummary: "SOAP Summary",
    exportTxt: "Export .txt",
    clearSession: "Clear session",
    you: "You",
    assistant: "Assistant",
    generating: "Generating...",
    selectModel: "Select model",
    defaultModel: "Default (Llama 3.3 70B - free)",
    allModels: "All models (OpenRouter)",
    sessionEmpty: "No messages to export.",
    soapPrompt:
      "Generate a SOAP clinical session summary (Subjective, Objective, Assessment, Plan) based on the conversation above.",
    soapPromptEn:
      "Generate a SOAP clinical session summary (Subjective, Objective, Assessment, Plan) based on the conversation above.",
  },
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function buildClinicalSystemPrompt(
  framework: ClinicalFramework | null,
  language: Language,
): string {
  const langInstruction =
    language === "pl"
      ? "Odpowiadaj po polsku."
      : "Respond in English.";
  const frameworkInstruction = framework
    ? framework.systemPrompt
    : "No specific diagnostic framework is active.";
  return `You are a private clinical AI assistant for an individual mental health practitioner. ${langInstruction} ${frameworkInstruction} Always note that AI assistance does not replace professional clinical judgment. Keep responses structured and evidence-based.`;
}

function loadCustomFrameworks(): ClinicalFramework[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FRAMEWORKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCustomFrameworks(frameworks: ClinicalFramework[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(FRAMEWORKS_STORAGE_KEY, JSON.stringify(frameworks));
}

function generateId(): string {
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── FrameworkEditor sub-component ───────────────────────────────────────────

type FrameworkEditorProps = {
  labels: (typeof CLINICAL_LABELS)[keyof typeof CLINICAL_LABELS];
  initial?: ClinicalFramework;
  onSave: (f: Omit<ClinicalFramework, "id" | "isCustom">) => void;
  onCancel: () => void;
};

function FrameworkEditor({ labels, initial, onSave, onCancel }: FrameworkEditorProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [desc, setDesc] = useState(initial?.description ?? "");
  const [prompt, setPrompt] = useState(initial?.systemPrompt ?? "");

  const inputBase =
    "w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100";

  return (
    <div className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-600">{labels.frameworkName}</label>
        <input id="clinical-framework-name" name="clinicalFrameworkName" className={inputBase} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-600">{labels.frameworkDesc}</label>
        <input id="clinical-framework-desc" name="clinicalFrameworkDesc" className={inputBase} value={desc} onChange={(e) => setDesc(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-600">{labels.frameworkPrompt}</label>
        <textarea
          id="clinical-framework-prompt"
          name="clinicalFrameworkPrompt"
          className={`${inputBase} min-h-[80px] resize-y`}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!name.trim() || !prompt.trim()}
          onClick={() => onSave({ name: name.trim(), description: desc.trim(), systemPrompt: prompt.trim() })}
          className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {labels.save}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          {labels.cancel}
        </button>
      </div>
    </div>
  );
}

// ─── Main ClinicalTab component ───────────────────────────────────────────────

export function ClinicalTab() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [language, setLanguage] = useState<Language>("en");
  const [customFrameworks, setCustomFrameworks] = useState<ClinicalFramework[]>(
    () => loadCustomFrameworks(),
  );
  const [selectedFrameworkId, setSelectedFrameworkId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string>(DEFAULT_MODEL);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [showFrameworkEditor, setShowFrameworkEditor] = useState(false);
  const [editingFramework, setEditingFramework] = useState<ClinicalFramework | null>(null);
  const [showModels, setShowModels] = useState(false);
  const [modelSearch, setModelSearch] = useState("");

  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const L = CLINICAL_LABELS[language];

  const allFrameworks: ClinicalFramework[] = [...BUILT_IN_FRAMEWORKS, ...customFrameworks];
  const selectedFramework = allFrameworks.find((f) => f.id === selectedFrameworkId) ?? null;

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const persistCustomFrameworks = useCallback((frameworks: ClinicalFramework[]) => {
    setCustomFrameworks(frameworks);
    saveCustomFrameworks(frameworks);
  }, []);

  const handleAddFramework = useCallback(
    (data: Omit<ClinicalFramework, "id" | "isCustom">) => {
      const newF: ClinicalFramework = { ...data, id: generateId(), isCustom: true };
      const updated = [...customFrameworks, newF];
      persistCustomFrameworks(updated);
      setSelectedFrameworkId(newF.id);
      setShowFrameworkEditor(false);
      setEditingFramework(null);
    },
    [customFrameworks, persistCustomFrameworks],
  );

  const handleUpdateFramework = useCallback(
    (data: Omit<ClinicalFramework, "id" | "isCustom">) => {
      if (!editingFramework) return;
      const updated = customFrameworks.map((f) =>
        f.id === editingFramework.id ? { ...f, ...data } : f,
      );
      persistCustomFrameworks(updated);
      setEditingFramework(null);
      setShowFrameworkEditor(false);
    },
    [customFrameworks, editingFramework, persistCustomFrameworks],
  );

  const handleDeleteFramework = useCallback(
    (id: string) => {
      const updated = customFrameworks.filter((f) => f.id !== id);
      persistCustomFrameworks(updated);
      if (selectedFrameworkId === id) setSelectedFrameworkId(null);
    },
    [customFrameworks, persistCustomFrameworks, selectedFrameworkId],
  );

  // ── Voice input ────────────────────────────────────────────────────────────

  const startVoice = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setVoiceError(L.voiceUnsupported);
      return;
    }
    setVoiceError("");
    const recognition = new SR();
    recognition.lang = language === "pl" ? "pl-PL" : "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => {
      const transcript = event.results[0][0].transcript;
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      setVoiceActive(false);
    };
    recognition.onerror = () => setVoiceActive(false);
    recognition.onend = () => setVoiceActive(false);
    recognitionRef.current = recognition;
    recognition.start();
    setVoiceActive(true);
  }, [L.voiceUnsupported, language]);

  const stopVoice = useCallback(() => {
    recognitionRef.current?.stop();
    setVoiceActive(false);
  }, []);

  // ── Chat ───────────────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (overrideMessage?: string) => {
      const text = (overrideMessage ?? input).trim();
      if (!text || loading) return;

      const userEntry: ChatEntry = {
        id: `u-${Date.now()}`,
        role: "user",
        content: text,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userEntry]);
      setInput("");
      setLoading(true);

      const assistantEntry: ChatEntry = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantEntry]);

      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;

      const history = messages
        .reduce<Array<{ user: string; ai: string }>>((acc, msg, idx, arr) => {
          if (msg.role === "user" && arr[idx + 1]?.role === "assistant") {
            acc.push({ user: msg.content, ai: arr[idx + 1].content });
          }
          return acc;
        }, [])
        .slice(-10);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            message: text,
            mode: "chat",
            modelId: selectedModelId,
            history,
            assistantName: "Clinical AI",
            assistantInstructions: buildClinicalSystemPrompt(selectedFramework, language),
            style: "detailed",
            languageLock: language,
            userPlan: "free",
          }),
        });

        if (!res.body) throw new Error("No response body");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let aiText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.token) {
                aiText += parsed.token;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantEntry.id ? { ...m, content: aiText } : m,
                  ),
                );
              }
            } catch {
              // skip malformed chunks
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const errMsg = err instanceof Error ? err.message : "Request failed.";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantEntry.id ? { ...m, content: `Error: ${errMsg}` } : m,
          ),
        );
      } finally {
        setLoading(false);
      }
    },
    [input, loading, messages, selectedFramework, selectedModelId, language],
  );

  // ── Session actions ────────────────────────────────────────────────────────

  const generateSOAP = useCallback(() => {
    if (messages.length === 0 || loading) return;
    const soapPrompt = language === "pl" ? L.soapPrompt : L.soapPromptEn;
    sendMessage(soapPrompt);
  }, [messages.length, loading, language, L.soapPrompt, L.soapPromptEn, sendMessage]);

  const exportTxt = useCallback(() => {
    if (messages.length === 0) return;
    const lines: string[] = [
      `=== ${L.title} — ${new Date().toLocaleString()} ===`,
      selectedFramework ? `Framework: ${selectedFramework.name}` : "",
      `Model: ${selectedModelId}`,
      "",
      ...messages.map(
        (m) =>
          `[${m.role === "user" ? L.you : L.assistant}] ${new Date(m.timestamp).toLocaleTimeString()}\n${m.content}`,
      ),
    ];
    const blob = new Blob([lines.join("\n\n")], { type: "text/plain; charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clinical-session-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [messages, selectedFramework, selectedModelId, L]);

  const clearSession = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setInput("");
    setLoading(false);
  }, []);

  // ── Filtered models ────────────────────────────────────────────────────────

  const filteredModels = modelSearch.trim()
    ? ALL_MODELS.filter((m) => m.id.toLowerCase().includes(modelSearch.toLowerCase()))
    : ALL_MODELS;

  // ── Render helpers ─────────────────────────────────────────────────────────

  const inputBase =
    "w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100";
  const sectionLabel = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.14),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.12),transparent_36%),linear-gradient(140deg,#f8fafc,#e2e8f0_48%,#dbeafe)]">
      {/* Header */}
      <div className="border-b border-sky-200/60 bg-white/80 px-6 py-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-600 to-cyan-500 shadow-sm">
            <Stethoscope className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-900">{L.title}</h1>
            <p className="text-xs text-slate-500">{L.subtitle}</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* ── Left panel: settings ── */}
        <aside className="hidden w-72 flex-shrink-0 overflow-y-auto border-r border-sky-200/60 bg-white/70 px-4 py-5 xl:flex xl:flex-col xl:gap-5">
          {/* Language selector */}
          <div>
            <label htmlFor="clinical-lang" className={sectionLabel}>
              {L.langLabel}
            </label>
            <select
              id="clinical-lang"
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              className={inputBase}
            >
              <option value="en">English</option>
              <option value="pl">Polski</option>
            </select>
          </div>

          {/* Diagnostic framework selector */}
          <div>
            <label htmlFor="clinical-framework" className={sectionLabel}>
              {L.frameworkLabel}
            </label>
            <select
              id="clinical-framework"
              value={selectedFrameworkId ?? ""}
              onChange={(e) => setSelectedFrameworkId(e.target.value || null)}
              className={inputBase}
            >
              <option value="">{L.noFramework}</option>
              {BUILT_IN_FRAMEWORKS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
              {customFrameworks.length > 0 && (
                <optgroup label={L.customFrameworks}>
                  {customFrameworks.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {selectedFramework && (
              <p className="mt-1 text-[11px] leading-snug text-slate-500">
                {selectedFramework.description}
              </p>
            )}
          </div>

          {/* Custom frameworks management */}
          <div>
            <p className={sectionLabel}>{L.customFrameworks}</p>
            <div className="space-y-2">
              {customFrameworks.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between rounded-xl border border-sky-100 bg-white px-3 py-2 text-sm"
                >
                  <span className="truncate font-medium text-slate-700">{f.name}</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      aria-label={L.editFramework}
                      onClick={() => {
                        setEditingFramework(f);
                        setShowFrameworkEditor(true);
                      }}
                      className="rounded-lg p-1 text-slate-400 hover:bg-sky-50 hover:text-sky-600"
                    >
                      <FileText className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={L.deleteFramework}
                      onClick={() => handleDeleteFramework(f.id)}
                      className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {showFrameworkEditor ? (
              <div className="mt-3">
                <FrameworkEditor
                  labels={L}
                  initial={editingFramework ?? undefined}
                  onSave={editingFramework ? handleUpdateFramework : handleAddFramework}
                  onCancel={() => {
                    setShowFrameworkEditor(false);
                    setEditingFramework(null);
                  }}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditingFramework(null);
                  setShowFrameworkEditor(true);
                }}
                className="mt-2 flex w-full items-center gap-2 rounded-xl border border-dashed border-sky-300 px-3 py-2 text-sm font-medium text-sky-600 hover:bg-sky-50"
              >
                <Plus className="h-3.5 w-3.5" />
                {L.addFramework}
              </button>
            )}
          </div>

          {/* Model selector */}
          <div>
            <p className={sectionLabel}>{L.modelLabel}</p>
            <button
              type="button"
              onClick={() => setShowModels((v) => !v)}
              className="mb-2 flex w-full items-center justify-between rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-sky-50"
            >
              <span className="truncate">{selectedModelId}</span>
              {showModels ? (
                <ChevronUp className="h-4 w-4 flex-shrink-0 text-slate-400" />
              ) : (
                <ChevronDown className="h-4 w-4 flex-shrink-0 text-slate-400" />
              )}
            </button>
            {showModels && (
              <div className="space-y-1">
                <input
                  id="clinical-model-search"
                  name="clinicalModelSearch"
                  className={inputBase}
                  placeholder="Search models..."
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                />
                <div className="max-h-48 overflow-y-auto rounded-xl border border-sky-100 bg-white">
                  {/* Default free model */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedModelId(DEFAULT_MODEL);
                      setShowModels(false);
                    }}
                    className={`block w-full px-3 py-2 text-left text-xs hover:bg-sky-50 ${selectedModelId === DEFAULT_MODEL ? "bg-sky-50 font-semibold text-sky-700" : "text-slate-700"}`}
                  >
                    {L.defaultModel}
                  </button>
                  {filteredModels.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setSelectedModelId(m.id);
                        setShowModels(false);
                        setModelSearch("");
                      }}
                      className={`block w-full truncate px-3 py-2 text-left text-xs hover:bg-sky-50 ${selectedModelId === m.id ? "bg-sky-50 font-semibold text-sky-700" : "text-slate-700"}`}
                    >
                      {m.id}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Session actions */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={generateSOAP}
              disabled={messages.length === 0 || loading}
              className="flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
            >
              <FileText className="h-4 w-4" />
              {L.sessionSummary}
            </button>
            <button
              type="button"
              onClick={exportTxt}
              disabled={messages.length === 0}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {L.exportTxt}
            </button>
            <button
              type="button"
              onClick={clearSession}
              disabled={messages.length === 0}
              className="flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-500 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {L.clearSession}
            </button>
          </div>
        </aside>

        {/* ── Right panel: chat ── */}
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <Stethoscope className="h-10 w-10 text-sky-300" />
                <p className="text-sm text-slate-400">{L.subtitle}</p>
                {selectedFramework && (
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                    {selectedFramework.name}
                  </span>
                )}
              </div>
            )}

            <div className="mx-auto max-w-3xl space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-sky-600 text-white"
                        : "border border-sky-100 bg-white text-slate-800 shadow-sm"
                    }`}
                  >
                    <div className="mb-1 text-[10px] font-semibold opacity-60">
                      {msg.role === "user" ? L.you : L.assistant}
                    </div>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl border border-sky-100 bg-white px-4 py-3 text-sm text-slate-400 shadow-sm">
                    <span className="animate-pulse">{L.generating}</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Mobile: framework badge */}
          {selectedFramework && (
            <div className="border-t border-sky-100 bg-white/80 px-4 py-1.5 xl:hidden">
              <span className="text-xs text-slate-500">
                {L.frameworkLabel}: <strong>{selectedFramework.name}</strong>
              </span>
            </div>
          )}

          {/* Composer */}
          <div className="border-t border-sky-200/60 bg-white/90 px-4 py-3 backdrop-blur">
            {voiceError && (
              <p className="mb-2 text-xs text-red-500">
                <X className="mr-1 inline h-3 w-3" />
                {voiceError}
              </p>
            )}
            <div className="mx-auto flex max-w-3xl items-end gap-2">
              <textarea
                id="clinical-chat-input"
                name="clinicalChatInput"
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={L.placeholder}
                className="flex-1 resize-none rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
              />
              {/* Voice button */}
              <button
                type="button"
                aria-label={voiceActive ? L.voiceStop : L.voiceStart}
                onClick={voiceActive ? stopVoice : startVoice}
                className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border transition-colors ${
                  voiceActive
                    ? "border-red-300 bg-red-50 text-red-500 hover:bg-red-100"
                    : "border-sky-200 bg-white text-slate-500 hover:bg-sky-50 hover:text-sky-600"
                }`}
              >
                {voiceActive ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
              {/* Send button */}
              <button
                type="button"
                aria-label={L.send}
                disabled={!input.trim() || loading}
                onClick={() => sendMessage()}
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
