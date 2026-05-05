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

async function calendarFetch(url: string, token: string, options?: RequestInit) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options?.headers as Record<string, string> ?? {}),
    },
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

/**
 * POST /api/integrations/google-calendar
 * Creates a new event in the user's primary calendar.
 * Body: { title: string, description?: string, startDateTime: string, endDateTime?: string, location?: string, allDay?: boolean }
 */
export async function POST(request: Request) {
  try {
    const { user, token } = await getCalendarContext();
    if (!user) {
      return Response.json({ error: "Sign in before creating calendar events." }, { status: 401 });
    }
    if (!token) {
      return Response.json({ error: "Reconnect Google and grant Calendar access first." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({})) as {
      title?: string;
      description?: string;
      startDateTime?: string;
      endDateTime?: string;
      location?: string;
      allDay?: boolean;
    };

    const title = body.title?.trim() || "New Event";
    const description = body.description?.trim() ?? "";
    const location = body.location?.trim() ?? "";
    const allDay = Boolean(body.allDay);

    if (!body.startDateTime) {
      return Response.json({ error: "startDateTime is required (ISO 8601)." }, { status: 400 });
    }

    // Validate ISO 8601 date/datetime
    const startDate = new Date(body.startDateTime);
    if (isNaN(startDate.getTime())) {
      return Response.json({ error: "Invalid startDateTime. Use ISO 8601 format." }, { status: 400 });
    }

    let eventBody: Record<string, unknown>;
    if (allDay) {
      const dateStr = startDate.toISOString().slice(0, 10);
      const endDateStr = body.endDateTime
        ? new Date(body.endDateTime).toISOString().slice(0, 10)
        : new Date(startDate.getTime() + 86_400_000).toISOString().slice(0, 10);
      eventBody = {
        summary: title,
        description,
        location,
        start: { date: dateStr },
        end: { date: endDateStr },
      };
    } else {
      const endDate = body.endDateTime
        ? new Date(body.endDateTime)
        : new Date(startDate.getTime() + 3_600_000); // default 1 hour
      eventBody = {
        summary: title,
        description,
        location,
        start: { dateTime: startDate.toISOString() },
        end: { dateTime: endDate.toISOString() },
      };
    }

    const createResponse = await calendarFetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      token,
      { method: "POST", body: JSON.stringify(eventBody) }
    );
    const created = (await createResponse.json()) as { id?: string; htmlLink?: string; summary?: string };

    return Response.json({
      ok: true,
      id: created.id ?? null,
      htmlLink: created.htmlLink ?? null,
      title: created.summary ?? title,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create calendar event.";
    return Response.json({ error: message }, { status: 500 });
  }
}

