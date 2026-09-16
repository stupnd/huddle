export type Provider = "simulator" | "sendblue" | "claw";

/** A normalized inbound group message, whatever provider it came from. */
export type InboundMessage = {
  provider: Provider;
  groupId: string;
  fromAddress: string;
  fromName?: string;
  text: string;
  providerMessageId?: string;
};

/** Every messaging provider implements this. Swapping providers means writing one of these. */
export interface MessagingAdapter {
  name: Provider;
  sendToGroup(groupId: string, text: string): Promise<void>;
}
