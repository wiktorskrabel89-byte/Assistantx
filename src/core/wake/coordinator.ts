import { sendWakeOnLanPacket } from "@/src/core/wake/magic-packet";

export type WakeMethod = "tailscale_direct" | "udp_path_probe" | "ipv6_magic_packet" | "lan_broadcast";

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

export async function executeWakeChain(params: {
  candidate: WakeCandidate;
  broadcastAddress?: string | null;
  agentUrl?: string | null;
}): Promise<WakeExecutionResult> {
  const { candidate } = params;
  const attempts: WakeAttemptResult[] = [];

  const tailscaleUrl = String(params.agentUrl || process.env.JARVIS_HOME_TAILSCALE_URL || "").trim();
  if (tailscaleUrl) {
    const tailscaleAttempt = await attemptTailscaleDirect(tailscaleUrl);
    attempts.push(tailscaleAttempt);
    if (tailscaleAttempt.ok) {
      return { ok: true, method: "tailscale_direct", attempts };
    }
  }

  if (candidate.udpPort && (candidate.ipv6 || candidate.macAddress)) {
    const udpAttempt = await attemptUdpPathProbe(candidate);
    attempts.push(udpAttempt);
    if (udpAttempt.ok) {
      return { ok: true, method: "udp_path_probe", attempts };
    }
  }

  if (candidate.ipv6 && candidate.macAddress) {
    const ipv6Attempt = await attemptIpv6Magic(candidate);
    attempts.push(ipv6Attempt);
    if (ipv6Attempt.ok) {
      return { ok: true, method: "ipv6_magic_packet", attempts };
    }
  }

  const lanAttempt = await attemptLanBroadcast(candidate, params.broadcastAddress || undefined);
  attempts.push(lanAttempt);
  if (lanAttempt.ok) {
    return { ok: true, method: "lan_broadcast", attempts };
  }

  return { ok: false, method: null, attempts };
}
