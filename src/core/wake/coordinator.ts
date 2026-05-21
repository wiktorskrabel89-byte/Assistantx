import { sendWakeOnLanPacket } from "@/src/core/wake/magic-packet";

export type WakeMethod =
  | "tailscale_direct"
  | "router_api"
  | "udp_path_probe"
  | "ipv6_magic_packet"
  | "lan_broadcast"
  | "rtc_wait";

export type WakeMode = "router" | "ipv6" | "rtc_wait";

export type WakeCandidate = {
  deviceId: string;
  macAddress: string | null;
  ipv6: string | null;
  udpPort: number | null;
  provider: string;
  eligibleForWake: boolean;
  lastSeenAt: string | null;
};

export type WakeAttemptResult = {
  method: WakeMethod;
  ok: boolean;
  details: string;
  latencyMs: number;
};

export type WakeExecutionResult = {
  ok: boolean;
  method: WakeMethod | null;
  mode: WakeMode;
  nextAction: "wait_for_presence" | "wait_for_bios_rtc";
  attempts: WakeAttemptResult[];
};

function now() {
  return Date.now();
}

function toHealthcheckUrl(urlValue: string): string | null {
  const trimmed = urlValue.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "ws:") parsed.protocol = "http:";
    if (parsed.protocol === "wss:") parsed.protocol = "https:";
    parsed.pathname = "/health";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

async function attemptTailscaleDirect(agentUrl: string): Promise<WakeAttemptResult> {
  const startedAt = now();
  const healthcheckUrl = toHealthcheckUrl(agentUrl);
  if (!healthcheckUrl) {
    return {
      method: "tailscale_direct",
      ok: false,
      details: "Invalid JARVIS_HOME_TAILSCALE_URL format.",
      latencyMs: now() - startedAt,
    };
  }
  try {
    const response = await fetch(healthcheckUrl, { method: "GET", signal: AbortSignal.timeout(3_000) });
    if (!response.ok) {
      return {
        method: "tailscale_direct",
        ok: false,
        details: `Healthcheck failed with status ${response.status}.`,
        latencyMs: now() - startedAt,
      };
    }
    return {
      method: "tailscale_direct",
      ok: true,
      details: "Direct Tailscale healthcheck succeeded.",
      latencyMs: now() - startedAt,
    };
  } catch (error) {
    return {
      method: "tailscale_direct",
      ok: false,
      details: error instanceof Error ? error.message : "Tailscale direct healthcheck failed.",
      latencyMs: now() - startedAt,
    };
  }
}

function interpolateTemplate(value: unknown, replacements: Record<string, string>): unknown {
  if (typeof value === "string") {
    return value.replace(/\{\{(\w+)\}\}/g, (_, token: string) => replacements[token] ?? "");
  }
  if (Array.isArray(value)) {
    return value.map((item) => interpolateTemplate(item, replacements));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, interpolateTemplate(nested, replacements)]),
    );
  }
  return value;
}

function parseJsonEnv(envName: string, fallback: Record<string, unknown>) {
  const raw = String(process.env[envName] || "").trim();
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : fallback;
  } catch {
    return fallback;
  }
}

async function attemptRouterApi(candidate: WakeCandidate): Promise<WakeAttemptResult> {
  const startedAt = now();
  const url = String(process.env.JARVIS_ROUTER_API_URL || "").trim();
  if (!url) {
    return {
      method: "router_api",
      ok: false,
      details: "JARVIS_ROUTER_API_URL is not configured.",
      latencyMs: now() - startedAt,
    };
  }

  const method = String(process.env.JARVIS_ROUTER_API_METHOD || "POST").trim().toUpperCase();
  const token = String(process.env.JARVIS_ROUTER_API_TOKEN || "").trim();
  const tokenHeader = String(process.env.JARVIS_ROUTER_API_TOKEN_HEADER || "Authorization").trim() || "Authorization";
  const replacements = {
    deviceId: candidate.deviceId,
    mac: candidate.macAddress ?? "",
    ipv6: candidate.ipv6 ?? "",
    port: String(candidate.udpPort ?? 9),
    provider: candidate.provider,
  };
  const headers = interpolateTemplate(parseJsonEnv("JARVIS_ROUTER_API_HEADERS_JSON", {}), replacements) as Record<string, string>;
  const bodyTemplate = parseJsonEnv("JARVIS_ROUTER_API_BODY_JSON", {
    deviceId: "{{deviceId}}",
    mac: "{{mac}}",
    ipv6: "{{ipv6}}",
    port: "{{port}}",
  });
  const body = interpolateTemplate(bodyTemplate, replacements);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
        ...(token ? { [tokenHeader]: tokenHeader.toLowerCase() === "authorization" ? `Bearer ${token}` : token } : {}),
      },
      body: method === "GET" ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      const payload = await response.text().catch(() => "");
      return {
        method: "router_api",
        ok: false,
        details: payload || `Router API returned ${response.status}.`,
        latencyMs: now() - startedAt,
      };
    }
    return {
      method: "router_api",
      ok: true,
      details: "Router API wake request succeeded.",
      latencyMs: now() - startedAt,
    };
  } catch (error) {
    return {
      method: "router_api",
      ok: false,
      details: error instanceof Error ? error.message : "Router API wake failed.",
      latencyMs: now() - startedAt,
    };
  }
}

async function callWakeMicroservice(pathname: string, body: Record<string, unknown>) {
  const baseUrl = String(process.env.JARVIS_WAKE_VPS_BASE_URL || "").trim().replace(/\/$/, "");
  if (!baseUrl) {
    return { ok: false, details: "JARVIS_WAKE_VPS_BASE_URL is not configured." };
  }

  const token = String(process.env.JARVIS_WAKE_VPS_TOKEN || "").trim();
  try {
    const response = await fetch(`${baseUrl}${pathname}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        details: typeof payload?.error === "string"
          ? payload.error
          : `Wake microservice returned ${response.status}`,
      };
    }
    return { ok: true, details: String(payload?.message || "Wake request accepted.") };
  } catch (error) {
    return { ok: false, details: error instanceof Error ? error.message : "Wake microservice unavailable." };
  }
}

async function attemptUdpPathProbe(candidate: WakeCandidate): Promise<WakeAttemptResult> {
  const startedAt = now();
  const result = await callWakeMicroservice("/v1/wake/udp-impulse", {
    deviceId: candidate.deviceId,
    ipv6: candidate.ipv6,
    mac: candidate.macAddress,
    port: candidate.udpPort,
  });
  return {
    method: "udp_path_probe",
    ok: result.ok,
    details: result.details,
    latencyMs: now() - startedAt,
  };
}

async function attemptIpv6Magic(candidate: WakeCandidate): Promise<WakeAttemptResult> {
  const startedAt = now();
  const result = await callWakeMicroservice("/v1/wake/ipv6-magic", {
    deviceId: candidate.deviceId,
    ipv6: candidate.ipv6,
    mac: candidate.macAddress,
    port: candidate.udpPort ?? 9,
  });
  return {
    method: "ipv6_magic_packet",
    ok: result.ok,
    details: result.details,
    latencyMs: now() - startedAt,
  };
}

async function attemptLanBroadcast(candidate: WakeCandidate, overrideBroadcast?: string): Promise<WakeAttemptResult> {
  const startedAt = now();
  if (!candidate.macAddress) {
    return {
      method: "lan_broadcast",
      ok: false,
      details: "Missing MAC address for LAN WoL fallback.",
      latencyMs: now() - startedAt,
    };
  }

  try {
    await sendWakeOnLanPacket({
      mac: candidate.macAddress,
      host: overrideBroadcast || "255.255.255.255",
      port: candidate.udpPort ?? 9,
      socketType: "udp4",
      enableBroadcast: true,
    });
    return {
      method: "lan_broadcast",
      ok: true,
      details: "Magic packet sent via LAN broadcast fallback.",
      latencyMs: now() - startedAt,
    };
  } catch (error) {
    return {
      method: "lan_broadcast",
      ok: false,
      details: error instanceof Error ? error.message : "LAN fallback failed.",
      latencyMs: now() - startedAt,
    };
  }
}

function resolveWakeMode(method: WakeMethod | null): WakeMode {
  if (method === "ipv6_magic_packet") return "ipv6";
  if (method === null) return "rtc_wait";
  return "router";
}

function resolveWakeOrder(preferTailscale: boolean) {
  const configured = String(process.env.JARVIS_WAKE_FALLBACK_POLICY || "").trim();
  const defaults: WakeMethod[] = ["router_api", "udp_path_probe", "ipv6_magic_packet", "lan_broadcast"];
  const parsed = configured
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is WakeMethod =>
      ["router_api", "udp_path_probe", "ipv6_magic_packet", "lan_broadcast"].includes(item),
    );
  const ordered = parsed.length > 0 ? parsed : defaults;
  return preferTailscale ? ["tailscale_direct", ...ordered] as WakeMethod[] : ordered;
}

export async function executeWakeChain(params: {
  candidate: WakeCandidate;
  broadcastAddress?: string | null;
  agentUrl?: string | null;
  preferTailscale?: boolean;
}): Promise<WakeExecutionResult> {
  const { candidate } = params;
  const attempts: WakeAttemptResult[] = [];
  const tailscaleUrl = String(params.agentUrl || process.env.JARVIS_HOME_TAILSCALE_URL || "").trim();
  const order = resolveWakeOrder(Boolean(params.preferTailscale && tailscaleUrl));

  for (const method of order) {
    let attempt: WakeAttemptResult | null = null;
    if (method === "tailscale_direct") {
      attempt = await attemptTailscaleDirect(tailscaleUrl);
    } else if (method === "router_api") {
      attempt = await attemptRouterApi(candidate);
    } else if (method === "udp_path_probe" && candidate.udpPort && (candidate.ipv6 || candidate.macAddress)) {
      attempt = await attemptUdpPathProbe(candidate);
    } else if (method === "ipv6_magic_packet" && candidate.ipv6 && candidate.macAddress) {
      attempt = await attemptIpv6Magic(candidate);
    } else if (method === "lan_broadcast") {
      attempt = await attemptLanBroadcast(candidate, params.broadcastAddress || undefined);
    }
    if (!attempt) continue;
    attempts.push(attempt);
    if (attempt.ok) {
      return {
        ok: true,
        method: attempt.method,
        mode: resolveWakeMode(attempt.method),
        nextAction: "wait_for_presence",
        attempts,
      };
    }
  }

  attempts.push({
    method: "rtc_wait",
    ok: false,
    details: "Network wake methods failed. Waiting for BIOS RTC fallback.",
    latencyMs: 0,
  });
  return {
    ok: false,
    method: null,
    mode: "rtc_wait",
    nextAction: "wait_for_bios_rtc",
    attempts,
  };
}
