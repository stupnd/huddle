import type { InboundMessage, MessagingAdapter } from "./types";

/**
 * Claw Messenger client (https://www.clawmessenger.com/docs).
 * Inbound messages arrive over a persistent WebSocket, so this runs inside the long-lived worker
 * (worker/claw-worker.ts), not inside Vercel functions. Sends go over the same socket.
 */

const WS_URL = process.env.CLAW_WS_URL ?? "wss://claw-messenger.onrender.com/ws";
const REST_URL = process.env.CLAW_REST_URL ?? "https://claw-messenger.onrender.com";

type SendResult = { type: "send.result"; id: string; ok: boolean; chatId?: string; messageId?: string; error?: string; status?: string; errorCode?: string };
type ClawEvent = { type: string; [k: string]: any };

class ClawClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, (r: SendResult) => void>();
  private backoff = 1000;
  private lastEventAt = new Date();
  private handlers: ((e: ClawEvent) => void)[] = [];
  private ready: Promise<void> | null = null;

  onEvent(fn: (e: ClawEvent) => void) {
    this.handlers.push(fn);
  }

  connect(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve) => {
      const key = process.env.CLAW_API_KEY!;
      const ws = new WebSocket(`${WS_URL}?key=${encodeURIComponent(key)}`);
      this.ws = ws;

      ws.onopen = () => {
        console.log("[claw] connected");
        this.backoff = 1000;
        // Replay anything saved while we were disconnected
        ws.send(JSON.stringify({ type: "sync", since: this.lastEventAt.toISOString() }));
        resolve();
      };

      ws.onmessage = ({ data }) => {
        let event: ClawEvent;
        try { event = JSON.parse(String(data)); } catch { return; }
        if (event.type === "ping") { ws.send(JSON.stringify({ type: "pong" })); return; }
        if (event.type === "send.result") {
          this.pending.get(event.id)?.(event as SendResult);
          this.pending.delete(event.id);
          return;
        }
        if (event.type === "message") this.lastEventAt = new Date();
        for (const h of this.handlers) h(event);
      };

      ws.onclose = () => {
        console.warn(`[claw] disconnected, reconnecting in ${this.backoff}ms`);
        this.ready = null;
        setTimeout(() => this.connect(), this.backoff);
        this.backoff = Math.min(this.backoff * 2, 30_000);
      };
      ws.onerror = () => { /* the close handler takes care of reconnecting; never log the URL, it has the key */ };
    });

    // Keep the connection alive (the server closes sockets idle for 90s)
    setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: "ping" }));
    }, 30_000).unref?.();

    return this.ready;
  }

  async send(payload: { to?: string | string[]; chatId?: string; text: string }): Promise<SendResult> {
    await this.connect();
    const id = `huddle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const frame = {
      type: "send",
      id,
      ...(payload.chatId ? { chatId: payload.chatId } : { to: payload.to }),
      parts: [{ type: "text", value: payload.text }],
    };
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ type: "send.result", id, ok: false, error: "timed out waiting for send.result" });
      }, 20_000);
      this.pending.set(id, (r) => { clearTimeout(timer); resolve(r); });
      this.ws!.send(JSON.stringify(frame));
    });
  }

  async react(messageId: string, reactionType: "love" | "like" | "laugh" | "emphasize" | "question") {
    await this.connect();
    this.ws!.send(JSON.stringify({ type: "reaction", id: `r-${Date.now()}`, messageId, reactionType, remove: false }));
  }

  /** Every friend's phone must be registered before Claw will route their messages to Huddle. */
  async registerNumber(phone: string) {
    const res = await fetch(`${REST_URL}/api/routes`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.CLAW_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ phone_number: phone }),
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok && body.ok !== false, body };
  }
}

export const claw = new ClawClient();

export const clawAdapter: MessagingAdapter = {
  name: "claw",
  async sendToGroup(chatId, text) {
    const r = await claw.send({ chatId, text });
    if (!r.ok) throw new Error(`Claw send failed: ${r.error ?? r.errorCode ?? r.status}`);
  },
};

/** Normalizes a Claw inbound event into a Huddle message. Only group messages go through the planner. */
export function parseClawMessage(event: ClawEvent): InboundMessage | null {
  if (event.type !== "message" || !event.isGroup || !event.chatId) return null;
  const text = (event.text ?? "").toString().trim();
  if (!text) return null;
  return {
    provider: "claw",
    groupId: event.chatId,
    fromAddress: event.from,
    text,
    providerMessageId: event.messageId,
  };
}
