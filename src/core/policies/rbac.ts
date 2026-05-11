export type OrgRole = "owner" | "admin" | "member" | "viewer";

export type RbacPermission =
  | "workflow:create"
  | "workflow:read"
  | "tool:execute:low"
  | "tool:execute:medium"
  | "tool:execute:high"
  | "memory:read"
  | "memory:write"
  | "audit:read"
  | "org:manage"
  | "billing:manage"
  | "approval:resolve";

const ROLE_PERMISSIONS: Record<OrgRole, RbacPermission[]> = {
  owner: [
    "workflow:create",
    "workflow:read",
    "tool:execute:low",
    "tool:execute:medium",
    "tool:execute:high",
    "memory:read",
    "memory:write",
    "audit:read",
    "org:manage",
    "billing:manage",
    "approval:resolve",
  ],
  admin: [
    "workflow:create",
    "workflow:read",
    "tool:execute:low",
    "tool:execute:medium",
    "tool:execute:high",
    "memory:read",
    "memory:write",
    "audit:read",
    "approval:resolve",
  ],
  member: [
    "workflow:create",
    "workflow:read",
    "tool:execute:low",
    "tool:execute:medium",
    "memory:read",
    "memory:write",
  ],
  viewer: [
    "workflow:read",
    "memory:read",
    "tool:execute:low",
  ],
};

export function hasPermission(role: OrgRole, permission: RbacPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function roleCanExecuteTool(
  role: OrgRole,
  riskLevel: "low" | "medium" | "high",
): boolean {
  switch (riskLevel) {
    case "low":
      return hasPermission(role, "tool:execute:low");
    case "medium":
      return hasPermission(role, "tool:execute:medium");
    case "high":
      return hasPermission(role, "tool:execute:high");
  }
}
