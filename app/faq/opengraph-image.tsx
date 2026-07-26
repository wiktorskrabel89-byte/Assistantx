import { makeOgImage, OG_SIZE } from "@/app/lib/og-image";

export const runtime = "edge";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "AssistantX FAQ";

export default function OgImage() {
  return makeOgImage({
    eyebrow: "FAQ",
    title: "Frequently asked.",
    subtitle: "Short, honest answers to the questions we hear most about AssistantX.",
  });
}
