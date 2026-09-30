import { NextResponse } from "next/server";
import { handleInbound } from "@/lib/pipeline";
import { simulatorEnabled } from "@/lib/messaging/simulator";

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!simulatorEnabled()) {
    return NextResponse.json({ error: "The simulator only runs in development with MESSAGING_PROVIDER=simulator" }, { status: 403 });
  }
  const { groupId, from, name, text } = await req.json();
  if (!groupId || !from || !text) return NextResponse.json({ error: "groupId, from, and text are required" }, { status: 400 });
  const result = await handleInbound({ provider: "simulator", groupId, fromAddress: from, fromName: name, text });
  return NextResponse.json(result);
}
