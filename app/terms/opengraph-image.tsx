import { makeOgImage, OG_SIZE } from "@/app/lib/og-image";

export const runtime = "edge";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "AssistantX Terms of Service";

export default function OgImage() {
  return makeOgImage({
    eyebrow: "Legal",
    title: "Terms of Service.",
    subtitle: "The rules of the road for using AssistantX — what you can do, what we can do, and how it works.",
  });
}
