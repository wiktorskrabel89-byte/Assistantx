"use client";

import { Calendar, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { OAuthProvider } from "@/lib/integrations";

type CalendarEventSummary = {
  id: string;
  title: string;
  description: string;
  start: string;
  end: string;
  location: string;
  htmlLink: string;
  allDay: boolean;
};

function providerBadge(isConnected: boolean, dark: boolean) {
  if (isConnected) {
    return dark ? "bg-emerald-950 text-emerald-200" : "bg-emerald-100 text-emerald-800";
  }
  return dark ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-700";
}

function formatCalendarDate(isoDate: string, allDay: boolean) {
  if (!isoDate) return "";
  try {
    if (allDay) return new Date(isoDate).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    return new Date(isoDate).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return isoDate;
  }
}

type CalendarIntegrationProps = {
  dark: boolean;
  linkedProviders: OAuthProvider[];
  authProvider: OAuthProvider | null;
};

export function CalendarIntegration({ dark, linkedProviders, authProvider }: CalendarIntegrationProps) {
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventSummary[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState("");
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventStart, setNewEventStart] = useState("");
  const [newEventEnd, setNewEventEnd] = useState("");
  const [newEventDesc, setNewEventDesc] = useState("");
  const [newEventLocation, setNewEventLocation] = useState("");
  const [newEventAllDay, setNewEventAllDay] = useState(false);
  const [createEventLoading, setCreateEventLoading] = useState(false);
  const [createEventResult, setCreateEventResult] = useState<{ ok?: boolean; htmlLink?: string; error?: string } | null>(null);

  const googleConnected = linkedProviders.includes("google") || authProvider === "google";

  async function fetchCalendarEvents() {
    setCalendarLoading(true);
    setCalendarError("");
    try {
      const response = await fetch("/api/integrations/google-calendar?maxResults=10&daysAhead=7");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Failed to fetch calendar events.");
      }
      setCalendarEvents((data as { events: CalendarEventSummary[] }).events);
    } catch (error) {
      setCalendarError(error instanceof Error ? error.message : "Failed to fetch calendar events.");
    } finally {
      setCalendarLoading(false);
    }
  }

  async function createCalendarEvent() {
    setCreateEventLoading(true);
    setCreateEventResult(null);
    try {
      const response = await fetch("/api/integrations/google-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newEventTitle.trim() || "New Event",
          description: newEventDesc.trim(),
          location: newEventLocation.trim(),
          startDateTime: newEventStart,
          endDateTime: newEventEnd || undefined,
          allDay: newEventAllDay,
        }),
      });
      const data = await response.json().catch(() => ({})) as { ok?: boolean; htmlLink?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Failed to create event.");
      setCreateEventResult({ ok: true, htmlLink: data.htmlLink });
      void fetchCalendarEvents();
      setNewEventTitle(""); setNewEventStart(""); setNewEventEnd(""); setNewEventDesc(""); setNewEventLocation("");
    } catch (error) {
      setCreateEventResult({ error: error instanceof Error ? error.message : "Failed to create event." });
    } finally {
      setCreateEventLoading(false);
    }
  }

  return (
    <div className={`rounded-2xl border px-3 py-3 ${dark ? "border-gray-800 bg-gray-950/60" : "border-gray-200 bg-gray-50"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Calendar className={`mt-0.5 h-4 w-4 shrink-0 ${dark ? "text-green-400" : "text-green-600"}`} />
          <div>
            <div className="text-sm font-medium">Google Calendar</div>
            <p className="mt-1 text-xs leading-5 text-gray-500">View and create events in your primary calendar.</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${providerBadge(googleConnected, dark)}`}>
          {googleConnected ? "Calendar ready" : "Link Google"}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        <div className="flex gap-2">
          <button
            onClick={() => void fetchCalendarEvents()}
            disabled={calendarLoading || !googleConnected}
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${dark ? "bg-gray-800 text-gray-100 hover:bg-gray-700 disabled:opacity-50" : "bg-white text-gray-900 border border-gray-200 hover:bg-gray-100 disabled:opacity-50"}`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${calendarLoading ? "animate-spin" : ""}`} />
            {calendarLoading ? "Loading..." : "Load events"}
          </button>
          <button
            onClick={() => { setShowCreateEvent((v) => !v); setCreateEventResult(null); }}
            disabled={!googleConnected}
            title="Create a new calendar event"
            aria-label="Create calendar event"
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${dark ? "bg-green-900/70 text-green-200 hover:bg-green-800 disabled:opacity-50" : "bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"}`}
          >
            <Plus className="h-3.5 w-3.5" />
            Create event
          </button>
        </div>

        {showCreateEvent && googleConnected && (
          <div className={`space-y-2 rounded-xl border px-3 py-3 ${dark ? "border-gray-700 bg-gray-900/60" : "border-gray-300 bg-white"}`}>
            <div className="text-xs font-semibold">New event</div>
            <input
              id="new-event-title"
              name="newEventTitle"
              type="text"
              value={newEventTitle}
              onChange={(e) => setNewEventTitle(e.target.value)}
              placeholder="Event title"
              className={`w-full rounded-lg border px-2 py-1.5 text-xs ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`}
            />
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs">
                <input id="new-event-all-day" name="newEventAllDay" type="checkbox" checked={newEventAllDay} onChange={(e) => setNewEventAllDay(e.target.checked)} />
                All day
              </label>
            </div>
            <input
              id="new-event-start"
              name="newEventStart"
              type={newEventAllDay ? "date" : "datetime-local"}
              value={newEventStart}
              onChange={(e) => setNewEventStart(e.target.value)}
              className={`w-full rounded-lg border px-2 py-1.5 text-xs ${dark ? "border-gray-700 bg-gray-900 text-gray-100" : "border-gray-300 bg-white text-gray-900"}`}
            />
            <input
              id="new-event-end"
              name="newEventEnd"
              type={newEventAllDay ? "date" : "datetime-local"}
              value={newEventEnd}
              onChange={(e) => setNewEventEnd(e.target.value)}
              placeholder="End (optional)"
              className={`w-full rounded-lg border px-2 py-1.5 text-xs ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`}
            />
            <input
              id="new-event-location"
              name="newEventLocation"
              type="text"
              value={newEventLocation}
              onChange={(e) => setNewEventLocation(e.target.value)}
              placeholder="Location (optional)"
              className={`w-full rounded-lg border px-2 py-1.5 text-xs ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`}
            />
            <textarea
              id="new-event-desc"
              name="newEventDesc"
              value={newEventDesc}
              onChange={(e) => setNewEventDesc(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className={`w-full rounded-lg border px-2 py-1.5 text-xs resize-none ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"}`}
            />
            <button
              onClick={() => void createCalendarEvent()}
              disabled={createEventLoading || !newEventStart}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${dark ? "bg-green-900 text-green-100 hover:bg-green-800 disabled:opacity-50" : "bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"}`}
            >
              {createEventLoading ? "Creating..." : "Save to Google Calendar"}
            </button>
            {createEventResult?.ok && (
              <div className="text-xs text-emerald-400">
                Event created!{" "}
                {createEventResult.htmlLink && (
                  <a href={createEventResult.htmlLink} target="_blank" rel="noopener noreferrer" className="underline">Open in Calendar</a>
                )}
              </div>
            )}
            {createEventResult?.error && <div className="text-xs text-rose-400">{createEventResult.error}</div>}
          </div>
        )}

        {calendarEvents.length > 0 && (
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {calendarEvents.map((event) => (
              <div
                key={event.id}
                className={`rounded-xl border px-3 py-2 ${dark ? "border-gray-800 bg-gray-900/80" : "border-gray-200 bg-white"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{event.title}</div>
                    <div className="mt-0.5 text-[11px] text-gray-500">{formatCalendarDate(event.start, event.allDay)}</div>
                    {event.location && <div className="mt-0.5 truncate text-[11px] text-gray-400">{event.location}</div>}
                  </div>
                  {event.htmlLink && (
                    <a
                      href={event.htmlLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium transition ${dark ? "bg-green-900/60 text-green-200 hover:bg-green-800" : "bg-green-100 text-green-800 hover:bg-green-200"}`}
                    >
                      Open
                    </a>
                  )}
                </div>
                {event.description && <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-400">{event.description}</div>}
              </div>
            ))}
          </div>
        )}

        {calendarEvents.length === 0 && !calendarLoading && !calendarError && googleConnected && (
          <div className="text-xs text-gray-500">No upcoming events loaded yet.</div>
        )}

        {calendarError && <div className="text-xs text-rose-400">{calendarError}</div>}
      </div>
    </div>
  );
}
