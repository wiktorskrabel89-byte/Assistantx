import { createClient } from "@/lib/server";
import {
  ensureExtension,
  getProviderTokenCookieName,
  GOOGLE_DRIVE_EXPORTS,
  inferMimeType,
  isLikelyImportableMime,
  parseGoogleDriveFileId,
} from "@/lib/integrations";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const maxDuration = 60;

type GoogleApiError = {
  error?: {
    message?: string;
  };
};

async function googleFetch(url: string, token: string) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}) as GoogleApiError);
    const suffix = data.error?.message ? ` ${data.error.message}` : "";

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Google Drive access was denied. Reconnect Google and grant Drive access.${suffix}`);
    }

    if (response.status === 404) {
      throw new Error(`Google Drive file not found or not shared with this account.${suffix}`);
    }

    throw new Error(`Google Drive request failed (${response.status}).${suffix}`);
  }

  return response;
}

async function getDriveContext() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;

  const cookieStore = await cookies();
  return {
    user: data.user,
    token: cookieStore.get(getProviderTokenCookieName("google"))?.value ?? null,
  };
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { input?: string };
    const fileId = parseGoogleDriveFileId(payload.input ?? "");

    if (!fileId) {
      return Response.json({ error: "Paste a valid Google Drive share link or file ID." }, { status: 400 });
    }

    const { user, token } = await getDriveContext();
    if (!user) {
      return Response.json({ error: "Sign in before importing from Google Drive." }, { status: 401 });
    }
    if (!token) {
      return Response.json({ error: "Reconnect Google and grant Drive access first." }, { status: 401 });
    }

    const metadataResponse = await googleFetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size,webViewLink&supportsAllDrives=true`,
      token
    );
    const metadata = await metadataResponse.json() as {
      name?: string;
      mimeType?: string;
      size?: string;
      webViewLink?: string;
    };

    let mimeType = metadata.mimeType ?? "application/octet-stream";
    let name = metadata.name ?? `drive-${fileId}`;
    let downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;

    const exportConfig = GOOGLE_DRIVE_EXPORTS[mimeType];
    if (exportConfig) {
      mimeType = exportConfig.mimeType;
      name = ensureExtension(name, exportConfig.extension);
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportConfig.mimeType)}`;
    }

    if (!isLikelyImportableMime(mimeType, name)) {
      return Response.json({ error: "This Google Drive file type is not supported yet. Use text, code, PDF, or image files." }, { status: 400 });
    }

    const downloadResponse = await googleFetch(downloadUrl, token);
    const bytes = Buffer.from(await downloadResponse.arrayBuffer());

    if (bytes.byteLength > 4_000_000) {
      return Response.json({ error: "This Google Drive file is too large to import into the chat." }, { status: 413 });
    }

    return Response.json({
      name,
      mimeType: inferMimeType(name, mimeType),
      base64: bytes.toString("base64"),
      prompt: `Read and help me work with this Google Drive file: ${name}`,
      sourceLabel: metadata.webViewLink ?? `drive:${fileId}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import the Google Drive file.";
    return Response.json({ error: message }, { status: 500 });
  }
}