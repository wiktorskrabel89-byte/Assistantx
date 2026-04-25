export const maxDuration = 60;

function extractJsonObject(content: string) {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(content.slice(start, end + 1)) as { description?: string; instructions?: string };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const { name, descriptionHint, preferredMode } = await req.json();

    if (typeof name !== "string" || !name.trim()) {
      return Response.json({ error: "Agent name is required." }, { status: 400 });
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://assistantx.vercel.app",
        "X-Title": "AssistantX",
      },
      body: JSON.stringify({
        model: "openai/gpt-5.4",
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content: "You create concise custom AI agent documentation for a chat app. Return valid JSON with exactly two string fields: description and instructions. The description must be one sentence. The instructions must be a detailed but compact system prompt for that agent.",
          },
          {
            role: "user",
            content: `Agent name: ${String(name).trim()}\nPreferred mode: ${typeof preferredMode === "string" && preferredMode.trim() ? preferredMode.trim() : "chat"}\nExisting description hint: ${typeof descriptionHint === "string" && descriptionHint.trim() ? descriptionHint.trim() : "none"}\n\nGenerate JSON with description and instructions for this agent.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json({ error: `Agent documentation generation failed: ${errorText}` }, { status: 500 });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const parsed = typeof content === "string" ? extractJsonObject(content) : null;

    if (!parsed?.description || !parsed?.instructions) {
      return Response.json({ error: "The model did not return usable agent documentation." }, { status: 500 });
    }

    return Response.json({
      description: parsed.description.trim(),
      instructions: parsed.instructions.trim(),
    });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Failed to generate agent documentation.",
    }, { status: 500 });
  }
}