/**
 * Shared types for the Meridian shell. Kept in a leaf module so server/client
 * components can both import without dragging "use client" boundaries.
 */

export type MeridianTab = "chat" | "workspace" | "settings";

/**
 * Hardware telemetry surfaced by the TopBar HW pill. Values are optional so
 * the shell renders cleanly before the Capability Awareness Engine wires real
 * data; `connection` defaults to "idle".
 */
export type MeridianHwStatus = {
  cpuPercent?: number | null;
  ramGb?: number | null;
  connection?: "idle" | "degraded" | "offline";
};

/**
 * Rail icon descriptor — used by MeridianRail.tsx to render context-dependent
 * shortcuts per active tab. Caller owns selection state.
 *
 * Icon shape mirrors what lucide-react renders (className + optional style)
 * without importing LucideIcon directly — keeps `types.ts` dependency-light
 * so server components can import the union freely.
 */
export type MeridianRailItem = {
  id: string;
  label: string;
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
};

export const MERIDIAN_TAB_LABELS: Record<MeridianTab, string> = {
  chat: "Czat",
  workspace: "Workspace",
  settings: "Ustawienia",
};
