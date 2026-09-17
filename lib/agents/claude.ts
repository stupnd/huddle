import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const MODELS = {
  listener: process.env.LISTENER_MODEL ?? "claude-haiku-4-5-20251001",
  agent: process.env.AGENT_MODEL ?? "claude-sonnet-5",
};

type Opts = { model: string; system: string; prompt: string; maxTokens?: number; webSearch?: boolean };

/** Web search answers can carry inline citation markup, which must never reach the chat or the dashboard. */
function stripCitations(text: string) {
  return text
    .replace(/[<(]\s*cite\b[^>]*>/gi, "")
    .replace(/<\/\s*cite\s*>/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Calls Claude and returns the concatenated text output. */
export async function ask({ model, system, prompt, maxTokens = 1500, webSearch = false }: Opts): Promise<string> {
  const res = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: prompt }],
    ...(webSearch
      ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 } as any] }
      : {}),
  });
  return stripCitations(
    res.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n")
  );
}

/** Calls Claude and parses a JSON object out of the reply. Returns fallback on failure. */
export async function askJSON<T>(opts: Opts, fallback: T): Promise<T> {
  try {
    const text = await ask(opts);
    const cleaned = text.replace(/```json|```/g, "");
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) return fallback;
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch (err) {
    console.error("askJSON failed", err);
    return fallback;
  }
}
