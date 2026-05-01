export const maxDuration = 60;

import OpenAI from "openai";

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();
    // Try OpenAI DALL-E 3 if API key is present, otherwise fallback to Pollinations.ai
    if (process.env.OPENAI_API_KEY) {
      try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const response = await openai.images.generate({
          model: "dall-e-3",
          prompt,
          size: "1024x1024",
          quality: "standard",
          n: 1,
        });
        return Response.json({ url: response.data?.[0]?.url ?? null, model: "DALL-E 3" });
      } catch (err) {
        // If OpenAI fails, fallback to Pollinations
        console.warn("OpenAI image generation failed, falling back to Pollinations.ai:", err);
      }
    }
    // Pollinations.ai (free, no API key required)
    const encoded = encodeURIComponent(prompt);
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true&enhance=true`;
    return Response.json({ url, model: "Pollinations.ai (Free)" });
  } catch (error) {
    console.error("Image generation error:", error);
    return Response.json({ url: null, model: null, error: "Image generation failed." });
  }
}
