"use client";

import { Database, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type KnowledgeFile = {
  id: string;
  file_name: string;
  mime_type: string | null;
  file_size: number;
  status: "processing" | "ready" | "error";
  chunk_count: number;
  created_at: string;
  updated_at: string;
};

export function KnowledgeTab({ dark }: { dark: boolean }) {
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/knowledge/files");
      const payload = await response.json() as { files?: KnowledgeFile[] };
      setFiles(Array.isArray(payload.files) ? payload.files : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const removeFile = useCallback(async (id: string) => {
    setBusyId(id);
    try {
      await fetch(`/api/knowledge/files?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await load();
    } finally {
      setBusyId(null);
    }
  }, [load]);

  const reindexFile = useCallback(async (id: string) => {
    setBusyId(id);
    try {
      await fetch("/api/knowledge/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: id }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }, [load]);

  const card = dark ? "border-slate-800 bg-slate-900 text-slate-100" : "border-slate-200 bg-white text-slate-900";

  return (
    <main className={`flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-[26px] border ${card}`}>
      <div className={`border-b px-5 py-4 ${dark ? "border-slate-800" : "border-slate-200"}`}>
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-cyan-500" />
          <h2 className="text-lg font-semibold">Knowledge Memory</h2>
        </div>
        <p className={`mt-1 text-sm ${dark ? "text-slate-400" : "text-slate-600"}`}>
          Files indexed into persistent vector memory.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? <div className="text-sm opacity-70">Loading knowledge files...</div> : null}
        {!loading && files.length === 0 ? (
          <div className={`rounded-xl border p-4 text-sm ${dark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-600"}`}>
            No indexed files yet. Upload a document in chat file mode to teach the assistant.
          </div>
        ) : null}
        <div className="space-y-3">
          {files.map((file) => (
            <div key={file.id} className={`rounded-xl border p-4 ${dark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50"}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{file.file_name}</div>
                  <div className={`mt-1 text-xs ${dark ? "text-slate-400" : "text-slate-600"}`}>
                    {(file.file_size / 1024).toFixed(1)} KB • {file.chunk_count} chunks • {file.status}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void reindexFile(file.id)}
                    disabled={busyId === file.id}
                    title="Reindex file"
                    aria-label="Reindex file"
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs ${dark ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-white"}`}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Reindex
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeFile(file.id)}
                    disabled={busyId === file.id}
                    title="Delete file"
                    aria-label="Delete file"
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs ${dark ? "border-red-900 bg-red-950/30 text-red-300" : "border-red-300 bg-red-50 text-red-700"}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
