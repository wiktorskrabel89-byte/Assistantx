import { createClient } from "@/lib/server";
import { getProviderTokenCookieName } from "@/lib/integrations";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const maxDuration = 30;

type CalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  htmlLink?: string;
  location?: string;
  status?: string;
};

type CalendarListResponse = {
  items?: CalendarEvent[];
};

export type CalendarEventSummary = {
  id: string;
  title: string;
  description: string;
  start: string;
  end: string;
  location: string;
  htmlLink: string;
  allDay: boolean;
};

async function getCalendarContext() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;

  const cookieStore = await cookies();
  return {
    user: data.user,
    token: cookieStore.get(getProviderTokenCookieName("google"))?.value ?? null,
  };
}

async function calendarFetch(url: string, token: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Google Calendar access was denied. Reconnect Google and grant Calendar access.");
    }
    throw new Error(`Google Calendar request failed (${response.status}).`);
  }

  return response;
}

export async function GET(request: Request) {
  try {
    const { user, token } = await getCalendarContext();
    if (!user) {
      return Response.json({ error: "Sign in before accessing Google Calendar." }, { status: 401 });
    }
    if (!token) {
      return Response.json({ error: "Reconnect Google and grant Calendar access first." }, { status: 401 });
    }

    const url = new URL(request.url);
    const maxResults = Math.min(Number(url.searchParams.get("maxResults")) || 10, 50);
    const now = new Date().toISOString();
    const daysAhead = Math.min(Number(url.searchParams.get("daysAhead")) || 7, 30);
    const timeMax = new Date(Date.now() + daysAhead * 86_400_000).toISOString();

    const params = new URLSearchParams({
      timeMin: now,
      timeMax,
      maxResults: String(maxResults),
      singleEvents: "true",
      orderBy: "startTime",
    });

    const listResponse = await calendarFetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
      token
    );
    const listData = (await listResponse.json()) as CalendarListResponse;

    const events: CalendarEventSummary[] = (listData.items ?? [])
      .filter((event) => event.status !== "cancelled")
      .map((event) => ({
        id: event.id,
        title: event.summary ?? "(no title)",
        description: event.description ?? "",
        start: event.start?.dateTime ?? event.start?.date ?? "",
        end: event.end?.dateTime ?? event.end?.date ?? "",
        location: event.location ?? "",
        htmlLink: event.htmlLink ?? "",
        allDay: !event.start?.dateTime,
      }));

    return Response.json({ events });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch calendar events.";
    return Response.json({ error: message }, { status: 500 });
  }
}
