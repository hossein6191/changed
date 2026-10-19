// GET /api/demo/status: whether the demo organizer can act now, its public address, the demo event it
// runs and where that event stands (open, started, sold_out, changed, or none yet), and exactly why not
// when it cannot: "no key set", "the key set is not a 0x private key of 64 hex characters", "the
// contract is not deployed yet", the notices not pinned to a commit of a known repository, Studio's RPC
// not answering, or no GEN on its account. `notices` and `prefix` say whether, and where, its pinned
// notices are. The key itself is never echoed.

import { demoStatusNow } from "@/lib/demo-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A balance read (perhaps a faucet payment) and one or two reads of events_of, retried while Studio is slow.
export const maxDuration = 60;

export async function GET() {
  return Response.json(await demoStatusNow(), { headers: { "cache-control": "no-store" } });
}
