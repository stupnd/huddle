import type { InboundMessage, MessagingAdapter } from "./types";

const API = "https://api.sendblue.co/api";

function headers() {
  return {
    "sb-api-key-id": process.env.SENDBLUE_API_KEY_ID!,
    "sb-api-secret-key": process.env.SENDBLUE_API_SECRET_KEY!,
    "content-type": "application/json",
  };
}

export const sendblueAdapter: MessagingAdapter = {
  name: "sendblue",
  async sendToGroup(groupId, text) {
    const res = await fetch(`${API}/send-group-message`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        group_id: groupId,
        from_number: process.env.SENDBLUE_FROM_NUMBER,
        content: text,
      }),
    });
    if (!res.ok) {
      throw new Error(`Sendblue send failed: ${res.status} ${await res.text()}`);
    }
  },
};

/**
 * Normalize Sendblue's receive webhook. Field names follow Sendblue's docs at time of writing
 * (content, from_number, group_id, is_outbound). Verify against a real payload once group access is enabled.
 */
export function parseSendblueWebhook(body: any): InboundMessage | null {
  if (!body || body.is_outbound) return null;
  if (!body.group_id) return null; // Huddle only works in group chats
  const text = (body.content ?? "").toString().trim();
  if (!text) return null;
  return {
    provider: "sendblue",
    groupId: body.group_id,
    fromAddress: body.from_number,
    text,
  };
}
