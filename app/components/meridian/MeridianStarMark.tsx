/**
 * MeridianStarMark — the VEGA brand mark used everywhere "◈ Jarvis" appears.
 *
 * Geometry is referenced (NOT copy-pasted) from the VEGA logo: long horizontal
 * points, shorter vertical points, narrow pinch at the centre, small bright
 * core dot. Uses currentColor for the body so callers control tint via inline
 * `style={{ color: 'var(--ox-cyan)' }}` or className. The core dot is rendered
 * lighter (white-ish) to match the bright centre of the reference orb.
 *
 * The mark is purely decorative — sibling text supplies the accessible name —
 * so the SVG is marked aria-hidden. Pass `withHalo` to add a faint outer ring
 * that suggests the orb context (useful in the VoiceOrb, not the TopBar).
 */

export function MeridianStarMark({
  size = 18,
  className,
  withHalo = false,
  haloOpacity = 0.18,
}: {
  size?: number;
  className?: string;
  withHalo?: boolean;
  haloOpacity?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {withHalo ? (
        <circle
          cx="16"
          cy="16"
          r="14.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.6"
          opacity={haloOpacity}
        />
      ) : null}

      {/* Four-point star: wide horizontal, shorter vertical, narrow pinch.   */}
      {/*   horizontal points reach x=1 and x=31 (almost full edge)           */}
      {/*   vertical   points reach y=5.5 and y=26.5 (shorter)                */}
      {/*   pinch is at ±2.4 from centre on each axis                         */}
      <path
        d="M 16 5.5
           L 18.4 13.6
           L 31 16
           L 18.4 18.4
           L 16 26.5
           L 13.6 18.4
           L 1 16
           L 13.6 13.6 Z"
        fill="currentColor"
        opacity="0.95"
      />

      {/* Bright core dot — reads as the focal point even at 18px. */}
      <circle cx="16" cy="16" r="1.6" fill="#ffffff" opacity="0.92" />
    </svg>
  );
}
