import { ImageResponse } from "next/og";

/**
 * Shared OG-image generator. Each route's opengraph-image.tsx calls
 * makeOgImage({ eyebrow, title }) and returns the result.
 *
 * Runtime: edge (default for opengraph-image files).
 * Design: black background, violet radial glow, huge X-mark, page title,
 * eyebrow tag, subtle brand mark bottom-right. 1200×630 (LinkedIn / Twitter
 * summary_large_image sweet spot).
 */
export const OG_SIZE = { width: 1200, height: 630 } as const;

export async function makeOgImage({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background:
            "radial-gradient(ellipse 80% 60% at 30% 20%, rgba(124,58,237,0.35), transparent 70%), radial-gradient(ellipse 60% 40% at 90% 80%, rgba(37,99,235,0.28), transparent 60%), #050508",
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Top row: brand mark */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "linear-gradient(135deg, #7c3aed 0%, #9333ea 50%, #2563eb 100%)",
              fontWeight: 900,
              fontSize: 28,
            }}
          >
            X
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3 }}>AssistantX</span>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>assistantx.pl</span>
          </div>
        </div>

        {/* Title block */}
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 940 }}>
          {eyebrow && (
            <div
              style={{
                display: "flex",
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: 4,
                textTransform: "uppercase",
                color: "#c4b5fd",
                marginBottom: 24,
              }}
            >
              {eyebrow}
            </div>
          )}
          <div
            style={{
              display: "flex",
              fontSize: 84,
              lineHeight: 1.02,
              fontWeight: 900,
              letterSpacing: -3,
              backgroundImage: "linear-gradient(90deg, #ffffff, rgba(255,255,255,0.55))",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                display: "flex",
                marginTop: 24,
                fontSize: 26,
                color: "rgba(255,255,255,0.65)",
                lineHeight: 1.35,
                maxWidth: 900,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>

        {/* Bottom row: pill CTA + accent */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 20px",
              borderRadius: 999,
              background: "linear-gradient(90deg, #7c3aed, #2563eb)",
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            Join the waitlist →
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 14,
              color: "rgba(255,255,255,0.4)",
            }}
          >
            <span
              style={{
                display: "flex",
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#34d399",
              }}
            />
            Coming soon
          </div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
