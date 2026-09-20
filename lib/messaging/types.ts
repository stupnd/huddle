export type Provider = "simulator" | "sendblue" | "claw";

/** A normalized inbound group message, whatever provider it came from. */
export type InboundMessage = {
  provider: Provider;
  groupId: string;
  fromAddress: string;
  fromName?: string;
  text: string;
  providerMessageId?: string;
  /** The message this one was a threaded reply to, when the provider says so. */
  replyToMessageId?: string;
};

export type SendOptions = {
  /** Post as a threaded reply to this provider message id. Ignored by providers that cannot thread. */
  replyToMessageId?: string;
};

/** What a send hands back. messageId is the provider's id for the bubble we just posted, when it gives one. */
export type SendResult = { messageId?: string };

/** Every messaging provider implements this. Swapping providers means writing one of these. */
export interface MessagingAdapter {
  name: Provider;
  sendToGroup(groupId: string, text: string, opts?: SendOptions): Promise<SendResult>;
}
