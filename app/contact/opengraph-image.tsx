import { makeOgImage, OG_SIZE } from "@/app/lib/og-image";

export const runtime = "edge";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Contact AssistantX";

export default function OgImage() {
  return makeOgImage({
    eyebrow: "Contact",
    title: "Get in touch.",
    subtitle: "Support, privacy, legal, or just to say hi — pick a topic and we&apos;ll reply within 1–2 business days.",
  });
}
