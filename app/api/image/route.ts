export const runtime = "nodejs";
export const maxDuration = 60;

import OpenAI from "openai";
import { createClient } from "@/lib/server";
import { checkRateLimit, getRateLimitKey, rateLimitedResponse } from "@/lib/rateLimit";
import {
  buildPollinationsFallbackUrl,
  createGeneratedImageStoragePath,
  buildEnhancedImagePrompt,
  generateImageWithFal,
  logUsageEvent,
} from "@/app/lib/ai-platform";

type ImageStorageBucket = {
  upload: (
    path: string,
    body: ArrayBuffer,
    options: { contentType: string; upsert: boolean }
  ) => Promise<{ error?: { message?: string } | null }>;
  getPublicUrl: (path: string) => { data: { publicUrl: string } };
};

type ImageStorageClient = {
  from: (bucket: string) => ImageStorageBucket;
};

function getImageStorageClient(client: unknown): ImageStorageClient | null {
  const storage = (client as { storage?: unknown }).storage;
  if (!storage || typeof (storage as { from?: unknown }).from !== "function") return null;
  return storage as ImageStorageClient;
}

async function getAuth() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return { supabase, user };
  } catch {
    return { supabase: null, user: null };
  }
}

async function persistGeneratedImage(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  prompt: string;
  quality: "fast" | "high";
  provider: string;
  model: string;
  imageUrl: string;
  enhancedPrompt?: string;
}) {
  const storage = getImageStorageClient(params.supabase);
  let finalUrl = params.imageUrl;
  let storagePath: string | null = null;

  if (storage) {
    try {
      const upstream = await fetch(params.imageUrl);
      if (upstream.ok) {
        const imageBuffer = await upstream.arrayBuffer();
        storagePath = createGeneratedImageStoragePath(params.userId);
        const contentType = upstream.headers.get("content-type") || "image/png";
        const upload = await storage.from("generated-images").upload(storagePath, imageBuffer, {
          contentType,
          upsert: false,
        });
        if (!upload.error) {
          finalUrl = storage.from("generated-images").getPublicUrl(storagePath).data.publicUrl;
        }
      }
    } catch {
      storagePath = null;
    }
  }

  await params.supabase.from("generated_images").insert({
    user_id: params.userId,
    prompt: params.prompt,
    enhanced_prompt: params.enhancedPrompt ?? null,
    provider: params.provider,
    model: params.model,
    quality: params.quality,
    image_url: finalUrl,
    storage_path: storagePath,
  });

  return finalUrl;
}

export async function GET() {
  const { supabase, user } = await getAuth();
  if (!supabase || !user) return Response.json({ images: [] }, { status: 401 });

  const { data, error } = await supabase
    .from("generated_images")
    .select("id, prompt, enhanced_prompt, provider, model, quality, image_url, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(24);

  if (error) {
    return Response.json({ images: [], error: error.message }, { status: 500 });
  }

  return Response.json({ images: data ?? [] });
}

export async function POST(req: Request) {
  const rlKey = getRateLimitKey(req, "image");
  const rl = checkRateLimit(rlKey, 10, 60_000);
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

  const { supabase, user } = await getAuth();

  try {
    const body = await req.json() as {
      prompt?: string;
      quality?: "fast" | "high";
      enhancePrompt?: boolean;
      aspectRatio?: string;
    };

    const prompt = body.prompt?.trim() ?? "";
    const quality = body.quality === "high" ? "high" : "fast";
    const enhancePrompt = body.enhancePrompt === true;

    if (!prompt) {
      return Response.json({ url: null, model: null, error: "Prompt is required." }, { status: 400 });
    }

    let generated;
    try {
      generated = await generateImageWithFal({
        prompt,
        quality,
        enhancePrompt,
        aspectRatio: body.aspectRatio,
      });
    } catch (falError) {
      const promptUsed = buildEnhancedImagePrompt(prompt, enhancePrompt);
      if (process.env.OPENAI_API_KEY) {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const response = await openai.images.generate({
          model: "gpt-image-1",
          prompt: promptUsed,
          size: "1024x1024",
        });
        generated = {
          url: response.data?.[0]?.url ?? buildPollinationsFallbackUrl(promptUsed, quality),
          provider: "OpenAI",
          model: "gpt-image-1",
          stages: ["Validating prompt", "fal.ai unavailable, switching provider", "Finalizing output"],
          promptUsed,
        };
      } else {
        console.warn("fal.ai image generation failed, falling back to Pollinations:", falError);
        generated = {
          url: buildPollinationsFallbackUrl(promptUsed, quality),
          provider: "Pollinations",
          model: quality === "high" ? "Pollinations FLUX" : "Pollinations Turbo",
          stages: ["Validating prompt", "fal.ai unavailable, using fallback", "Publishing image URL"],
          promptUsed,
        };
      }
    }

    let finalUrl = generated.url;
    if (supabase && user) {
      finalUrl = await persistGeneratedImage({
        supabase,
        userId: user.id,
        prompt,
        quality,
        provider: generated.provider,
        model: generated.model,
        imageUrl: generated.url,
        enhancedPrompt: generated.promptUsed === prompt ? undefined : generated.promptUsed,
      });
      await logUsageEvent({
        supabase,
        userId: user.id,
        eventType: "image_generation",
        provider: generated.provider,
        model: generated.model,
        route: "/api/image",
        metadata: { quality, enhancePrompt },
      });
    }

    return Response.json({
      url: finalUrl,
      model: generated.model,
      provider: generated.provider,
      stages: generated.stages,
      promptUsed: generated.promptUsed,
      quality,
    });
  } catch (error) {
    console.error("Image generation error:", error);
    return Response.json({ url: null, model: null, error: "Image generation failed." });
  }
}
