import type { InboundMessage, MessagingAdapter } from "./types";

/**
 * Claw Messenger client (https://www.clawmessenger.com/docs).
 * Inbound messages arrive over a persistent WebSocket, so this runs inside the long-lived worker
 * (worker/claw-worker.ts), not inside Vercel functions. Sends go over the same socket.
 */

const WS_URL = process.env.CLAW_WS_URL ?? "wss://claw-messenger.onrender.com/ws";
const REST_URL = process.env.CLAW_REST_URL ?? "https://claw-messenger.onrender.com";
const MAX_BACKOFF_MS = 30_000;
// After this many failures with no successful open, the problem is systemic (service down,
// key revoked, throttled) and fast retries only make it worse. Back off hard instead.
const FAILURES_BEFORE_LONG_WAIT = 8;
const LONG_WAIT_MS = 5 * 60_000;

type SendResult = { type: "send.result"; id: string; ok: boolean; chatId?: string; messageId?: string; error?: string; status?: string; errorCode?: string };
type ClawEvent = { type: string; [k: string]: any };

class ClawClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, (r: SendResult) => void>();
  private backoff = 1000;
  private lastEventAt = new Date();
  private openedAt = Date.now();
  private consecutiveFailures = 0;
  private handlers: ((e: ClawEvent) => void)[] = [];
  private ready: Promise<void> | null = null;
  private keepalive: ReturnType<typeof setInterval> | null = null;

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
        this.openedAt = Date.now();
        this.backoff = 1000;
        this.consecutiveFailures = 0;
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

      ws.onclose = (ev: CloseEvent) => {
        // The close code is the only signal for why Claw dropped us: 1008 or 4001 style codes
        // mean the key was rejected, 1011 means a server fault, 1006 means the socket died
        // without a handshake. Without logging it, a reconnect loop is undiagnosable.
        this.consecutiveFailures++;
        const held = Date.now() - this.openedAt;
        const stuck = this.consecutiveFailures >= FAILURES_BEFORE_LONG_WAIT;
        const wait = stuck ? LONG_WAIT_MS : this.backoff;
        console.warn(
          `[claw] disconnected code=${ev?.code ?? "?"} reason=${JSON.stringify(ev?.reason ?? "")} ` +
          `after ${Math.round(held / 1000)}s, failure ${this.consecutiveFailures}, reconnecting in ${wait}ms` +
          (stuck ? " (backing off hard: the handshake keeps failing, check the Claw dashboard)" : "")
        );
        this.ready = null;
        setTimeout(() => this.connect(), wait);
        // Claw drops connections with 1006 roughly every 17 minutes, and the first few retries
        // after a drop often fail too. A 30s ceiling left Huddle offline and silent while people
        // were mid-conversation, so cap it low: this is a chat product, not a rate-limited API.
        this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
      };
      ws.onerror = () => { /* the close handler takes care of reconnecting; never log the URL, it has the key */ };
    });

    // Keep the connection alive (the server closes sockets idle for 90s).
    // onclose calls connect() again, so this has to be created once or every reconnect
    // leaves another ping timer running against the same socket.
    if (!this.keepalive) {
      this.keepalive = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: "ping" }));
      }, 30_000);
      this.keepalive.unref?.();
    }

    return this.ready;
  }

  async send(payload: { to?: string | string[]; chatId?: string; text: string; replyToMessageId?: string }): Promise<SendResult> {
    await this.connect();
    const id = `huddle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const frame = {
      type: "send",
      id,
      ...(payload.chatId ? { chatId: payload.chatId } : { to: payload.to }),
      parts: [{ type: "text", value: payload.text }],
      ...(payload.replyToMessageId ? { replyTo: { messageId: payload.replyToMessageId } } : {}),
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

/**
 * DM test mode. The Claw free trial registers a single phone number, and a group needs at least two,
 * so there is no way to test the real pipeline over iMessage on a trial account. With DM_TEST_MODE=true
 * a 1:1 chat with Huddle is treated as a one-person group: every agent runs exactly as it would in a
 * real group chat, just with one participant. Leave it off in production.
 */
export const DM_TEST_MODE = process.env.DM_TEST_MODE === "true";

/** A 1:1 chat with no chatId is addressed by phone number instead. */
const DM_PREFIX = "dm:";

export const clawAdapter: MessagingAdapter = {
  name: "claw",
  async sendToGroup(chatId, text, opts) {
    const target = chatId.startsWith(DM_PREFIX) ? { to: chatId.slice(DM_PREFIX.length) } : { chatId };
    let r = await claw.send({ ...target, text, replyToMessageId: opts?.replyToMessageId });
    // A threaded reply Claw refuses (the original bubble is too old or unknown) should still arrive, just unthreaded.
    if (!r.ok && opts?.replyToMessageId) r = await claw.send({ ...target, text });
    if (!r.ok) throw new Error(`Claw send failed: ${r.error ?? r.errorCode ?? r.status}`);
    return { messageId: r.messageId };
  },
};

/**
 * Normalizes a Claw inbound event into a Huddle message.
 * Group messages always go through the planner; DMs only when DM_TEST_MODE is on.
 */
export function parseClawMessage(event: ClawEvent): InboundMessage | null {
  if (event.type !== "message") return null;
  const text = (event.text ?? "").toString().trim();
  if (!text) return null;

  if (!event.isGroup) {
    if (!DM_TEST_MODE || !event.from) return null;
    return {
      provider: "claw",
      groupId: event.chatId ?? `${DM_PREFIX}${event.from}`,
      fromAddress: event.from,
      text,
      providerMessageId: event.messageId,
      replyToMessageId: event.replyTo?.messageId,
    };
  }

  if (!event.chatId) return null;
  return {
    provider: "claw",
    groupId: event.chatId,
    fromAddress: event.from,
    // Claw may or may not include a contact name; take it when it is there
    fromName: event.fromName ?? event.senderName ?? event.contactName ?? event.name ?? undefined,
    text,
    providerMessageId: event.messageId,
    replyToMessageId: event.replyTo?.messageId,
  };
}
