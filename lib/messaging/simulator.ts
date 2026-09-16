import type { MessagingAdapter } from "./types";

/**
 * Local simulator. Agent messages are already written to the messages table by the pipeline,
 * and the /sim page renders that table in realtime, so sending is a no-op here.
 */
export const simulatorAdapter: MessagingAdapter = {
  name: "simulator",
  async sendToGroup() {
    return;
  },
};
