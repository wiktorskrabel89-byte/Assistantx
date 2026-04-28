import { useState } from "react";

export function WorkspaceBackupPanel({ onBackup, onRestore }: { onBackup: () => void; onRestore: (file: File) => void }) {
  const [restoreFile, setRestoreFile] = useState<File | null>(null);

  return (
    <div className="p-6 border rounded-2xl bg-slate-50 dark:bg-slate-900 mt-6">
      <h2 className="text-lg font-bold mb-2">Backup i przywracanie workspace</h2>
      <div className="flex gap-4 items-center mb-4">
        <button
          className="rounded bg-blue-600 px-4 py-2 text-white font-semibold hover:bg-blue-700"
          onClick={onBackup}
        >
          Pobierz backup
        </button>
        <input
          type="file"
          id="workspace-backup-upload"
          name="workspaceBackupUpload"
          accept="application/json"
          onChange={e => setRestoreFile(e.target.files?.[0] ?? null)}
        />
        <button
          className="rounded bg-green-600 px-4 py-2 text-white font-semibold hover:bg-green-700 disabled:opacity-50"
          disabled={!restoreFile}
          onClick={() => restoreFile && onRestore(restoreFile)}
        >
          Przywróć workspace
        </button>
      </div>
      <div className="text-xs text-slate-500">Backup obejmuje całą strukturę workspace i czaty. Plik backupu jest w formacie JSON.</div>
    </div>
  );
}
