import { env } from "@laqta/config";

/**
 * The single OpenRouter client for ALL AI in Laqta: image moderation, alt-text
 * captioning, and embeddings. No other AI vendor SDK is introduced anywhere.
 */
const BASE_URL = "https://openrouter.ai/api/v1";

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": env.PUBLIC_WEB_URL,
    "X-Title": "Laqta",
  };
}

export interface ChatImageMessage {
  system: string;
  /** Text portion of the user turn. */
  prompt: string;
  /** Publicly-fetchable image URL (a rendition) for the vision model. */
  imageUrl: string;
}

/**
 * Vision chat completion that returns the model's raw text. Callers that need
 * structured output should request JSON in the prompt and parse via
 * {@link parseJsonFromModel}.
 */
export async function visionChat(
  model: string,
  msg: ChatImageMessage,
): Promise<string> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: msg.system },
        {
          role: "user",
          content: [
            { type: "text", text: msg.prompt },
            { type: "image_url", image_url: { url: msg.imageUrl } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter chat failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter returned no content");
  return content;
}

/** Generate an embedding vector for text via OpenRouter's embeddings endpoint. */
export async function embed(model: string, input: string): Promise<number[]> {
  const res = await fetch(`${BASE_URL}/embeddings`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ model, input }),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter embed failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as {
    data?: { embedding?: number[] }[];
  };
  const vector = data.data?.[0]?.embedding;
  if (!vector) throw new Error("OpenRouter returned no embedding");
  return vector;
}

/** Tolerantly extract a JSON object from a model response (handles code fences). */
export function parseJsonFromModel<T>(raw: string): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`No JSON object found in model output: ${raw.slice(0, 200)}`);
  }
  return JSON.parse(candidate.slice(start, end + 1)) as T;
}
