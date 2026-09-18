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

// Sonnet 5 thinks before it answers, and that thinking comes out of max_tokens along with any
// web search calls. In practice thinking alone ran 200 to 1000+ tokens on a one-line chat reply,
// so a cap sized for the visible answer (500, 1200) regularly ran out before any text was written:
// the reply came back empty, the spokesperson dropped it, and Huddle went silent. The visible
// length is already controlled by the prompts and capLength, so the cap only needs to be large
// enough that thinking never starves the answer.
const MIN_MAX_TOKENS = 4096;

function textOf(content: any[]) {
  return stripCitations(content.filter((b) => b.type === "text").map((b) => b.text).join("\n"));
}

/** Calls Claude and returns the concatenated text output. */
export async function ask({ model, system, prompt, maxTokens = 1500, webSearch = false }: Opts): Promise<string> {
  const params = {
    model,
    max_tokens: Math.max(maxTokens, MIN_MAX_TOKENS),
    system,
    ...(webSearch
      ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 } as any] }
      : {}),
  };
  const messages: any[] = [{ role: "user", content: prompt }];
  let res = await client.messages.create({ ...params, messages });

  // Server-side web search can pause the turn mid-search. Resume once by sending the partial
  // assistant turn back; the server picks up where it stopped.
  if (res.stop_reason === "pause_turn") {
    messages.push({ role: "assistant", content: res.content });
    res = await client.messages.create({ ...params, messages });
  }

  const text = textOf(res.content);
  if (!text) {
    // Log enough to diagnose the next silent reply without a debugger: what stopped the model,
    // and what it produced instead of text.
    console.warn(
      `[claude] empty reply from ${model}: stop_reason=${res.stop_reason} ` +
      `blocks=[${res.content.map((b: any) => b.type).join(",")}] usage=${JSON.stringify(res.usage)}`
    );
    return "";
  }
  // Hitting max_tokens leaves a sentence chopped mid-word. Drop the partial tail so what
  // reaches the chat is short and complete rather than long and cut off.
  return res.stop_reason === "max_tokens" ? dropPartialTail(text) : text;
}

function dropPartialTail(text: string) {
  const lines = text.split("\n");
  if (lines.length > 1) {
    const kept = lines.slice(0, -1).join("\n").trim();
    if (kept) return kept;
  }
  const cut = Math.max(text.lastIndexOf(". "), text.lastIndexOf("! "), text.lastIndexOf("? "));
  return cut > 0 ? text.slice(0, cut + 1).trim() : text;
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
