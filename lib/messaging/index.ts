import { clawAdapter } from "./claw";
import { sendblueAdapter } from "./sendblue";
import { simulatorAdapter } from "./simulator";
import type { MessagingAdapter } from "./types";

export function adapterFor(provider: string): MessagingAdapter {
  if (provider === "claw") return clawAdapter;
  if (provider === "sendblue") return sendblueAdapter;
  return simulatorAdapter;
}
export * from "./types";
