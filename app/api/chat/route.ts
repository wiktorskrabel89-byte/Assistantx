import OpenAI from "openai";

export const maxDuration = 60;

const CODE_KEYWORDS = [
  "kod", "code", "funkcja", "function", "skrypt", "script",
  "napisz", "wygeneruj", "implement", "stwórz", "fix", "napraw",
  "class", "klasa", "def ", "const ", "let ", "var ", "import ",
  "snippet", "przykład kodu",
];

function isCodeRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return CODE_KEYWORDS.some((k) => lower.includes(k));
}

export async function POST(req: Request) {
  const { message, mode: rawMode } = await req.json();
  const mode = rawMode === "auto" ? (isCodeRequest(message) ? "code" : "chat") : rawMode;
  const encoder = new TextEncoder();
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const systemPrompt = mode === "code"
    ? "You are an expert programmer. Detect the language of the user's message and always respond in that same language. When generating code, always use proper formatting with markdown code blocks. Be concise and practical."
    : "Detect the language of the user's message and always respond in that same language. Be helpful, friendly and conversational.";

  const modelLabel = mode === "code" ? "GPT-5.4 Pro (Code)" : "GPT-4.5 (Chat)";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ model: modelLabel })}\n\n`));
        const response = await openai.chat.completions.create({
          model: mode === "code" ? "gpt-5.4-pro" : "gpt-4.5",
          stream: true,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message },
          ],
        });
        for await (const chunk of response) {
          const text = chunk.choices[0]?.delta?.content;
          if (text) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: text })}\n\n`));
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (e) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: `Error: ${(e as Error).message}` })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
  });
}

