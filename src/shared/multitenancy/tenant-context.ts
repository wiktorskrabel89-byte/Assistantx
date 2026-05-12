import type { OrgRole } from "@/src/core/policies/rbac";

export type TenantContext = {
  userId: string;
  organizationId: string | null;
  orgRole: OrgRole | null;
  plan: "free" | "pro" | "enterprise";
};

export function buildTenantContext(params: {
  userId: string;
  organizationId?: string | null;
  orgRole?: OrgRole | null;
  plan?: "free" | "pro" | "enterprise";
}): TenantContext {
  return {
    userId: params.userId,
    organizationId: params.organizationId ?? null,
    orgRole: params.orgRole ?? null,
    plan: params.plan ?? "free",
  };
}

export function isOrgScoped(ctx: TenantContext): boolean {
  return ctx.organizationId !== null;
}

export function tenantIsolationKey(ctx: TenantContext): string {
  if (ctx.organizationId) return `org:${ctx.organizationId}`;
  return `user:${ctx.userId}`;
}
