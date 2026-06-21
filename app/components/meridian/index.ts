/**
 * Meridian shell barrel — re-exports the four shell pieces so workspace-home
 * (and follow-on migrators) import from a single path.
 */

export { MeridianTopBar } from "./MeridianTopBar";
export type { MeridianTopBarProps } from "./MeridianTopBar";
export { MeridianRail } from "./MeridianRail";
export type { MeridianRailProps } from "./MeridianRail";
export { MeridianActivityPanel } from "./MeridianActivityPanel";
export type { MeridianActivityPanelProps } from "./MeridianActivityPanel";
export { MeridianStarMark } from "./MeridianStarMark";
export { MeridianVoiceOrb } from "./MeridianVoiceOrb";
export type { MeridianVoiceOrbProps, VoiceState } from "./MeridianVoiceOrb";
export { MeridianChatHero } from "./MeridianChatHero";
export type { MeridianChatHeroProps } from "./MeridianChatHero";
export { MeridianDevTools } from "./MeridianDevTools";
export type { MeridianDevToolsProps } from "./MeridianDevTools";
export { MeridianDevToolsToggle } from "./MeridianDevToolsToggle";
export { MeridianDiagnosticsCard } from "./MeridianDiagnosticsCard";
export type { MeridianDiagnosticsCardProps } from "./MeridianDiagnosticsCard";
export { MeridianSettingsShell } from "./MeridianSettingsShell";
export type { MeridianSettingsShellProps } from "./MeridianSettingsShell";
export { MeridianWorkspaceShell } from "./MeridianWorkspaceShell";
export type { MeridianWorkspaceShellProps } from "./MeridianWorkspaceShell";
export {
  useMeridianDevTools,
  MERIDIAN_DEVTOOLS_STORAGE_KEY,
} from "./useMeridianDevTools";
export { MeridianLanguageWizard } from "./MeridianLanguageWizard";
export {
  useMeridianLocale,
  LOCALE_AVAILABILITY,
  LOCALE_LABELS,
  LOCALE_GREETING,
  MERIDIAN_LOCALE_STORAGE_KEYS,
  MERIDIAN_LOCALE_DEFAULT,
  type LocaleId,
} from "./useMeridianLocale";
export { SectionCard, SectionField } from "./SectionCard";
export type { LucideIconLike, SectionCardProps } from "./SectionCard";
export {
  MERIDIAN_TAB_LABELS,
  type MeridianHwStatus,
  type MeridianRailItem,
  type MeridianTab,
} from "./types";
