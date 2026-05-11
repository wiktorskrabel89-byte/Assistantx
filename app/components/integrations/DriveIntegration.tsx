"use client";

import { useState } from "react";
import type { OAuthProvider } from "@/lib/integrations";

type ImportedFileResponse = {
  name: string;
  mimeType: string;
  base64: string;
  prompt: string;
  sourceLabel: string;
};

function base64ToFile(base64: string, name: string, mimeType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], name, { type: mimeType });
}

function providerBadge(isConnected: boolean, dark: boolean) {
  if (isConnected) {
    return dark ? "bg-emerald-950 text-emerald-200" : "bg-emerald-100 text-emerald-800";
  }
  return dark ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-700";
}

type DriveIntegrationProps = {
  dark: boolean;
  linkedProviders: OAuthProvider[];
  authProvider: OAuthProvider | null;
  onImportFile: (file: File, prompt: string) => void;
};

export function DriveIntegration({ dark, linkedProviders, authProvider, onImportFile }: DriveIntegrationProps) {
  const [driveInput, setDriveInput] = useState("");
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveError, setDriveError] = useState("");
  const [driveMessage, setDriveMessage] = useState("");

  const isDriveConnected = linkedProviders.includes("google") || authProvider === "google";

  async function importDriveFile() {
    if (!driveInput.trim()) {
      setDriveError("Paste a Google Drive share link or file ID first.");
      return;
    }
    setDriveLoading(true);
    setDriveError("");
    setDriveMessage("");
    try {
      const response = await fetch("/api/integrations/google-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: driveInput.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Failed to import the Google Drive file.");
      }
      const imported = data as ImportedFileResponse;
      onImportFile(base64ToFile(imported.base64, imported.name, imported.mimeType), imported.prompt);
      setDriveMessage(`Imported ${imported.name} from Google Drive.`);
    } catch (error) {
      setDriveError(error instanceof Error ? error.message : "Failed to import the Google Drive file.");
    } finally {
      setDriveLoading(false);
    }
  }

  return (
    <div className={`rounded-2xl border px-3 py-3 ${dark ? "border-gray-800 bg-gray-950/60" : "border-gray-200 bg-gray-50"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Google Drive import</div>
          <p className="mt-1 text-xs leading-5 text-gray-500">Paste a Drive link or file ID to stage that file in the existing upload and analysis flow.</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${providerBadge(isDriveConnected, dark)}`}>
          {isDriveConnected ? "Drive ready" : "Link Google"}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        <input
          id="drive-input"
          name="driveInput"
          value={driveInput}
          onChange={(event) => setDriveInput(event.target.value)}
          placeholder="https://drive.google.com/file/... or file ID"
          className={`w-full rounded-xl border px-3 py-2 text-sm ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`}
        />
        <button
          onClick={() => void importDriveFile()}
          disabled={driveLoading}
          className={`w-full rounded-xl px-3 py-2 text-sm font-medium transition ${dark ? "bg-gray-800 text-gray-100 hover:bg-gray-700 disabled:opacity-50" : "bg-white text-gray-900 border border-gray-200 hover:bg-gray-100 disabled:opacity-50"}`}
        >
          {driveLoading ? "Importing..." : "Import from Drive"}
        </button>
        {driveError && <div className="text-xs text-rose-400">{driveError}</div>}
        {driveMessage && <div className="text-xs text-emerald-400">{driveMessage}</div>}
      </div>
    </div>
  );
}
