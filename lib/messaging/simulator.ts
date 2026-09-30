import type { MessagingAdapter } from "./types";

/**
 * Local simulator. Agent messages are already written to the messages table by the pipeline,
 * and the /sim page renders that table in realtime, so sending is a no-op here.
 */
export const simulatorAdapter: MessagingAdapter = {
  name: "simulator",
  async sendToGroup() {
    return {};
  },
};

/**
 * The simulator runs the whole agent pipeline for anyone who can reach /api/sim/send or /api/tick,
 * so it fails closed: never in a production build, and only when MESSAGING_PROVIDER is unset or
 * "simulator". Every simulator-only door checks this one function.
 */
export function simulatorEnabled() {
  if (process.env.NODE_ENV === "production") return false;
  return (process.env.MESSAGING_PROVIDER ?? "simulator") === "simulator";
}
