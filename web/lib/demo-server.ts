// The demo organizer, server side only (imported by app/api/demo/*). It holds a throwaway Studio test
// key from the DEMO_ORGANIZER_KEY environment variable and signs exactly three kinds of call with it:
// open_event() for a fresh Harbour Lights Festival once the last one started, sold out or changed,
// deposit() to keep its own review credit, and review() of one of its SIX fixed notice pages on its own
// demo event, at the address pinned to one commit (lib/demo-event.ts). Nothing a visitor types is ever
// signed: a request names an event id and a notice key, and the server checks both against a fresh
// read. The key is never logged, never returned and never written anywhere; an answer names the
// organizer's public address at most.

import { createAccount, createClient } from "genlayer-js";
import { getAddress, type Address } from "viem";

import { balanceOf, calls, contractAddress, isMock, readCredit, readEvent, readEventsOf, readReviewsWindow, studio } from "./chain";
import { REPO_URL, noticesCommit } from "./config";
import { cleanKey, keyProblem } from "./demo-key";
import { DEMO_LIMITS, createLimiter } from "./demo-limit";
import {
  DEMO_CAPACITY,
  DEMO_CREDIT_LOW,
  DEMO_CREDIT_TOP_UP,
  DEMO_EVENT_NAME,
  DEMO_LEAD,
  DEMO_PRICE,
  DEMO_TERMS_JSON,
  baseProblem,
  demoNoticeProblem,
  demoStateOf,
  isBotNoticeKey,
  noticeOf,
  noticesBase,
  reopenProblem,
  repoOf,
} from "./demo-event";
import { idNumber, PAGE } from "./rules";
import { FINAL_STATUSES, rpc, sleep, statusName, type RawTx } from "./rpc";
import type { Call, DemoStatus, EventRow } from "./types";

type Account = ReturnType<typeof createAccount>;
let account: { key: string; value: Account } | null = null;

/** The demo organizer's account, or null when no usable key is configured. */
function demoAccount(): Account | null {
  const raw = process.env.DEMO_ORGANIZER_KEY;
  if (keyProblem(raw)) return null;
  const key = cleanKey(raw);
  if (!account || account.key !== key) account = { key, value: createAccount(key as `0x${string}`) };
  return account.value;
}

export const NO_CONTRACT_REASON = "the contract is not deployed yet";
export const RPC_DOWN = "Studio's RPC did not answer; try again in a minute";
export const NO_BALANCE = "the demo organizer's account holds no GEN and Studio's faucet did not top it up";
export const NO_COMMIT = "the demo notices are not pinned to a commit yet (NOTICES_COMMIT in lib/config.ts, or NEXT_PUBLIC_NOTICES_COMMIT)";
export const NO_REPO = "the site does not know its public repository (NEXT_PUBLIC_REPO_URL), so it cannot build the notices' addresses";

/** Whether the demo event's pinned notices folder can be built, and what it is. */
export function noticesState(): { notices: boolean; noticesReason: string; prefix: string } {
  if (!noticesCommit()) return { notices: false, noticesReason: NO_COMMIT, prefix: "" };
  const repo = repoOf(REPO_URL);
  if (!repo) return { notices: false, noticesReason: NO_REPO, prefix: "" };
  const base = noticesBase(repo, noticesCommit());
  const problem = baseProblem(base);
  if (problem) return { notices: false, noticesReason: problem, prefix: "" };
  return { notices: true, noticesReason: "", prefix: base };
}

// The newest demo event is read once and kept for a minute; a reopen forgets it.
let found: { contract: string; organizer: string; event: EventRow | null; at: number } | null = null;

/** The newest event this key opened under the demo name, or null when it has none. */
async function newestDemoEvent(organizer: string, fresh = false): Promise<EventRow | null> {
  const contract = contractAddress().toLowerCase();
  if (!fresh && found && found.contract === contract && found.organizer === organizer && Date.now() - found.at < 60_000) return found.event;
  const first = (await readEventsOf(organizer, 0, PAGE, { fresh: true })).data;
  const rows = first.total > PAGE ? (await readEventsOf(organizer, first.total - PAGE, PAGE, { fresh: true })).data.rows : first.rows;
  const mine = rows.filter((r) => r.name === DEMO_EVENT_NAME).sort((a, b) => idNumber(b.id) - idNumber(a.id));
  const event = mine[0] ?? null;
  found = { contract, organizer, event, at: Date.now() };
  return event;
}

/** The demo key signs from its own balance; Studio's faucet refills it when it holds less than a GEN. */
async function ensureBalance(organizer: string): Promise<boolean> {
  const have = await balanceOf(organizer);
  if (have >= 10n ** 18n) return true;
  try {
    await rpc("sim_fundAccount", { account_address: getAddress(organizer), amount: 20e18 });
  } catch {
    return have > 0n;
  }
  for (let i = 0; i < 6; i++) {
    await sleep(2000);
    try {
      if ((await balanceOf(organizer)) > have) return true;
    } catch {
      /* one dropped read; ask again */
    }
  }
  return have > 0n;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Whether the demo organizer can act now, which event it runs and where that stands, and exactly why not. */
export async function demoStatusNow(): Promise<DemoStatus> {
  const pinned = noticesState();
  const off = (organizer: string, reason: string): DemoStatus => ({ online: false, organizer, event: "", eventState: "none", reason, ...pinned });
  if (isMock) return off("", "in the demo build the demo organizer answers in the browser");
  const problem = keyProblem(process.env.DEMO_ORGANIZER_KEY);
  if (problem) return off("", problem);
  const organizer = demoAccount()!.address.toLowerCase();
  if (!contractAddress()) return off(organizer, NO_CONTRACT_REASON);
  if (!pinned.notices) return off(organizer, pinned.noticesReason);
  let funded = false;
  try {
    funded = await ensureBalance(organizer);
  } catch {
    return off(organizer, RPC_DOWN);
  }
  if (!funded) return off(organizer, NO_BALANCE);
  let event: EventRow | null = null;
  try {
    event = await newestDemoEvent(organizer);
  } catch {
    return off(organizer, RPC_DOWN);
  }
  return { online: true, organizer, event: event?.id ?? "", eventState: demoStateOf(event, nowSeconds()), reason: "", ...pinned };
}

const limiter = createLimiter(DEMO_LIMITS);

// One transaction at a time per event (and one reopen at a time): the hash of the last one, until it is final.
const inflight = new Map<string, { hash: string; at: number }>();

async function isFinal(hash: string): Promise<boolean> {
  try {
    const tx = await rpc<RawTx | null>("eth_getTransactionByHash", [hash]);
    return !!tx && FINAL_STATUSES.has(statusName(tx.status));
  } catch {
    return false;
  }
}

/** True while the demo organizer's last transaction on `key` is still going through. */
async function stillMoving(key: string): Promise<boolean> {
  const last = inflight.get(key);
  if (!last) return false;
  if (Date.now() - last.at > DEMO_LIMITS.sentHoldMs || (await isFinal(last.hash))) {
    inflight.delete(key);
    return false;
  }
  return true;
}

// One signature at a time: two transactions signed at once would ask for the same nonce.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

async function sign(call: Call): Promise<string> {
  const a = demoAccount()!;
  const hash = await serial(async () => {
    const client = createClient({ chain: studio, account: a });
    return client.writeContract({ address: contractAddress() as Address, functionName: call.fn, args: call.args, value: call.value ?? 0n });
  });
  if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("no hash");
  return hash;
}

/** Tops the demo organizer's review credit up when it runs low, and waits (briefly) until the deposit is accepted. */
async function ensureCredit(organizer: string, wait: boolean): Promise<boolean> {
  const have = BigInt((await readCredit(organizer, { fresh: true })).data.creditAtto);
  if (have >= DEMO_CREDIT_LOW) return true;
  const hash = await sign(calls.deposit(DEMO_CREDIT_TOP_UP));
  if (!wait) return true;
  for (let i = 0; i < 12; i++) {
    await sleep(2500);
    try {
      const tx = await rpc<RawTx | null>("eth_getTransactionByHash", [hash]);
      const s = statusName(tx?.status);
      if (s === "ACCEPTED" || s === "FINALIZED") return true;
    } catch {
      /* one dropped read; ask again */
    }
  }
  return false;
}

export type ServerAnswer = { status: number; body: { ok: true; hash: string } | { ok: false; reason: string; retryAfter?: number } };

const refused = (status: number, reason: string, retryAfter?: number): ServerAnswer => ({ status, body: retryAfter ? { ok: false, reason, retryAfter } : { ok: false, reason } });

/**
 * The demo organizer announces one of its six fixed notices on its own demo event: it asks the network
 * to read that pinned page, from its own review credit.
 */
export async function sendNotice(event: string, key: string): Promise<ServerAnswer> {
  if (!isBotNoticeKey(key)) return refused(400, "the demo organizer announces only what its buttons say");
  const s = await demoStatusNow();
  if (!s.online) return refused(503, "the demo organizer is offline: " + s.reason);
  const turn = limiter.attempt("notice:" + event, Date.now());
  if (!turn.ok) return refused(429, `the demo organizer was asked about ${event} a moment ago; try again in ${turn.retryAfter} s`, turn.retryAfter);
  if (await stillMoving(event)) return refused(409, `the demo organizer is still waiting for its last transaction on ${event} to be final; try again once it is`);
  let row: EventRow | null;
  let before: { id: string; url: string; finding: string }[];
  try {
    row = (await readEvent(event, { fresh: true })).data;
    before = row ? (await readReviewsWindow(event, 3, { fresh: true })).data.rows.map((r) => ({ id: r.id, url: r.url, finding: r.finding })) : [];
  } catch {
    return refused(502, "could not read the event from Studio; try again in a minute");
  }
  const problem = demoNoticeProblem(row ? { ...row } : null, s.event, key, before, nowSeconds());
  if (problem) return refused(row ? 409 : 404, problem);
  try {
    if (!(await ensureCredit(s.organizer, true))) return refused(503, "the demo organizer is adding review credit; press the notice again in a minute");
    const hash = await sign(calls.review(event, s.prefix + noticeOf(key)!.file));
    inflight.set(event, { hash, at: Date.now() });
    return { status: 200, body: { ok: true, hash } };
  } catch {
    // Nothing of the error goes out: it is the network's, and it is not the visitor's business.
    return refused(502, "Studio did not take the demo organizer's transaction; try again in a minute");
  }
}

/** The demo organizer opens a fresh demo event, once its newest one started, sold out or changed (or there is none). */
export async function sendReopen(): Promise<ServerAnswer> {
  const s = await demoStatusNow();
  if (!s.online) return refused(503, "the demo organizer is offline: " + s.reason);
  const turn = limiter.attempt("reopen", Date.now());
  if (!turn.ok) return refused(429, `a fresh demo event was asked for a moment ago; try again in ${turn.retryAfter} s`, turn.retryAfter);
  if (await stillMoving("open")) return refused(409, "the demo organizer is still opening the next demo event; it is on its way");
  let newest: EventRow | null;
  try {
    newest = await newestDemoEvent(s.organizer, true);
  } catch {
    return refused(502, "could not read the demo organizer's events from Studio; try again in a minute");
  }
  const problem = reopenProblem(newest, nowSeconds());
  if (problem) return refused(409, problem);
  try {
    const hash = await sign(calls.openEvent(DEMO_EVENT_NAME, DEMO_TERMS_JSON, s.prefix, DEMO_PRICE, DEMO_CAPACITY, nowSeconds() + DEMO_LEAD));
    inflight.set("open", { hash, at: Date.now() });
    found = null;
    // Its notice buttons pay from its own credit: top it up now, without waiting.
    await ensureCredit(s.organizer, false).catch(() => false);
    return { status: 200, body: { ok: true, hash } };
  } catch {
    return refused(502, "Studio did not take the demo organizer's transaction; try again in a minute");
  }
}
