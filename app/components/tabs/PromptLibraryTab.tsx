"use client";

import { Edit2, FileUp, LibraryBig, Plus, Save, Trash2, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type PromptTemplate = {
  id: string;
  name: string;
  content: string;
  createdAt: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PromptLibraryTab({ dark }: { dark: boolean }) {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File upload → extract template ───────────────────────────────────────

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text !== "string") return;
      setIsCreating(true);
      setNewName(file.name.replace(/\.[^.]+$/, ""));
      setNewContent(text);
    };
    reader.readAsText(file, "utf-8");
    // Reset so the same file can be re-uploaded
    e.target.value = "";
  }, []);

  // ── Save new template ────────────────────────────────────────────────────

  const saveNew = useCallback(() => {
    if (!newContent.trim()) return;
    setTemplates((prev) => [
      ...prev,
      {
        id: uid(),
        name: newName.trim() || "Szablon bez nazwy",
        content: newContent,
        createdAt: Date.now(),
      },
    ]);
    setIsCreating(false);
    setNewName("");
    setNewContent("");
  }, [newName, newContent]);

  // ── Start editing an existing template ──────────────────────────────────

  const startEdit = useCallback((t: PromptTemplate) => {
    setEditingId(t.id);
    setEditName(t.name);
    setEditContent(t.content);
  }, []);

  // ── Save edits ───────────────────────────────────────────────────────────

  const saveEdit = useCallback(() => {
    if (!editingId) return;
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === editingId
          ? { ...t, name: editName.trim() || t.name, content: editContent }
          : t,
      ),
    );
    setEditingId(null);
  }, [editingId, editName, editContent]);

  // ── Delete ───────────────────────────────────────────────────────────────

  const deleteTemplate = useCallback(
    (id: string) => {
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      if (editingId === id) setEditingId(null);
    },
    [editingId],
  );

  // ─── Styles ───────────────────────────────────────────────────────────────

  const bg = dark
    ? "bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.18),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.14),transparent_36%),linear-gradient(135deg,#020617,#0f172a_46%,#082f49)]"
    : "bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.16),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.14),transparent_36%),linear-gradient(140deg,#f8fafc,#e2e8f0_48%,#dbeafe)]";

  const cardInput = dark
    ? "border border-sky-800/60 bg-slate-900/60 text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:ring-sky-900/40"
    : "border border-sky-200 bg-white text-slate-800 placeholder:text-slate-400 focus:border-sky-400 focus:ring-sky-100";

  const btnPrimary =
    "rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 transition-colors";
  const btnGhost = dark
    ? "rounded-xl border border-sky-800/50 px-3 py-1.5 text-sm text-slate-300 hover:bg-sky-900/40 transition-colors"
    : "rounded-xl border border-sky-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-sky-50 transition-colors";
  const btnDanger =
    "rounded-xl border border-red-300/60 px-3 py-1.5 text-sm text-red-400 hover:bg-red-50/20 transition-colors";

  const labelClass = `mb-1 block text-xs font-medium ${dark ? "text-slate-300" : "text-slate-600"}`;
  const headingClass = `text-sm font-semibold ${dark ? "text-slate-200" : "text-slate-700"}`;
  const closeBtn = dark
    ? "text-slate-400 hover:text-slate-200"
    : "text-slate-400 hover:text-slate-600";

  return (
    <section className={`flex h-full min-h-0 flex-col overflow-hidden animate-tab-enter ${bg}`}>
      {/* Header */}
      <div
        className={`flex items-center justify-between border-b px-6 py-4 backdrop-blur ${
          dark ? "border-sky-900/50 bg-sky-950/40" : "border-sky-200/60 bg-white/70"
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl border shadow ${
              dark
                ? "border-sky-800/70 bg-sky-950/60 text-sky-300"
                : "border-sky-200 bg-white text-sky-600"
            }`}
          >
            <LibraryBig className="h-5 w-5" />
          </div>
          <div>
            <h1 className={`text-base font-semibold ${dark ? "text-slate-100" : "text-slate-900"}`}>
              Prompt Library
            </h1>
            <p className={`text-xs ${dark ? "text-slate-400" : "text-slate-500"}`}>
              Przeglądaj i zarządzaj szablonami promptów.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.markdown,.prompt,.text"
            className="hidden"
            onChange={handleFileUpload}
            aria-label="Wgraj plik szablonu"
          />
          {/* Upload button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={btnGhost}
            title="Wgraj szablon z pliku"
          >
            <FileUp className="mr-1.5 inline h-4 w-4" />
            Wgraj plik
          </button>
          {/* New blank template */}
          <button
            type="button"
            onClick={() => {
              setIsCreating(true);
              setNewName("");
              setNewContent("");
            }}
            className={btnPrimary}
          >
            <Plus className="mr-1 inline h-4 w-4" />
            Nowy szablon
          </button>
        </div>
      </div>

      {/* Body: sidebar + editor */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Template list */}
        <div
          className={`flex w-72 flex-shrink-0 flex-col overflow-y-auto border-r ${
            dark ? "border-sky-900/50" : "border-sky-200/60"
          }`}
        >
          {templates.length === 0 && !isCreating && (
            <div
              className={`flex flex-col items-center justify-center gap-3 px-6 py-16 text-center ${
                dark ? "text-slate-400" : "text-slate-500"
              }`}
            >
              <FileUp className="h-8 w-8 opacity-40" />
              <p className="text-sm">
                Wgraj plik lub utwórz nowy szablon, aby zacząć.
              </p>
            </div>
          )}
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => startEdit(t)}
              className={`group flex items-start gap-2 border-b px-4 py-3 text-left transition-colors ${
                dark ? "border-sky-900/40 hover:bg-sky-900/30" : "border-sky-100 hover:bg-sky-50"
              } ${editingId === t.id ? (dark ? "bg-sky-900/40" : "bg-sky-50") : ""}`}
            >
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-sm font-medium ${
                    dark ? "text-slate-200" : "text-slate-800"
                  }`}
                >
                  {t.name}
                </p>
                <p
                  className={`mt-0.5 line-clamp-2 text-xs ${
                    dark ? "text-slate-400" : "text-slate-500"
                  }`}
                >
                  {t.content}
                </p>
              </div>
              <span
                role="button"
                aria-label="Usuń szablon"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  deleteTemplate(t.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    deleteTemplate(t.id);
                  }
                }}
                className={`mt-0.5 flex-shrink-0 cursor-pointer opacity-0 transition-opacity group-hover:opacity-100 ${
                  dark ? "text-red-400 hover:text-red-300" : "text-red-400 hover:text-red-600"
                }`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </span>
            </button>
          ))}
        </div>

        {/* Editor pane */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* ── Create new ── */}
          {isCreating && (
            <div className="flex flex-col gap-4 overflow-y-auto p-6">
              <div className="flex items-center justify-between">
                <h2 className={headingClass}>Nowy szablon</h2>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className={closeBtn}
                  aria-label="Zamknij"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div>
                <label className={labelClass}>Nazwa szablonu</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="np. Analiza kodu"
                  className={`w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 ${cardInput}`}
                />
              </div>
              <div className="flex flex-1 flex-col">
                <label className={labelClass}>Treść szablonu</label>
                <textarea
                  rows={14}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Wpisz treść szablonu lub wgraj plik..."
                  className={`w-full resize-none rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 ${cardInput}`}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setIsCreating(false)} className={btnGhost}>
                  Anuluj
                </button>
                <button
                  type="button"
                  onClick={saveNew}
                  disabled={!newContent.trim()}
                  className={btnPrimary}
                >
                  <Save className="mr-1 inline h-4 w-4" />
                  Zapisz
                </button>
              </div>
            </div>
          )}

          {/* ── Edit existing ── */}
          {!isCreating && editingId && (
            <div className="flex flex-col gap-4 overflow-y-auto p-6">
              <div className="flex items-center justify-between">
                <h2 className={`flex items-center gap-1.5 ${headingClass}`}>
                  <Edit2 className="h-3.5 w-3.5" /> Edytuj szablon
                </h2>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className={closeBtn}
                  aria-label="Zamknij"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div>
                <label className={labelClass}>Nazwa szablonu</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className={`w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 ${cardInput}`}
                />
              </div>
              <div className="flex flex-1 flex-col">
                <label className={labelClass}>Treść szablonu</label>
                <textarea
                  rows={14}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className={`w-full resize-none rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 ${cardInput}`}
                />
              </div>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    deleteTemplate(editingId);
                    setEditingId(null);
                  }}
                  className={btnDanger}
                >
                  <Trash2 className="mr-1 inline h-3.5 w-3.5" />
                  Usuń
                </button>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditingId(null)} className={btnGhost}>
                    Anuluj
                  </button>
                  <button type="button" onClick={saveEdit} className={btnPrimary}>
                    <Save className="mr-1 inline h-4 w-4" />
                    Zapisz zmiany
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Empty state ── */}
          {!isCreating && !editingId && (
            <div
              className={`flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center ${
                dark ? "text-slate-400" : "text-slate-500"
              }`}
            >
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-2xl border shadow-lg ${
                  dark
                    ? "border-sky-900/70 bg-sky-950/55 text-sky-300"
                    : "border-sky-200/80 bg-white/85 text-sky-600"
                }`}
              >
                <LibraryBig className="h-7 w-7" />
              </div>
              <div>
                <p
                  className={`text-base font-semibold ${
                    dark ? "text-slate-200" : "text-slate-700"
                  }`}
                >
                  Wybierz szablon do edycji
                </p>
                <p className="mt-1 text-sm">
                  Możesz też wgrać plik — jego treść zostanie załadowana jako nowy szablon, który
                  możesz edytować.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
