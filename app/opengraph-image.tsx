import { makeOgImage, OG_SIZE } from "@/app/lib/og-image";

export const runtime = "edge";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "AssistantX — your AI assistant";

export default function OgImage() {
  return makeOgImage({
    eyebrow: "AssistantX",
    title: "Your AI assistant, on your terms.",
    subtitle:
      "Voice-first, local-first. Runs offline via local models, learns from your work, and actually gets things done.",
  });
}
