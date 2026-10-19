// POST /api/demo/reopen: the demo organizer opens a fresh Harbour Lights Festival (on sale for six
// hours, its notices in the pinned folder) once its newest demo event has started, sold out or changed,
// or when there is none yet. Refused while the current one is still on sale. Takes no body: nothing a
// visitor sends reaches the call. One at a time, rate-limited; answers the transaction hash or why not.
// Nothing here ever logs or returns the key.

import { sendReopen } from "@/lib/demo-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A read of events_of (retried while Studio is slow), perhaps a faucet payment, and one or two signatures.
export const maxDuration = 60;

export async function POST() {
  const answer = await sendReopen();
  return Response.json(answer.body, { status: answer.status, headers: { "cache-control": "no-store" } });
}
