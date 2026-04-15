import { createClient } from "@/lib/server";
import { getProviderTokenCookieName } from "@/lib/integrations";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const maxDuration = 30;

type GmailMessage = {
  id: string;
  threadId: string;
};

type GmailMessageDetail = {
  id: string;
  threadId: string;
  snippet: string;
  internalDate: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
};

type GmailListResponse = {
  messages?: GmailMessage[];
  resultSizeEstimate?: number;
};

export type GmailMessageSummary = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
};

async function getGmailContext() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;

  const cookieStore = await cookies();
  return {
    user: data.user,
    token: cookieStore.get(getProviderTokenCookieName("google"))?.value ?? null,
  };
}

async function gmailFetch(url: string, token: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Gmail access was denied. Reconnect Google and grant Gmail access.");
    }
    throw new Error(`Gmail request failed (${response.status}).`);
  }

  return response;
}

function getHeader(headers: Array<{ name: string; value: string }> | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export async function GET(request: Request) {
  try {
    const { user, token } = await getGmailContext();
    if (!user) {
      return Response.json({ error: "Sign in before accessing Gmail." }, { status: 401 });
    }
    if (!token) {
      return Response.json({ error: "Reconnect Google and grant Gmail access first." }, { status: 401 });
    }

    const url = new URL(request.url);
    const maxResults = Math.min(Number(url.searchParams.get("maxResults")) || 10, 20);

    const listResponse = await gmailFetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&labelIds=INBOX`,
      token
    );
    const listData = (await listResponse.json()) as GmailListResponse;

    if (!listData.messages || listData.messages.length === 0) {
      return Response.json({ messages: [], total: 0 });
    }

    const summaries: GmailMessageSummary[] = await Promise.all(
      listData.messages.slice(0, maxResults).map(async (msg) => {
        const detailResponse = await gmailFetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          token
        );
        const detail = (await detailResponse.json()) as GmailMessageDetail;

        return {
          id: detail.id,
          threadId: detail.threadId,
          subject: getHeader(detail.payload?.headers, "Subject") || "(no subject)",
          from: getHeader(detail.payload?.headers, "From"),
          snippet: detail.snippet,
          date: detail.internalDate
            ? new Date(Number(detail.internalDate)).toISOString()
            : "",
        };
      })
    );

    return Response.json({
      messages: summaries,
      total: listData.resultSizeEstimate ?? summaries.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch Gmail messages.";
    return Response.json({ error: message }, { status: 500 });
  }
}
