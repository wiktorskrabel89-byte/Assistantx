export const KNOWLEDGE_EMBEDDING_MODEL = "nomic-ai/nomic-embed-text-v1.5";
export const KNOWLEDGE_EMBEDDING_DIMENSIONS = 768;
export const CHUNK_TARGET_TOKENS = 500;
export const CHUNK_OVERLAP_TOKENS = 80;

// Approximate tokenization by whitespace.
// This is intentionally lightweight and does not match model-specific tokenizers exactly.
function tokenizeApproximately(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

export function chunkTextByApproxTokens(
  text: string,
  chunkSize = CHUNK_TARGET_TOKENS,
  overlap = CHUNK_OVERLAP_TOKENS,
) {
  const tokens = tokenizeApproximately(text);
  if (tokens.length === 0) return [];
  const chunks: Array<{ content: string; tokenCount: number; chunkIndex: number }> = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < tokens.length) {
    const end = Math.min(tokens.length, start + chunkSize);
    const slice = tokens.slice(start, end);
    const content = slice.join(" ").trim();
    if (content.length > 0) {
      chunks.push({
        content,
        tokenCount: slice.length,
        chunkIndex,
      });
      chunkIndex += 1;
    }
    if (end >= tokens.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

export function formatKnowledgeContext(
  chunks: Array<{ file_name?: string; fileName?: string; content: string; similarity?: number }>,
  profileMemories: Array<{ memory_key?: string; memoryKey?: string; memory_value?: string; memoryValue?: string }> = [],
) {
  const memoryLines = profileMemories
    .map((memory) => {
      const key = memory.memory_key ?? memory.memoryKey;
      const value = memory.memory_value ?? memory.memoryValue;
      if (!key || !value) return null;
      return `- ${key}: ${value}`;
    })
    .filter((line): line is string => Boolean(line));

  const chunkLines = chunks.map((chunk, index) => {
    const fileName = chunk.file_name ?? chunk.fileName ?? "uploaded-file";
    const similarity = typeof chunk.similarity === "number" ? ` (similarity ${(chunk.similarity * 100).toFixed(1)}%)` : "";
    return `[${index + 1}] ${fileName}${similarity}\n${chunk.content}`;
  });

  const sections: string[] = [];
  if (memoryLines.length > 0) {
    sections.push(`Known user profile memory:\n${memoryLines.join("\n")}`);
  }
  if (chunkLines.length > 0) {
    sections.push(`Retrieved knowledge snippets:\n${chunkLines.join("\n\n")}`);
  }
  return sections.join("\n\n").trim();
}

export function extractUserProfileFacts(message: string) {
  const text = message.trim();
  if (!text) return [];
  const facts: Array<{ key: string; value: string }> = [];
  const patterns: Array<{ key: string; regex: RegExp }> = [
    { key: "name", regex: /\bmy name is ([^.,!\n]+)/i },
    { key: "location", regex: /\bi (?:live|am living) in ([^.,!\n]+)/i },
    { key: "job", regex: /\bi (?:work|am working) as ([^.,!\n]+)/i },
    { key: "preference", regex: /\bi (?:prefer|like) ([^.,!\n]+)/i },
    { key: "goal", regex: /\bmy goal is to ([^.,!\n]+)/i },
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    const value = match?.[1]?.trim();
    if (!value) continue;
    facts.push({ key: pattern.key, value: value.slice(0, 300) });
  }
  return facts;
}

type EmbeddingResponse = {
  data?: Array<{ embedding?: number[] }>;
};

export async function createOpenRouterEmbedding(input: string) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY");

  const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://assistantx.vercel.app",
      "X-Title": "AssistantX",
    },
    body: JSON.stringify({
      model: KNOWLEDGE_EMBEDDING_MODEL,
      input,
      encoding_format: "float",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenRouter embedding error ${response.status}: ${body}`);
  }

  const payload = (await response.json()) as EmbeddingResponse;
  const embedding = payload.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error("OpenRouter embedding response missing vector");
  }
  if (embedding.length !== KNOWLEDGE_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding dimension mismatch: expected ${KNOWLEDGE_EMBEDDING_DIMENSIONS}, got ${embedding.length}`
    );
  }
  if (!embedding.every((v) => Number.isFinite(v))) {
    throw new Error("Embedding contains non-finite values");
  }
  return embedding;
}

export function toPgVectorLiteral(embedding: number[]) {
  return `[${embedding.map((value) => value.toFixed(7)).join(",")}]`;
}

/**
 * Build the final prompt for the LLM.
 * @param query   User question.
 * @param chunks  Array of retrieved chunks (already token-budgeted).
 *                `source_id` maps to the knowledge file's UUID (`file_id`).
 *
 * The LLM is instructed to return a JSON object of the form:
 *   { "answer": "<text>", "source_ids": ["<file_id>", ...] }
 */
export function buildPrompt(
  query: string,
  chunks: { content: string; source_id: string }[],
) {
  const system =
    `You are a helpful assistant. Answer the question using ONLY the provided excerpts. ` +
    `Cite sources with their IDs. Return JSON: {"answer": "...", "source_ids": [...]}.`;
  const chunkTexts = chunks
    .map((c) => `Excerpt (${c.source_id}):\n${c.content}`)
    .join("\n\n");
  return `${system}\n\nQuestion: ${query}\n\n${chunkTexts}`;
}
