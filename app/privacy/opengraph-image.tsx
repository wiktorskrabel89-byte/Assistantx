import { makeOgImage, OG_SIZE } from "@/app/lib/og-image";

export const runtime = "edge";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "AssistantX Privacy Policy";

export default function OgImage() {
  return makeOgImage({
    eyebrow: "Legal",
    title: "Privacy Policy.",
    subtitle: "How AssistantX collects, uses, and protects your information — plain-language, GDPR-aware.",
  });
}
