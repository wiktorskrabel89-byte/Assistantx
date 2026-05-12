/**
 * Actor Resolver — Phase 1 Foundation Hardening
 *
 * Resolves a raw Supabase Bearer token into a fully-typed RuntimeActor that
 * carries the verified userId, active organizationId, org role, and plan tier.
 *
 * All downstream runtime services (Tool Router, workflow facade, v1 API routes)
 * call this once at request ingress so every privileged action is attributable.
 */

import type { OrgRole } from "@/src/core/policies/rbac";
import type { TenantContext } from "@/src/shared/multitenancy/tenant-context";
import type { RuntimeActor } from "@/src/core/types/runtime";
import { randomUUID } from "node:crypto";

export type ResolvedActor = RuntimeActor & {
  tenantContext: TenantContext;
};

export type ActorResolutionResult =
  | { ok: true; actor: ResolvedActor }
  | { ok: false; error: string; status: 401 | 403 | 500 };

/**
 * Row shape returned by the Supabase org membership query.
 */
type OrgMembershipRow = {
  organization_id: string;
  role: OrgRole;
  organizations: {
    plan: "free" | "pro" | "enterprise";
  } | null;
};

/**
 * Resolve a Bearer token to a fully-typed runtime actor.
 *
 * - Validates the JWT against Supabase Auth (getUser with the raw token).
 * - Optionally loads org membership when `organizationId` is provided in the
 *   request. When none is provided, the first active membership is used.
 * - Fails hard on invalid tokens; returns a safe 401 error result.
 *
 * This function must be the single point of auth resolution for all v1 API
 * routes and the runtime facade — never call supabase.auth.getUser() directly
 * in route handlers.
 */
export async function resolveActor(params: {
  bearerToken: string;
  requestedOrganizationId?: string | null;
  sessionId?: string | null;
}): Promise<ActorResolutionResult> {
  const { bearerToken, requestedOrganizationId, sessionId } = params;

  if (!bearerToken) {
    return { ok: false, error: "Authorization header required.", status: 401 };
  }

  // Basic structural check: Supabase JWTs are base64url-encoded dot-separated
  // three-part strings.  This avoids sending malformed tokens to the auth server.
  const jwtParts = bearerToken.split(".");
  if (jwtParts.length !== 3 || jwtParts.some((p) => !p)) {
    return { ok: false, error: "Malformed authorization token.", status: 401 };
  }

  // Dynamic import keeps the server-only Supabase client out of edge bundles.
  const { createClient } = await import("@/lib/server");

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return { ok: false, error: "Auth service unavailable.", status: 500 };
  }

  // Validate the JWT against Supabase Auth.  getUser() with the raw token
  // performs a server-side validation — it does NOT rely on the session cookie.
  const { data: userData, error: authError } = await supabase.auth.getUser(bearerToken);

  if (authError || !userData.user) {
    return {
      ok: false,
      error: "Invalid or expired authorization token.",
      status: 401,
    };
  }

  const userId = userData.user.id;

  // Resolve org membership.  When the caller specifies an organization,
  // we verify the user is actually a member.  Otherwise we take the first
  // org they belong to (or null for personal-workspace users).
  let organizationId: string | null = null;
  let orgRole: OrgRole | null = null;
  let plan: "free" | "pro" | "enterprise" = "free";

  try {
    let query = supabase
      .from("org_memberships")
      .select("organization_id, role, organizations(plan)")
      .eq("user_id", userId);

    if (requestedOrganizationId) {
      query = query.eq("organization_id", requestedOrganizationId);
    }

    const { data: memberships } = await query.limit(1).returns<OrgMembershipRow[]>();

    if (memberships && memberships.length > 0) {
      const m = memberships[0];
      organizationId = m.organization_id;
      orgRole = m.role;
      plan = (m.organizations?.plan ?? "free") as "free" | "pro" | "enterprise";
    }

    if (requestedOrganizationId && !organizationId) {
      return {
        ok: false,
        error: "You are not a member of the requested organization.",
        status: 403,
      };
    }
  } catch {
    // Org lookup is best-effort; continue as personal-workspace user.
  }

  const actor: ResolvedActor = {
    userId,
    organizationId,
    sessionId: sessionId ?? randomUUID(),
    tenantContext: {
      userId,
      organizationId,
      orgRole,
      plan,
    },
  };

  return { ok: true, actor };
}

/**
 * Extract and normalize the raw Bearer token from an Authorization header.
 * Returns null when the header is absent or malformed.
 */
export function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const trimmed = authorizationHeader.replace(/^Bearer\s+/i, "").trim();
  return trimmed || null;
}
