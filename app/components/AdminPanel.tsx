import { useState } from "react";
import { WorkspaceBackupPanel } from "./WorkspaceBackupPanel";

export default function AdminPanel() {
  // Placeholder state for demonstration
  const [tab, setTab] = useState<"users"|"workspaces"|"models">("users");

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Admin Panel</h1>
      <div className="flex gap-2 mb-6">
        <button className={`px-4 py-2 rounded ${tab==="users" ? "bg-blue-600 text-white" : "bg-gray-200"}`} onClick={()=>setTab("users")}>Users</button>
        <button className={`px-4 py-2 rounded ${tab==="workspaces" ? "bg-blue-600 text-white" : "bg-gray-200"}`} onClick={()=>setTab("workspaces")}>Workspaces</button>
        <button className={`px-4 py-2 rounded ${tab==="models" ? "bg-blue-600 text-white" : "bg-gray-200"}`} onClick={()=>setTab("models")}>Models</button>
      </div>
      {tab === "users" && <div>Lista użytkowników (do wdrożenia)</div>}
      {tab === "workspaces" && (
        <>
          <div>Zarządzanie workspace (do wdrożenia)</div>
          <WorkspaceBackupPanel
            onBackup={() => {
              // Pobierz backup z localStorage (przykład, do rozbudowy o Supabase)
              const data = localStorage.getItem("workspace-state");
              const blob = new Blob([data ?? "{}"], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `workspace-backup.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            onRestore={(file) => {
              const reader = new FileReader();
              reader.onload = (e) => {
                try {
                  const json = JSON.parse(e.target?.result as string);
                  // Przykład: zapisz do localStorage (do rozbudowy o Supabase)
                  localStorage.setItem("workspace-state", JSON.stringify(json));
                  alert("Backup przywrócony! Odśwież stronę.");
                } catch {
                  alert("Nieprawidłowy plik backupu.");
                }
              };
              reader.readAsText(file);
            }}
          />
        </>
      )}
      {tab === "models" && <div>Zarządzanie modelami AI (do wdrożenia)</div>}
    </div>
  );
}
