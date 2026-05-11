// TODO: Placeholder AdminPanel. Implement real admin features.
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
      {tab === "users" && <div>User list (coming soon)</div>}
      {tab === "workspaces" && (
        <>
          <div>Workspace management</div>
          <WorkspaceBackupPanel
            onBackup={() => {
              // Download backup from localStorage (extend with Supabase sync)
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
                  // Save to localStorage (extend with Supabase sync)
                  localStorage.setItem("workspace-state", JSON.stringify(json));
                  alert("Backup restored! Please refresh the page.");
                } catch {
                  alert("Invalid backup file.");
                }
              };
              reader.readAsText(file);
            }}
          />
        </>
      )}
      {tab === "models" && <div>AI model management (coming soon)</div>}
    </div>
  );
}
