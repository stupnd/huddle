import { NextResponse } from "next/server";
import { handleInbound } from "@/lib/pipeline";

export const maxDuration = 60;

export async function POST(req: Request) {
  if ((process.env.MESSAGING_PROVIDER ?? "simulator") !== "simulator") {
    return NextResponse.json({ error: "The simulator only runs when MESSAGING_PROVIDER=simulator" }, { status: 403 });
  }
  const { groupId, from, name, text } = await req.json();
  if (!groupId || !from || !text) return NextResponse.json({ error: "groupId, from, and text are required" }, { status: 400 });
  const result = await handleInbound({ provider: "simulator", groupId, fromAddress: from, fromName: name, text });
  return NextResponse.json(result);
}
