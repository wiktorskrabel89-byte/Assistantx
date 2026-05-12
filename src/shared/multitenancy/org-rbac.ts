import type { OrgRole, RbacPermission } from "@/src/core/policies/rbac";
import { hasPermission } from "@/src/core/policies/rbac";
import type { TenantContext } from "@/src/shared/multitenancy/tenant-context";

export function tenantHasPermission(
  ctx: TenantContext,
  permission: RbacPermission,
): boolean {
  if (!ctx.orgRole) return false;
  return hasPermission(ctx.orgRole as OrgRole, permission);
}

export function assertOrgPermission(
  ctx: TenantContext,
  permission: RbacPermission,
): void {
  if (!tenantHasPermission(ctx, permission)) {
    throw new Error(
      `Permission denied: '${permission}' requires at least org role '${ctx.orgRole ?? "none"}'.`,
    );
  }
}

export async function tenantHasPermissionWithExplicitGrants(
  ctx: TenantContext,
  permission: RbacPermission,
): Promise<boolean> {
  if (tenantHasPermission(ctx, permission)) return true;

  try {
    const { hasExplicitPermission } = await import("@/src/core/persistence/runtime-db");
    return await hasExplicitPermission({
      userId: ctx.userId,
      permission,
      organizationId: ctx.organizationId,
    });
  } catch {
    return false;
  }
}

export async function assertOrgPermissionWithExplicitGrants(
  ctx: TenantContext,
  permission: RbacPermission,
): Promise<void> {
  if (!(await tenantHasPermissionWithExplicitGrants(ctx, permission))) {
    throw new Error(
      `Permission denied: '${permission}' requires at least org role '${ctx.orgRole ?? "none"}' or explicit grant.`,
    );
  }
}
