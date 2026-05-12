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
