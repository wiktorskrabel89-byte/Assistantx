// Custom Next.js server used by local and production scripts.
/* eslint-disable @typescript-eslint/no-require-imports */
const { createServer } = require("http");
const { parse } = require("url");
const { randomUUID } = require("crypto");
const next = require("next");
const { WebSocketServer, WebSocket } = require("ws");
const { createClient: createSupabaseClient } = require("@supabase/supabase-js");

// ── Required environment variables ──────────────────────────────────────────
const REQUIRED_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
];

const missingVars = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
if (missingVars.length > 0) {
  console.error(
    `[env] ❌ Missing required environment variable(s): ${missingVars.join(", ")}. ` +
    "The server will start but some features may be unavailable. " +
    "Check your .env file or deployment configuration.",
  );
}

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

// ── Optional Node realtime edge gateway ─────────────────────────────────────
const REALTIME_PATH = process.env.JARVIS_REALTIME_PATH || process.env.ASSISTANTX_REALTIME_PATH || "/realtime";
const REALTIME_HEARTBEAT_TIMEOUT_MS = Number(
  process.env.JARVIS_REALTIME_HEARTBEAT_TIMEOUT_MS
  || process.env.ASSISTANTX_REALTIME_HEARTBEAT_TIMEOUT_MS
  || 45_000,
);
const REALTIME_CLEANUP_INTERVAL_MS = Number(
  process.env.JARVIS_REALTIME_CLEANUP_INTERVAL_MS
  || process.env.ASSISTANTX_REALTIME_CLEANUP_INTERVAL_MS
  || 15_000,
);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const realtimeClients = new Map();
let realtimeServer;
let cleanupTimer = null;

function parseRealtimeInit(req) {
  const parsed = parse(req.url || "", true);
  return {
    token: typeof parsed.query.token === "string" ? parsed.query.token : null,
    channel: typeof parsed.query.channel === "string" ? parsed.query.channel : "mobile",
    deviceId: typeof parsed.query.deviceId === "string" ? parsed.query.deviceId : null,
    sessionId: typeof parsed.query.sessionId === "string" ? parsed.query.sessionId : randomUUID(),
    resumeToken: typeof parsed.query.resumeToken === "string" ? parsed.query.resumeToken : randomUUID(),
  };
}

function createSupabaseAuthClient(token) {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "",
    {
      global: token
        ? { headers: { Authorization: `Bearer ${token}` } }
        : undefined,
    },
  );
}

async function resolveRealtimeUser(token) {
  if (!token) return null;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return null;
  }
  try {
    const supabase = createSupabaseAuthClient(token);
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

function sendRealtime(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function isAllowedChannel(value) {
  return value === "runtime" || value === "mobile" || value === "admin";
}

function getUserRealtimeConnections(userId) {
  const items = [];
  for (const [ws, meta] of realtimeClients.entries()) {
    if (meta.userId === userId && ws.readyState === WebSocket.OPEN) {
      items.push([ws, meta]);
    }
  }
  return items;
}

function broadcastPresence(userId) {
  const peers = getUserRealtimeConnections(userId).map(([, meta]) => ({
    channel: meta.channel,
    deviceId: meta.deviceId,
    sessionId: meta.sessionId,
    role: meta.channel === "runtime" ? "desktop-runtime" : meta.channel,
    lastHeartbeatAt: meta.lastHeartbeatAt,
    status: meta.presence?.status || "online",
  }));

  const payload = {
    type: "presence_snapshot",
    userId,
    active_connections: peers.length,
    role_counts: peers.reduce((acc, peer) => {
      const key = peer.channel;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
    peers,
    createdAt: new Date().toISOString(),
  };

  for (const [ws] of getUserRealtimeConnections(userId)) {
    sendRealtime(ws, payload);
  }
}

async function areTrustedPair(meta, targetDeviceId) {
  if (!meta.userId || !meta.deviceId || !targetDeviceId || !meta.token) return false;
  try {
    const supabase = createSupabaseAuthClient(meta.token);
    const { data, error } = await supabase
      .from("devices")
      .select("id")
      .eq("user_id", meta.userId)
      .eq("trust_state", "trusted")
      .in("id", [meta.deviceId, targetDeviceId]);
    if (error) return false;
    return Array.isArray(data) && data.length === 2;
  } catch (error) {
    console.warn("[realtime-edge] trusted-device check failed:", error instanceof Error ? error.message : "unknown error");
    return false;
  }
}

function rememberMessageId(meta, messageId) {
  if (!messageId || typeof messageId !== "string") return true;
  if (meta.seenMessageIds.has(messageId)) return false;
  meta.seenMessageIds.add(messageId);
  if (meta.seenMessageIds.size > 250) {
    const first = meta.seenMessageIds.values().next().value;
    if (first) meta.seenMessageIds.delete(first);
  }
  return true;
}

async function handleRealtimeMessage(ws, meta, raw) {
  let payload;
  try {
    payload = JSON.parse(raw.toString());
  } catch {
    sendRealtime(ws, { type: "error", code: "invalid_json", message: "Invalid JSON payload." });
    return;
  }

  const messageId = typeof payload.id === "string" ? payload.id : null;
  if (!rememberMessageId(meta, messageId)) {
    sendRealtime(ws, { type: "ack", id: messageId, deduped: true });
    return;
  }

  if (payload.type === "resume" && typeof payload.resumeToken === "string") {
    meta.resumeToken = payload.resumeToken;
    sendRealtime(ws, {
      type: "resumed",
      sessionId: meta.sessionId,
      resumeToken: meta.resumeToken,
      createdAt: new Date().toISOString(),
    });
    return;
  }

  if (payload.type === "heartbeat") {
    meta.lastHeartbeatAt = Date.now();
    meta.presence = {
      status: typeof payload.status === "string" ? payload.status : "online",
      cpu: typeof payload.cpu === "number" ? payload.cpu : null,
      activeApps: Array.isArray(payload.activeApps) ? payload.activeApps.slice(0, 15) : [],
      networkMode: typeof payload.networkMode === "string" ? payload.networkMode : "unknown",
    };
    sendRealtime(ws, {
      type: "heartbeat_ack",
      id: messageId,
      sessionId: meta.sessionId,
      ts: new Date().toISOString(),
    });
    broadcastPresence(meta.userId);
    return;
  }

  if (payload.type === "runtime_command") {
    if (meta.channel !== "mobile") {
      sendRealtime(ws, { type: "error", code: "forbidden_channel", message: "Only mobile channel can emit runtime commands." });
      return;
    }
    const targetDeviceId = typeof payload.targetDeviceId === "string" ? payload.targetDeviceId : null;
    if (!targetDeviceId) {
      sendRealtime(ws, { type: "error", code: "invalid_target", message: "targetDeviceId is required." });
      return;
    }

    const trusted = await areTrustedPair(meta, targetDeviceId);
    if (!trusted) {
      sendRealtime(ws, { type: "error", code: "device_not_trusted", message: "Command blocked: trusted-device policy check failed." });
      return;
    }

    const commandPayload = {
      type: "runtime_command",
      id: messageId || randomUUID(),
      command: payload.command,
      args: payload.args ?? {},
      workflowId: payload.workflowId ?? null,
      fromDeviceId: meta.deviceId,
      targetDeviceId,
      createdAt: new Date().toISOString(),
    };

    let delivered = 0;
    for (const [peerWs, peerMeta] of getUserRealtimeConnections(meta.userId)) {
      if (peerMeta.channel !== "runtime") continue;
      if (peerMeta.deviceId !== targetDeviceId) continue;
      sendRealtime(peerWs, commandPayload);
      delivered += 1;
    }

    sendRealtime(ws, {
      type: "runtime_command_ack",
      id: commandPayload.id,
      targetDeviceId,
      delivered,
      createdAt: new Date().toISOString(),
    });
    return;
  }

  if (payload.type === "event") {
    const eventPayload = {
      type: "event",
      id: messageId || randomUUID(),
      event: payload.event || "unknown",
      data: payload.data ?? {},
      fromChannel: meta.channel,
      fromDeviceId: meta.deviceId,
      createdAt: new Date().toISOString(),
    };
    for (const [peerWs, peerMeta] of getUserRealtimeConnections(meta.userId)) {
      if (peerWs === ws) continue;
      if (payload.targetChannel && payload.targetChannel !== peerMeta.channel) continue;
      sendRealtime(peerWs, eventPayload);
    }
    sendRealtime(ws, { type: "ack", id: eventPayload.id });
    return;
  }

  sendRealtime(ws, {
    type: "warning",
    code: "unsupported_message_type",
    message: `Unsupported message type: ${payload.type}`,
  });
}

function installRealtimeGateway(httpServer) {
  realtimeServer = new WebSocketServer({ noServer: true });

  // Next.js needs to handle its own WebSocket upgrades (Turbopack/HMR dev
  // socket at /_next/webpack-hmr). Destroying them kills the dev client's
  // module runtime: the browser waits for the dev socket before executing
  // page modules, so hydration silently never happens.
  const nextUpgradeHandler = typeof app.getUpgradeHandler === "function"
    ? app.getUpgradeHandler()
    : null;

  httpServer.on("upgrade", async (req, socket, head) => {
    const parsed = parse(req.url || "", true);
    if (parsed.pathname !== REALTIME_PATH) {
      if (nextUpgradeHandler) {
        nextUpgradeHandler(req, socket, head);
      } else {
        socket.destroy();
      }
      return;
    }

    const init = parseRealtimeInit(req);
    const user = await resolveRealtimeUser(init.token);
    if (!user) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    if (!isAllowedChannel(init.channel)) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    req.realtimeInit = { ...init, userId: user.id };
    realtimeServer.handleUpgrade(req, socket, head, (ws) => {
      realtimeServer.emit("connection", ws, req);
    });
  });

  realtimeServer.on("connection", (ws, req) => {
    const init = req.realtimeInit;
    const meta = {
      userId: init.userId,
      token: init.token,
      channel: init.channel,
      deviceId: init.deviceId,
      sessionId: init.sessionId,
      resumeToken: init.resumeToken,
      lastHeartbeatAt: Date.now(),
      seenMessageIds: new Set(),
      presence: null,
    };
    realtimeClients.set(ws, meta);

    sendRealtime(ws, {
      type: "connected",
      channel: meta.channel,
      sessionId: meta.sessionId,
      resumeToken: meta.resumeToken,
      heartbeatTimeoutMs: REALTIME_HEARTBEAT_TIMEOUT_MS,
      createdAt: new Date().toISOString(),
    });
    broadcastPresence(meta.userId);

    ws.on("message", (raw) => {
      void handleRealtimeMessage(ws, meta, raw);
    });

    ws.on("close", () => {
      realtimeClients.delete(ws);
      broadcastPresence(meta.userId);
    });

    ws.on("error", () => {
      realtimeClients.delete(ws);
      broadcastPresence(meta.userId);
    });
  });

  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [ws, meta] of realtimeClients.entries()) {
      if (now - meta.lastHeartbeatAt > REALTIME_HEARTBEAT_TIMEOUT_MS) {
        try {
          ws.close(4000, "heartbeat_timeout");
        } catch {
          // ignore
        } finally {
          realtimeClients.delete(ws);
          broadcastPresence(meta.userId);
        }
      }
    }
  }, REALTIME_CLEANUP_INTERVAL_MS);
}

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    const parsedUrl = parse(req.url, true);
    await handle(req, res, parsedUrl);
  });

  installRealtimeGateway(httpServer);

  httpServer.listen(port, hostname, () => {
    if (process.env.NODE_ENV !== "production") {
      console.log(`> Ready on http://${hostname}:${port}`);
      console.log(`> Realtime edge gateway ready at ws://${hostname}:${port}${REALTIME_PATH}`);
    }
  });
});

process.on("SIGTERM", () => {
  if (cleanupTimer) clearInterval(cleanupTimer);
});
