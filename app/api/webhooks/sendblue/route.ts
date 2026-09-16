import { NextResponse } from "next/server";
import { parseSendblueWebhook } from "@/lib/messaging/sendblue";
import { handleInbound } from "@/lib/pipeline";

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const msg = parseSendblueWebhook(body);
  if (!msg) return NextResponse.json({ ok: true, ignored: true });
  try {
    const result = await handleInbound(msg);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error(err);
    // Always 200 so Sendblue does not retry and double-process the message
    return NextResponse.json({ ok: false });
  }
}
