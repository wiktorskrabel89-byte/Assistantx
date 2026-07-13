"use client";

/**
 * MeridianDevToolsToggle — UI control for opening the dev-tools overlay.
 *
 * Drop into Settings → Zaawansowane. Reads/writes the same localStorage
 * source as the floating panel and the Ctrl+Shift+D shortcut, so all three
 * stay in sync without any prop plumbing.
 *
 * Styled to match the Meridian token system: ox-panel surface, cyan accent
 * when on, dim text when off. No shadcn dependency so it works before the
 * shadcn → ox token rewire is fully migrated.
 */

import { useMeridianDevTools } from "./useMeridianDevTools";

export function MeridianDevToolsToggle() {
  const [enabled, setEnabled] = useMeridianDevTools();

  return (
    <label
      className="ox-panel"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 12px",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span
          style={{
            color: "var(--ox-text-hi)",
            fontFamily: "var(--ox-font-sans)",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Dev Tools
        </span>
        <span
          style={{
            color: "var(--ox-text-mid)",
            fontFamily: "var(--ox-font-sans)",
            fontSize: 11,
            lineHeight: 1.45,
          }}
        >
          Pływające narzędzia diagnostyczne (tokeny, podgląd stanu głosu, ping API).
          Skrót: <kbd style={{ fontFamily: "var(--ox-font-mono)", fontSize: 10, padding: "1px 4px", border: "1px solid var(--ox-border)", borderRadius: 3 }}>Ctrl + Shift + D</kbd>
        </span>
      </span>
      <span
        role="switch"
        aria-checked={enabled}
        tabIndex={0}
        onClick={(e) => {
          e.preventDefault();
          setEnabled(!enabled);
        }}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            setEnabled(!enabled);
          }
        }}
        style={{
          position: "relative",
          width: 36,
          height: 20,
          borderRadius: 999,
          flexShrink: 0,
          background: enabled ? "var(--ox-cyan-dim)" : "var(--ox-bg3)",
          border: `1px solid ${enabled ? "var(--ox-cyan)" : "var(--ox-border)"}`,
          transition: "background var(--ox-duration-base) var(--ox-ease), border-color var(--ox-duration-base) var(--ox-ease)",
          boxShadow: enabled ? "0 0 12px rgba(0,240,255,0.25)" : "none",
          cursor: "pointer",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 2,
            left: enabled ? 18 : 2,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: enabled ? "var(--ox-cyan)" : "var(--ox-text-dim)",
            transition: "left var(--ox-duration-base) var(--ox-ease), background var(--ox-duration-base) var(--ox-ease)",
            boxShadow: enabled ? "0 0 8px rgba(0,240,255,0.5)" : "none",
          }}
        />
      </span>
      {/* Hidden checkbox to keep the parent <label> semantically valid for     */}
      {/* form submission flows. The visible switch above owns interaction.    */}
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => setEnabled(e.target.checked)}
        style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }}
        tabIndex={-1}
      />
    </label>
  );
}
