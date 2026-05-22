import { createClient } from "@/lib/server";
import { listDevicePresenceByDeviceIds, listDevicesForUser } from "@/src/core/persistence/runtime-db";
import { getAssistantCommand } from "@/src/core/commands/registry";
import { parseAssistantCommand } from "@/src/core/commands/parser";
import type { AssistantCommandId } from "@/src/core/commands/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type ExecuteBody = {
  message?: string;
  conversationId?: string | null;
  deviceId?: string | null;
};

type DeviceStatus = {
  id: string;
  label: string;
  trustState: string;
  status: string;
  isOnline: boolean;
};

function parseFreshnessMs() {
  const raw = Number.parseInt(String(process.env.JARVIS_DEVICE_FRESHNESS_MS || "45000"), 10);
  if (!Number.isFinite(raw) || raw < 5_000) return 45_000;
  return raw;
}

async function getRuntimeDevices(userId: string): Promise<{ devices: DeviceStatus[]; primaryDevice: DeviceStatus | null }> {
  const devices = await listDevicesForUser({ userId });
  const freshnessMs = parseFreshnessMs();
  const presenceRows = await listDevicePresenceByDeviceIds(
    devices.map((device) => device.id).filter((id): id is string => Boolean(id)),
  );
  const presenceByDeviceId = new Map(presenceRows.map((row) => [row.device_id, row]));
  const now = Date.now();

  const mapped = devices.map((device) => {
    const presence = device.id ? presenceByDeviceId.get(device.id) : null;
    const freshestTimestamp = presence?.last_heartbeat_at ?? device.last_seen_at ?? null;
    const freshnessAgeMs = freshestTimestamp ? Math.max(0, now - new Date(freshestTimestamp).getTime()) : null;
    const rawStatus = presence?.status ?? "offline";
    const isFresh = freshnessAgeMs !== null && freshnessAgeMs <= freshnessMs;
    const isOnline = Boolean(
      isFresh
      && presence?.is_online
      && rawStatus !== "offline"
      && rawStatus !== "hibernated"
      && rawStatus !== "unreachable",
    );

    return {
      id: String(device.id),
      label: device.label ?? "Jarvis Desktop",
      trustState: device.trust_state,
      status: isOnline ? rawStatus : "offline",
      isOnline,
    };
  });

  const primaryDevice = mapped.find((device) => device.trustState === "trusted" && device.isOnline)
    ?? mapped.find((device) => device.trustState === "trusted")
    ?? mapped[0]
    ?? null;

  return { devices: mapped, primaryDevice };
}

async function readLinkedProviderStatus(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const [linkedAccounts, mcpInstallations] = await Promise.all([
    supabase
      .from("jarvis_linked_accounts")
      .select("provider,label")
      .eq("user_id", userId)
      .then(({ data, error }) => (error ? [] : (data ?? []))),
    supabase
      .from("mcp_server_installations")
      .select("server_id,enabled")
      .eq("user_id", userId)
      .then(({ data, error }) => (error ? [] : (data ?? []))),
  ]);

  const providerSet = new Set(linkedAccounts.map((row) => String(row.provider)));
  const enabledServers = new Set(
    mcpInstallations
      .filter((row) => row.enabled)
      .map((row) => String(row.server_id)),
  );

  return {
    googleConnected: providerSet.has("google"),
    githubConnected: providerSet.has("github"),
    slackConnected: enabledServers.has("slack"),
    googleCalendarConnected: providerSet.has("google"),
    gmailConnected: providerSet.has("google"),
    driveConnected: providerSet.has("google"),
    braveSearchConnected: enabledServers.has("brave-search"),
    postgresConnected: enabledServers.has("postgres"),
    filesystemConnected: enabledServers.has("filesystem"),
    osConnected: enabledServers.has("operating-system"),
  };
}

async function recordCommandHistory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: {
    userId: string;
    deviceId?: string | null;
    commandId: AssistantCommandId;
    slash: string;
    matchedBy: "slash" | "alias";
    executionMode: string;
    status: "queued" | "completed" | "failed" | "blocked";
    argsText: string;
    routeReason?: string | null;
    resultSummary?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  try {
    await supabase.from("command_execution_history").insert({
      user_id: payload.userId,
      device_id: payload.deviceId ?? null,
      command_id: payload.commandId,
      slash: payload.slash,
      matched_by: payload.matchedBy,
      source: "web",
      execution_mode: payload.executionMode,
      status: payload.status,
      args_text: payload.argsText,
      route_reason: payload.routeReason ?? null,
      result_summary: payload.resultSummary ?? null,
      metadata: payload.metadata ?? {},
    });
  } catch {
    // best effort
  }
}

async function recordDeviceCapabilitySnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: {
    userId: string;
    deviceId: string;
    runtimeOnline: boolean;
    localServers?: unknown[];
    metadata?: Record<string, unknown>;
  },
) {
  try {
    await supabase.from("device_capability_snapshots").insert({
      user_id: payload.userId,
      device_id: payload.deviceId,
      snapshot_source: "web",
      runtime_online: payload.runtimeOnline,
      local_commands: ["os", "game", "open", "screenshot", "sleep", "repo", "index", "file", "search", "ignore", "db"],
      cloud_commands: ["today", "calendar", "gmail", "draft", "drive", "web", "google", "slack", "skills"],
      local_servers: payload.localServers ?? [],
      metadata: payload.metadata ?? {},
    });
  } catch {
    // best effort
  }
}

async function callInternalJson(request: Request, path: string, init?: RequestInit) {
  const url = new URL(path, request.url);
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(request.headers.get("cookie") ? { cookie: request.headers.get("cookie") as string } : {}),
      ...(request.headers.get("authorization") ? { authorization: request.headers.get("authorization") as string } : {}),
      ...(init?.headers as Record<string, string> ?? {}),
    },
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function buildSystemAction(commandId: AssistantCommandId, argsText: string) {
  switch (commandId) {
    case "os":
      return { actionType: "system_status_ping", payload: {} };
    case "open":
      return { actionType: "open_app", payload: { app: argsText } };
    case "game":
      return argsText.toLowerCase().includes("roblox")
        ? { actionType: "launch_roblox", payload: { game_id: "185655149" } }
        : { actionType: "open_app", payload: { app: argsText } };
    case "screenshot":
      return { actionType: "system_screenshot", payload: {} };
    case "sleep":
      return { actionType: "system_sleep", payload: {} };
    case "repo":
      return { actionType: "system_repo_status", payload: { path: argsText || "." } };
    case "index":
      return { actionType: "system_repo_index", payload: { path: argsText || "." } };
    case "file":
      return { actionType: "system_file_read", payload: { path: argsText } };
    case "search":
      return { actionType: "system_file_search", payload: { query: argsText } };
    case "ignore":
      return { actionType: "system_ignore_update", payload: { pattern: argsText } };
    case "db":
      return { actionType: "system_db_query", payload: { query: argsText } };
    default:
      return null;
  }
}

function buildSkillsMarkdown(params: {
  devices: DeviceStatus[];
  primaryDevice: DeviceStatus | null;
  cloud: Awaited<ReturnType<typeof readLinkedProviderStatus>>;
}) {
  const { devices, primaryDevice, cloud } = params;
  const localOnline = Boolean(primaryDevice?.isOnline && primaryDevice?.trustState === "trusted");
  const runtimeHeader = localOnline
    ? `**[● DOMOWY PC: ONLINE]** · ${primaryDevice?.label ?? "Jarvis Desktop"}`
    : "**[● DOMOWY PC: OFFLINE]** · Paired desktop unavailable";

  const cloudLines = [
    `- Google Suite MCP ............... ${cloud.googleConnected ? "[Połączono]" : "[Niepołączono]"}`,
    "  - Skróty: /today, /calendar, /gmail, /draft, /drive",
    `- Slack MCP ...................... ${cloud.slackConnected ? "[Połączono]" : "[Wymaga konfiguracji]"}`,
    "  - Skróty: /slack",
    `- Web Search ..................... ${cloud.braveSearchConnected ? "[Połączono]" : "[Aktywne przez web-search]"}`,
    "  - Skróty: /web, /google",
  ];

  const localLines = [
    `- Codebase Analyzer .............. ${localOnline ? "[Połączono]" : "[PC Offline]"}`,
    "  - Skróty: /repo, /index, /file, /search, /ignore",
    `- Operating System Core ......... ${localOnline ? "[Połączono]" : "[PC Offline]"}`,
    "  - Skróty: /os, /game, /open, /screenshot, /sleep",
    `- Local Database ................ ${localOnline ? (cloud.postgresConnected ? "[Połączono]" : "[Brak bazy]") : "[PC Offline]"}`,
    "  - Skrót: /db",
  ];

  const offlineLines = devices.length === 0
    ? ["- Brak sparowanego komputera runtime ........ [Wymaga parowania]"]
    : devices
      .filter((device) => !device.isOnline || device.trustState !== "trusted")
      .map((device) => `- ${device.label} ........ [${device.isOnline ? device.trustState : "Offline"}]`);

  return [
    "# AssistantX Marketplace & Skills",
    "",
    runtimeHeader,
    "",
    "## 🟢 Aktywne integracje chmurowe",
    ...cloudLines,
    "",
    "## 🖥️ Integracje lokalne PC",
    ...localLines,
    "",
    "## 🔴 Wymagają konfiguracji / offline",
    ...(offlineLines.length > 0 ? offlineLines : ["- Brak problemów konfiguracyjnych."]),
  ].join("\n");
}

async function executeCloudCommand(request: Request, commandId: AssistantCommandId, argsText: string) {
  switch (commandId) {
    case "today": {
      const { response, data } = await callInternalJson(request, "/api/integrations/google-calendar?maxResults=10&daysAhead=1");
      if (!response.ok) {
        return { ok: false, message: String((data as { error?: string }).error ?? "Failed to load today's plan.") };
      }
      const events = Array.isArray((data as { events?: Array<Record<string, unknown>> }).events)
        ? (data as { events: Array<Record<string, unknown>> }).events
        : [];
      const lines = events.length > 0
        ? events.map((event, index) => `- ${index + 1}. ${String(event.title ?? "(no title)")} · ${String(event.start ?? "")}`)
        : ["- No upcoming events found."];
      return { ok: true, message: ["# Today's plan", ...lines].join("\n") };
    }
    case "calendar": {
      const { response, data } = await callInternalJson(request, "/api/integrations/google-calendar", {
        method: "POST",
        body: JSON.stringify({
          title: argsText || "New Event",
          startDateTime: new Date(Date.now() + 3_600_000).toISOString(),
        }),
      });
      return response.ok
        ? { ok: true, message: `Created calendar event: ${String((data as { title?: string }).title ?? argsText ?? "New Event")}` }
        : { ok: false, message: String((data as { error?: string }).error ?? "Failed to create calendar event.") };
    }
    case "gmail": {
      const { response, data } = await callInternalJson(request, `/api/integrations/gmail?maxResults=${encodeURIComponent("10")}`);
      if (!response.ok) {
        return { ok: false, message: String((data as { error?: string }).error ?? "Failed to load Gmail.") };
      }
      const messages = Array.isArray((data as { messages?: Array<Record<string, unknown>> }).messages)
        ? (data as { messages: Array<Record<string, unknown>> }).messages
        : [];
      const filtered = argsText
        ? messages.filter((item) => `${item.subject ?? ""} ${item.from ?? ""} ${item.snippet ?? ""}`.toLowerCase().includes(argsText.toLowerCase()))
        : messages;
      const lines = filtered.length > 0
        ? filtered.slice(0, 10).map((item, index) => `- ${index + 1}. ${String(item.subject ?? "(no subject)")} — ${String(item.from ?? "")}`)
        : ["- No matching Gmail messages found."];
      return { ok: true, message: ["# Gmail", ...lines].join("\n") };
    }
    case "draft":
      return { ok: true, message: `Draft workflow ready: ${argsText || "Provide the recipient and purpose next."}` };
    case "drive": {
      const { response, data } = await callInternalJson(request, "/api/integrations/google-drive", {
        method: "POST",
        body: JSON.stringify({ input: argsText }),
      });
      return response.ok
        ? { ok: true, message: `Imported Google Drive file: ${String((data as { name?: string }).name ?? "file")}` }
        : { ok: false, message: String((data as { error?: string }).error ?? "Failed to access Google Drive.") };
    }
    case "web":
    case "google": {
      const query = argsText || "";
      const { response, data } = await callInternalJson(request, "/api/web-search", {
        method: "POST",
        body: JSON.stringify({ query, forceFresh: commandId === "google" }),
      });
      if (!response.ok) {
        return { ok: false, message: String((data as { error?: string }).error ?? "Search failed.") };
      }
      return { ok: true, message: String((data as { context?: string; answer?: string }).context ?? (data as { answer?: string }).answer ?? "Search complete.") };
    }
    case "slack":
      return { ok: true, message: argsText ? `Slack command queued for channel/query: ${argsText}` : "Slack is configured through MCP Marketplace. Connect Slack to enable channel history commands." };
    default:
      return { ok: false, message: "Unsupported cloud command." };
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ handled: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as ExecuteBody;
  const message = typeof body.message === "string" ? body.message : "";
  const parsed = parseAssistantCommand(message);
  if (!parsed) {
    return Response.json({ handled: false }, { status: 200 });
  }

  const command = getAssistantCommand(parsed.id);
  if (!command) {
    return Response.json({ handled: false }, { status: 200 });
  }

  const runtime = await getRuntimeDevices(user.id);
  const cloud = await readLinkedProviderStatus(supabase, user.id);

  if (parsed.id === "skills") {
    if (runtime.primaryDevice) {
      await recordDeviceCapabilitySnapshot(supabase, {
        userId: user.id,
        deviceId: runtime.primaryDevice.id,
        runtimeOnline: runtime.primaryDevice.isOnline,
        metadata: { cloud, devices: runtime.devices },
      });
    }
    await recordCommandHistory(supabase, {
      userId: user.id,
      deviceId: runtime.primaryDevice?.id ?? null,
      commandId: parsed.id,
      slash: parsed.slash,
      matchedBy: parsed.matchedBy,
      executionMode: command.executionMode,
      status: "completed",
      argsText: parsed.argsText,
      routeReason: "Merged cloud + local capabilities",
      resultSummary: "Rendered merged skills view",
      metadata: { deviceCount: runtime.devices.length },
    });
    return Response.json({
      handled: true,
      ok: true,
      commandId: parsed.id,
      slash: parsed.slash,
      executionMode: command.executionMode,
      matchedBy: parsed.matchedBy,
      routeReason: "Merged cloud + local capabilities",
      message: buildSkillsMarkdown({ devices: runtime.devices, primaryDevice: runtime.primaryDevice, cloud }),
      metadata: {
        devices: runtime.devices,
        primaryDeviceId: runtime.primaryDevice?.id ?? null,
        cloud,
      },
    });
  }

  if (command.requiresDesktop) {
    const primaryDevice = runtime.primaryDevice;
    if (!primaryDevice || primaryDevice.trustState !== "trusted" || !primaryDevice.isOnline) {
      await recordCommandHistory(supabase, {
        userId: user.id,
        commandId: parsed.id,
        slash: parsed.slash,
        matchedBy: parsed.matchedBy,
        executionMode: command.executionMode,
        status: "blocked",
        argsText: parsed.argsText,
        routeReason: "Desktop runtime required",
        resultSummary: "Blocked because no trusted online desktop was available",
      });
      return Response.json({
        handled: true,
        ok: false,
        commandId: parsed.id,
        slash: parsed.slash,
        executionMode: command.executionMode,
        matchedBy: parsed.matchedBy,
        routeReason: "Desktop runtime required",
        message: `Command ${parsed.slash} requires a trusted online Jarvis PC.`,
        requiresDesktop: true,
      });
    }

    const action = buildSystemAction(parsed.id, parsed.argsText);
    if (!action) {
      await recordCommandHistory(supabase, {
        userId: user.id,
        deviceId: primaryDevice.id,
        commandId: parsed.id,
        slash: parsed.slash,
        matchedBy: parsed.matchedBy,
        executionMode: command.executionMode,
        status: "failed",
        argsText: parsed.argsText,
        routeReason: "Unsupported local command",
        resultSummary: "Command has no mapped system action",
      });
      return Response.json({
        handled: true,
        ok: false,
        commandId: parsed.id,
        slash: parsed.slash,
        executionMode: command.executionMode,
        matchedBy: parsed.matchedBy,
        routeReason: "Unsupported local command",
        message: `Command ${parsed.slash} is not available on the web dispatcher yet.`,
      });
    }

    const { response, data } = await callInternalJson(request, "/api/jarvis/tasks", {
      method: "POST",
      body: JSON.stringify({
        prompt: `${parsed.slash}${parsed.argsText ? ` ${parsed.argsText}` : ""}`,
        category: "system_action",
        actionType: action.actionType,
        payload: action.payload,
        deviceId: primaryDevice.id,
      }),
    });

    if (!response.ok) {
      await recordCommandHistory(supabase, {
        userId: user.id,
        deviceId: primaryDevice.id,
        commandId: parsed.id,
        slash: parsed.slash,
        matchedBy: parsed.matchedBy,
        executionMode: command.executionMode,
        status: "failed",
        argsText: parsed.argsText,
        routeReason: "Task queue failed",
        resultSummary: String((data as { error?: string }).error ?? "Failed to queue local command."),
      });
      return Response.json({
        handled: true,
        ok: false,
        commandId: parsed.id,
        slash: parsed.slash,
        executionMode: command.executionMode,
        matchedBy: parsed.matchedBy,
        routeReason: "Task queue failed",
        message: String((data as { error?: string }).error ?? "Failed to queue local command."),
      });
    }

    await recordCommandHistory(supabase, {
      userId: user.id,
      deviceId: primaryDevice.id,
      commandId: parsed.id,
      slash: parsed.slash,
      matchedBy: parsed.matchedBy,
      executionMode: command.executionMode,
      status: "queued",
      argsText: parsed.argsText,
      routeReason: `Queued on ${primaryDevice.label}`,
      resultSummary: `Queued ${parsed.slash} on ${primaryDevice.label}.`,
      metadata: { taskId: (data as { taskId?: string }).taskId ?? null },
    });
    await recordDeviceCapabilitySnapshot(supabase, {
      userId: user.id,
      deviceId: primaryDevice.id,
      runtimeOnline: primaryDevice.isOnline,
      metadata: { commandId: parsed.id },
    });

    return Response.json({
      handled: true,
      ok: true,
      commandId: parsed.id,
      slash: parsed.slash,
      executionMode: command.executionMode,
      matchedBy: parsed.matchedBy,
      routeReason: `Queued on ${primaryDevice.label}`,
      taskId: (data as { taskId?: string }).taskId ?? null,
      task: (data as { task?: unknown }).task ?? null,
      status: "Queued on local device...",
      message: `Queued ${parsed.slash} on ${primaryDevice.label}.`,
      requiresDesktop: true,
      primaryDeviceId: primaryDevice.id,
    });
  }

  const cloudResult = await executeCloudCommand(request, parsed.id, parsed.argsText);
  await recordCommandHistory(supabase, {
    userId: user.id,
    commandId: parsed.id,
    slash: parsed.slash,
    matchedBy: parsed.matchedBy,
    executionMode: command.executionMode,
    status: cloudResult.ok ? "completed" : "failed",
    argsText: parsed.argsText,
    routeReason: "Cloud direct command",
    resultSummary: cloudResult.message,
  });
  return Response.json({
    handled: true,
    ok: cloudResult.ok,
    commandId: parsed.id,
    slash: parsed.slash,
    executionMode: command.executionMode,
    matchedBy: parsed.matchedBy,
    routeReason: "Cloud direct command",
    message: cloudResult.message,
  });
}
