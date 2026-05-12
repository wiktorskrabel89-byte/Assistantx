import type { OrgRole, RbacPermission } from "@/src/core/policies/rbac";
import { hasPermission } from "@/src/core/policies/rbac";
import type { TenantContext } from "@/src/shared/multitenancy/tenant-context";

export function tenantHasPermission(
  ctx: TenantContext,
  permission: RbacPermission,
): Promise<boolean> {
  const roleAllowed = ctx.orgRole
    ? hasPermission(ctx.orgRole as OrgRole, permission)
    : false;
  if (roleAllowed) {
    return Promise.resolve(true);
  }

  return (async () => {
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
  })();
}

export async function assertOrgPermission(
  ctx: TenantContext,
  permission: RbacPermission,
): Promise<void> {
  if (!(await tenantHasPermission(ctx, permission))) {
    throw new Error(
      `Permission denied: '${permission}' requires at least org role '${ctx.orgRole ?? "none"}'.`,
    );
  }
}
