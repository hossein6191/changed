// POST /api/demo/notice {event, notice}: the demo organizer announces ONE of its six fixed notices on
// its own demo event: "doors-later", "new-support", "new-date", "new-venue", "headliner" or
// "cancelled". It asks the network to read that page, pinned to one commit, from its own review credit,
// so a visitor needs no credit to see a reading. The notice is a key into that list and the event must
// be the demo event; no text from the visitor is ever signed. A notice already read for the event is
// refused (it would only be a repeat). One transaction at a time per event, rate-limited; answers the
// transaction hash or why not. Nothing here ever logs or returns the key.

import { BOT_NOTICE_KEYS, isBotNoticeKey } from "@/lib/demo-event";
import { sendNotice } from "@/lib/demo-server";
import { parseEventId } from "@/lib/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Two reads (retried while Studio is slow), perhaps a faucet payment and a credit top-up, and one signature.
export const maxDuration = 60;

const noStore = { "cache-control": "no-store" };

export async function POST(request: Request) {
  let id = "";
  let notice = "";
  try {
    const text = await request.text();
    if (text.length > 200) throw new Error("too long");
    const body = JSON.parse(text) as { event?: unknown; notice?: unknown };
    id = typeof body.event === "string" ? parseEventId(body.event) : "";
    notice = typeof body.notice === "string" && isBotNoticeKey(body.notice) ? body.notice : "";
  } catch {
    id = "";
  }
  if (!id || !notice) return Response.json({ ok: false, reason: `send {"event": "E1", "notice": one of ${BOT_NOTICE_KEYS.join(", ")}}` }, { status: 400, headers: noStore });
  const answer = await sendNotice(id, notice);
  return Response.json(answer.body, { status: answer.status, headers: noStore });
}
