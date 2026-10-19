// Chain access for Changed: the ONE file that knows the contract's interface.
//
// Every method name, argument order, view shape and outcome word of contracts/changed.py that the site
// depends on is written here and nowhere else. Pages import typed reads, typed call builders and mapped
// outcomes from this module; when the contract's interface changes, this is the file to edit, with
// lib/chain-mock.ts, which stands in for the contract in mock mode and answers in the contract's own
// JSON so the mappers below run in both modes.
//
// Reads go through readContract (gen_call) with the retry policy in lib/rpc.ts: eight tries over
// about forty seconds, because Studio answers "Contract not found" for a healthy contract for about a
// minute after a deploy. A failed read is never "no data" and never proof that a write failed. Studio
// allows 30 gen_call a minute from one browser (the faucet shares them), so every view answer is
// cached for 30 s, two components asking for the same view share one request, and invalidateReads()
// drops the cache once a transaction is final. Every view here takes a short id, two small numbers or
// one address, and no list is ever asked for more than PAGE rows.

import * as mock from "./chain-mock";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { getAddress, type Address } from "viem";
import { notify } from "./browser-store";
import { contractAddress, demoEventFallback } from "./config";
import { RATE_LIMITED, createReadCache, decodeTx, isMissingMethodError, noteFailure, rpc, sleep, waitForCooldown, withRetry, type RawTx } from "./rpc";
import { EVENT_STATUSES, FEE_TO, FINDINGS, PAGE, PHASES, TICKET_STATUSES, idNumber, sentence, type ChangedBy, type EventStatus, type FeeTo, type Finding, type Phase, type TicketStatus } from "./rules";
import type { Arg, Call, Credit, DemoAnswer, DemoEventState, DemoStatus, EventRecord, EventRow, Paged, ReadResult, Review, Rules, Stats, Ticket, TxStatus, WriteFn } from "./types";
import { chainName, getChainId, getSigner } from "./wallet";

export { RATE_LIMITED, cooldownRemainingMs } from "./rpc";
export { contractAddress };

export const CHAIN_ID = 61999;
export const RPC_URL = "https://studio.genlayer.com/api";
export const EXPLORER_URL = "https://explorer-studio.genlayer.com";

export const isMock = process.env.NEXT_PUBLIC_MOCK === "1";

export const NETWORK_ERROR = "could not reach the network";
/** Thrown by reads while the site has no contract address. */
export const NO_CONTRACT = "the contract is not deployed yet";
/** What the faucet says when Studio refused sim_fundAccount three times. */
export const FAUCET_REFUSED = "Studio refused the faucet request (it allows 30 requests a minute from one browser). Try again in a minute.";

/** True when this site has a contract to read: always in mock mode. */
export const hasContract = (): boolean => isMock || !!contractAddress();

/** The contract the explorer links point at. */
export const contractInUse = (): string => (isMock ? mock.MOCK_CONTRACT : contractAddress());

// ---- low-level view access ------------------------------------------------------------------------

// The SDK's studionet object carries another explorer URL; the RPC and explorer hosts are set here.
export const studio = {
  ...studionet,
  rpcUrls: { ...studionet.rpcUrls, default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "GenLayer Studio Explorer", url: EXPLORER_URL } },
};

const reader = () => createClient({ chain: studio });

type Row = Record<string, unknown>;

const num = (v: unknown, dflt = 0): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : dflt;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string" && /^-?\d+$/.test(v.trim())) return Number(v);
  return dflt;
};
const str = (v: unknown, dflt = ""): string => (v === undefined || v === null ? dflt : String(v));
const atto = (v: unknown): string => {
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? BigInt(Math.trunc(v)).toString() : "0";
  const s = str(v, "0").trim();
  return /^\d+$/.test(s) ? s : "0";
};
const addr = (v: unknown): string => str(v).toLowerCase();
/** Seconds; the contract writes -1 or 0 when a call had no readable clock. */
const secs = (v: unknown): number => Math.max(0, num(v));
const asRow = (v: unknown): Row => (v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : {});
const rowsOf = (v: unknown): Row[] => (Array.isArray(v) ? v.filter((r): r is Row => !!r && typeof r === "object" && !Array.isArray(r)) : []);
const oneOf = <T extends string>(list: readonly T[], v: unknown, dflt: T): T => (list.includes(str(v) as T) ? (str(v) as T) : dflt);

/** A view returns a JSON string; parse it. Some decoders already hand back the object. */
function parseView(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

/** How long a view answer is reused. */
export const READ_TTL_MS = 30_000;
const onServer = typeof window === "undefined";
const views = createReadCache<unknown>(onServer ? 0 : READ_TTL_MS);

let moved = 0;
/** How many times the chain has moved under this page (a final transaction, a faucet payment): a stable snapshot. */
export const chainVersion = (): number => moved;

/** Forget every cached view answer, and tell the lists on screen to read again. Called once a transaction is final or the faucet paid. */
export const invalidateReads = () => {
  views.clear();
  moved++;
  notify();
};

/**
 * One view call through the cache. Throws RATE_LIMITED when Studio is rate-limiting this browser,
 * NO_CONTRACT when no contract is set, and the plain network error when Studio never answered.
 */
async function view(fn: string, args: Arg[] = [], opts: { fresh?: boolean } = {}): Promise<unknown> {
  if (isMock) return parseView(await mock.view(fn, args));
  const address = contractAddress();
  if (!address) throw new Error(NO_CONTRACT);
  const key = `${address.toLowerCase()}|${fn}|${JSON.stringify(args)}`;
  if (opts.fresh) views.forget(key);
  try {
    const raw = await views.get(key, () =>
      withRetry(() => reader().readContract({ address: address as Address, functionName: fn, args }), {
        bucket: "gen",
        giveUp: isMissingMethodError,
      }),
    );
    return parseView(raw);
  } catch (e) {
    if (e instanceof Error && e.message === RATE_LIMITED) throw e;
    throw new Error(NETWORK_ERROR);
  }
}

const SOURCE: ReadResult<unknown>["source"] = isMock ? "mock" : "chain";
const result = <T>(data: T): ReadResult<T> => ({ data, source: SOURCE });

// ---- row mappers (every missing field gets a default) -----------------------------------------------

const fp = (v: unknown): string => (/^[0-9a-f]{16}$/.test(str(v)) ? str(v) : "");
const changedBy = (v: unknown): ChangedBy => (str(v) === "review" ? "review" : str(v) === "organizer" ? "organizer" : "");

export function mapRecord(r: Row): EventRecord {
  return {
    refunded: num(r.refunded),
    refundedAtto: atto(r.refunded_value),
    settled: num(r.settled),
    settledAtto: atto(r.settled_value),
    reviews: num(r.reviews),
    material: num(r.material),
    minor: num(r.minor),
    unclear: num(r.unclear),
    repeats: num(r.repeats),
    feesWonAtto: atto(r.fees_won),
  };
}

export function mapEvent(r: Row, id = ""): EventRow {
  const terms = asRow(r.terms);
  return {
    id: str(r.event ?? id),
    organizer: addr(r.organizer),
    name: str(r.name),
    date: str(terms.date),
    venue: str(terms.venue),
    mainAct: str(terms.main_act),
    details: str(terms.details),
    sitePrefix: str(r.site_prefix),
    priceAtto: atto(r.price),
    capacity: num(r.capacity),
    sold: num(r.sold),
    left: num(r.left),
    startsAt: secs(r.starts_at),
    openedAt: secs(r.opened_at),
    status: oneOf<EventStatus>(EVENT_STATUSES, r.status, "on"),
    changedBy: changedBy(r.changed_by),
    changedAt: secs(r.changed_at),
    changeReview: str(r.change_review),
    heldAtto: atto(r.held),
    reviewUntil: secs(r.review_until),
    settleFrom: secs(r.settle_from),
    refundUntil: secs(r.refund_until),
    record: mapRecord(asRow(r.record)),
    now: secs(r.now),
    phase: oneOf<Phase>(PHASES, r.phase, "unknown"),
  };
}

export function mapTicket(r: Row, id = ""): Ticket {
  return {
    id: str(r.ticket ?? id),
    event: str(r.event),
    eventName: str(r.event_name),
    eventStatus: oneOf<EventStatus>(EVENT_STATUSES, r.event_status, "on"),
    holder: addr(r.holder),
    n: num(r.n),
    priceAtto: atto(r.price),
    boughtAt: secs(r.bought_at),
    status: oneOf<TicketStatus>(TICKET_STATUSES, r.status, "valid"),
    closedAt: secs(r.closed_at),
    startsAt: secs(r.starts_at),
  };
}

export function mapReview(r: Row): Review {
  return {
    id: str(r.review),
    event: str(r.event),
    reviewer: addr(r.reviewer),
    url: str(r.url),
    finding: oneOf<Finding>(FINDINGS, r.finding, "unclear"),
    fp: fp(r.fp),
    repeatOf: str(r.repeat_of),
    feeTo: oneOf<FeeTo>(FEE_TO, r.fee_to, "organizer"),
    holder: r.holder === true,
    at: secs(r.at),
  };
}

export function mapStats(r: Row): Stats {
  return {
    events: num(r.events),
    changed: num(r.changed),
    changedByReview: num(r.changed_by_review),
    cancelled: num(r.cancelled),
    tickets: num(r.tickets),
    refunded: num(r.refunded),
    settled: num(r.settled),
    reviews: num(r.reviews),
    material: num(r.material),
    minor: num(r.minor),
    unclear: num(r.unclear),
    repeats: num(r.repeats),
    heldAtto: atto(r.held),
    salesAtto: atto(r.sales),
    refundedAtto: atto(r.refunded_total),
    toOrganizersAtto: atto(r.to_organizers),
    creditAtto: atto(r.credit),
    depositedAtto: atto(r.deposited),
    creditOutAtto: atto(r.credit_out),
    feesAtto: atto(r.fees),
    refusedPayments: num(r.refused_payments),
    returnedAtto: atto(r.returned),
  };
}

const paged = <T>(value: Row, map: (r: Row) => T): Paged<T> => {
  if (!Array.isArray(value.rows)) throw new Error(NETWORK_ERROR);
  return { total: num(value.total), offset: num(value.offset), limit: num(value.limit, PAGE), rows: rowsOf(value.rows).map(map) };
};

// ---- reads: one function per view ---------------------------------------------------------------------

type Fresh = { fresh?: boolean };
const pageArgs = (offset: number, limit: number): [number, number] => [Math.max(0, Math.trunc(offset)), Math.max(1, Math.min(PAGE, Math.trunc(limit)))];

/** event(id): null when the contract holds no such event. */
export async function readEvent(id: string, opts: Fresh = {}): Promise<ReadResult<EventRow | null>> {
  const value = asRow(await view("event", [id], opts));
  if ("error" in value || !value.organizer) return result(null);
  return result(mapEvent(value, id));
}

/** events(offset, limit): one page of every event, oldest first. */
export async function readEvents(offset = 0, limit = PAGE, opts: Fresh = {}): Promise<ReadResult<Paged<EventRow>>> {
  return result(paged(asRow(await view("events", pageArgs(offset, limit), opts)), (r) => mapEvent(r)));
}

/** events_of(address, offset, limit): one page of the events an address opened. */
export async function readEventsOf(address: string, offset = 0, limit = PAGE, opts: Fresh = {}): Promise<ReadResult<Paged<EventRow>>> {
  return result(paged(asRow(await view("events_of", [address.toLowerCase(), ...pageArgs(offset, limit)], opts)), (r) => mapEvent(r)));
}

/** ticket(id): null when there is no such ticket. */
export async function readTicket(id: string, opts: Fresh = {}): Promise<ReadResult<Ticket | null>> {
  const value = asRow(await view("ticket", [id], opts));
  if ("error" in value || !value.holder) return result(null);
  return result(mapTicket(value, id));
}

/** tickets_of(address, offset, limit): one page of the tickets an address bought. */
export async function readTicketsOf(address: string, offset = 0, limit = PAGE, opts: Fresh = {}): Promise<ReadResult<Paged<Ticket>>> {
  return result(paged(asRow(await view("tickets_of", [address.toLowerCase(), ...pageArgs(offset, limit)], opts)), (r) => mapTicket(r)));
}

/** event_tickets(event, offset, limit): one page of an event's tickets, in the order they were bought. */
export async function readEventTickets(event: string, offset = 0, limit = PAGE, opts: Fresh = {}): Promise<ReadResult<Paged<Ticket>>> {
  return result(paged(asRow(await view("event_tickets", [event, ...pageArgs(offset, limit)], opts)), (r) => mapTicket(r)));
}

/** reviews_of(event, offset, limit): one page of an event's reviews, oldest first. */
export async function readReviews(event: string, offset = 0, limit = PAGE, opts: Fresh = {}): Promise<ReadResult<Paged<Review>>> {
  return result(paged(asRow(await view("reviews_of", [event, ...pageArgs(offset, limit)], opts)), mapReview));
}

/** credit(address): an address's review credit and how many reviews it pays for. */
export async function readCredit(address: string, opts: Fresh = {}): Promise<ReadResult<Credit>> {
  const r = asRow(await view("credit", [address.toLowerCase()], opts));
  if ("error" in r) throw new Error(NETWORK_ERROR);
  return result({ address: addr(r.address), creditAtto: atto(r.credit), reviewFeeAtto: atto(r.review_fee), reviews: num(r.reviews) });
}

/** The newest rows of a paged list first: the first page says how many there are, then the newest pages down to `maxPages`. */
async function newestFirst<T extends { id: string }>(read: (offset: number) => Promise<Paged<T>>, maxPages: number): Promise<{ total: number; rows: T[]; partial: boolean }> {
  const first = await read(0);
  const pages = Math.ceil(first.total / PAGE);
  const rows = [...first.rows];
  for (let p = pages - 1, k = 1; p >= 1 && k < maxPages; p--, k++) rows.push(...(await read(p * PAGE)).rows);
  const unique = new Map(rows.map((r) => [r.id, r]));
  return { total: first.total, rows: [...unique.values()].sort((a, b) => idNumber(b.id) - idNumber(a.id)), partial: pages > maxPages };
}

export type Window<T> = { total: number; rows: T[]; partial: boolean };

export async function readEventsWindow(maxPages = 3, opts: Fresh = {}): Promise<ReadResult<Window<EventRow>>> {
  return result(await newestFirst(async (o) => (await readEvents(o, PAGE, opts)).data, maxPages));
}

export async function readEventsOfWindow(address: string, maxPages = 3, opts: Fresh = {}): Promise<ReadResult<Window<EventRow>>> {
  return result(await newestFirst(async (o) => (await readEventsOf(address, o, PAGE, opts)).data, maxPages));
}

export async function readTicketsOfWindow(address: string, maxPages = 3, opts: Fresh = {}): Promise<ReadResult<Window<Ticket>>> {
  return result(await newestFirst(async (o) => (await readTicketsOf(address, o, PAGE, opts)).data, maxPages));
}

export async function readEventTicketsWindow(event: string, maxPages = 2, opts: Fresh = {}): Promise<ReadResult<Window<Ticket>>> {
  return result(await newestFirst(async (o) => (await readEventTickets(event, o, PAGE, opts)).data, maxPages));
}

export async function readReviewsWindow(event: string, maxPages = 2, opts: Fresh = {}): Promise<ReadResult<Window<Review>>> {
  return result(await newestFirst(async (o) => (await readReviews(event, o, PAGE, opts)).data, maxPages));
}

/** stats(): the contract's totals. */
export async function readStats(opts: Fresh = {}): Promise<ReadResult<Stats>> {
  return result(mapStats(asRow(await view("stats", [], opts))));
}

/** rules(): the contract's own words for its questions, its windows, who may do what and where the money goes. */
export async function readRules(): Promise<ReadResult<Rules>> {
  return result(asRow(await view("rules", [])));
}

// ---- writes: one builder per method (lib/calls.ts) ------------------------------------------------------

export { calls } from "./calls";

/** True for the call the validators judge with their models: the rail then shows their votes. */
export const isJudged = (fn: WriteFn) => fn === "review";

const WRONG_CHAIN = (chainId: number | null) => `Your wallet is on ${chainName(chainId)}. Switch it to GenLayer Studio (chain 61999) before signing.`;

/** Sends a call through the connected EIP-1193 provider. Resolves to the transaction hash. */
export async function write(call: Call): Promise<string> {
  if (isMock) return mock.write(call);
  const address = contractAddress();
  if (!address) throw new Error("The contract is not deployed yet, so there is nothing to sign.");
  const signer = getSigner();
  if (!signer) throw new Error("Connect a wallet first.");
  // Studio is gasless and the SDK skips its own chain check for it, so the refusal to sign on
  // another chain lives here, and it says which chain the wallet is on.
  const chainId = await getChainId(signer.provider);
  if (chainId !== CHAIN_ID) throw new Error(WRONG_CHAIN(chainId));
  const client = createClient({ chain: studio, account: signer.address as Address, provider: signer.provider });
  const hash = await client.writeContract({
    address: address as Address,
    functionName: call.fn,
    args: call.args,
    value: call.value ?? 0n,
  });
  if (typeof hash !== "string" || !hash.startsWith("0x")) throw new Error("The wallet returned no transaction hash.");
  return hash;
}

// ---- outcomes: what a finished call's JSON return means ---------------------------------------------

/**
 * True when the leader's return is what the chain stored. A round with no majority, a cancelled tx or
 * one the validators did not accept still carries the leader's JSON, but nothing of it was kept.
 */
export const stored = (s: TxStatus | null): s is TxStatus => !!s && !s.undetermined && s.applied !== false && s.status !== "CANCELED";

/** The tag of a raised error: a rule ([EXPECTED]), a page that could not be read ([TRANSIENT]) or a model failure ([LLM_ERROR]). */
export function errorTag(s: TxStatus | null): "EXPECTED" | "TRANSIENT" | "LLM_ERROR" | "" {
  const m = /\[(EXPECTED|TRANSIENT|LLM_ERROR)\]/.exec(s?.message || "");
  return m ? (m[1] as "EXPECTED" | "TRANSIENT" | "LLM_ERROR") : "";
}

/** The sentence after a raised error's tag, as a sentence; "" when there is none. */
function raisedSentence(s: TxStatus): string {
  const m = /\[(?:EXPECTED|TRANSIENT|LLM_ERROR)\]\s*([^"}\n]+)/.exec(s.message || "");
  return m ? sentence(m[1]) : "";
}

/** The contract's reason for refusing a call, as a sentence; "" when the call was not refused. */
export function refusalReason(s: TxStatus | null): string {
  if (!s) return "";
  const r = s.result;
  if (r && r.ok === false) return sentence(str(r.reason));
  if (s.exec === "ERROR" && !s.undetermined) return raisedSentence(s) || sentence(s.message || "");
  return "";
}

/** True when the transaction finished and the contract did what was asked. */
export function succeeded(s: TxStatus | null): boolean {
  return !!s && s.status === "FINALIZED" && stored(s) && s.exec !== "ERROR" && s.result?.ok !== false;
}

/**
 * A review whose round stored nothing because the page could not be read or a model call failed: the
 * leader raised and no validator agrees with a leader that raised. The sentence says why, in the
 * contract's words when the leader's error was readable.
 */
export function unsettledWhy(s: TxStatus | null): string {
  if (!s || !s.undetermined) return "";
  const tag = errorTag(s);
  if (tag === "TRANSIENT" || tag === "LLM_ERROR" || tag === "EXPECTED") return raisedSentence(s);
  return "";
}

/** A plain sentence for a tx that finished without doing what was asked; "" when it did. */
export function failureOf(s: TxStatus | null): string {
  if (!s) return "";
  if (s.undetermined) {
    const why = unsettledWhy(s);
    return why
      ? `${why} The validators did not agree on a value, so nothing was stored and no fee was taken.`
      : "The validators did not reach a majority, so nothing was stored and no fee was taken. Sending the same call again is safe.";
  }
  if (s.status === "CANCELED") return "The network cancelled the transaction. Nothing was stored.";
  const reason = refusalReason(s);
  if (reason) return reason;
  if (s.applied === false) return "The validators did not accept this transaction. Nothing was stored.";
  return "";
}

const ok = (s: TxStatus | null): s is TxStatus & { result: Row } => stored(s) && s.result?.ok === true;

/** open_event()'s return: the new event's id, or "". */
export const openedEvent = (s: TxStatus | null): string => (ok(s) && /^E\d+$/.test(str(s.result.event)) ? str(s.result.event) : "");

export type Paid = { kind: "done"; result: Row } | { kind: "refused"; reason: string; returnedAtto: string } | { kind: "unknown" };

/** buy()'s or deposit()'s return: taken, or refused with what came back in the same transaction. */
export function paidOutcome(s: TxStatus | null): Paid {
  if (!stored(s) || !s.result) return { kind: "unknown" };
  if (s.result.ok === true) return { kind: "done", result: s.result };
  if (s.result.ok === false) return { kind: "refused", reason: sentence(str(s.result.reason)), returnedAtto: atto(s.result.returned) };
  return { kind: "unknown" };
}

/** buy()'s return: the new ticket's id, or "". */
export const boughtTicket = (s: TxStatus | null): string => {
  const p = paidOutcome(s);
  return p.kind === "done" && /^T\d+$/.test(str(p.result.ticket)) ? str(p.result.ticket) : "";
};

export type ReviewResult = { review: string; event: string; url: string; finding: Finding; fp: string; repeatOf: string; feeTo: FeeTo; holder: boolean; status: EventStatus };

/** review()'s return: the agreed finding, the fingerprint, whether it repeated an earlier reading, and where the fee went. */
export function reviewOutcome(s: TxStatus | null): ReviewResult | null {
  if (!ok(s) || !FINDINGS.includes(str(s.result.finding) as Finding) || !/^R\d+$/.test(str(s.result.review))) return null;
  const r = s.result;
  return {
    review: str(r.review),
    event: str(r.event),
    url: str(r.url),
    finding: oneOf<Finding>(FINDINGS, r.finding, "unclear"),
    fp: fp(r.fp),
    repeatOf: str(r.repeat_of),
    feeTo: oneOf<FeeTo>(FEE_TO, r.fee_to, "organizer"),
    holder: r.holder === true,
    status: oneOf<EventStatus>(EVENT_STATUSES, r.status, "on"),
  };
}

export type Closed = { ticket: string; status: TicketStatus; paidAtto: string; to: string };

/** refund()'s or settle()'s return: the ticket, where its price went and to whom. */
export function closedOutcome(s: TxStatus | null): Closed | null {
  if (!ok(s) || !/^T\d+$/.test(str(s.result.ticket)) || s.result.paid === undefined) return null;
  const r = s.result;
  return { ticket: str(r.ticket), status: oneOf<TicketStatus>(TICKET_STATUSES, r.status, "valid"), paidAtto: atto(r.paid), to: addr(r.to) };
}

/** True when GEN moves to or from somebody because of this call, so balances are watched afterwards. */
export function movesMoney(s: TxStatus): boolean {
  const r = s.result;
  if (!r) return false;
  if (r.ok === false) return atto(r.returned) !== "0";
  if (r.ok !== true) return false;
  return atto(r.paid) !== "0" || atto(r.withdrawn) !== "0" || str(r.fee_to) === "organizer";
}

// ---- the demo organizer ----------------------------------------------------------------------------

const DEMO_STATES: DemoEventState[] = ["open", "none", "started", "changed", "sold_out"];
let demoCache: { at: number; value: DemoStatus } | null = null;

/** Forget the cached demo status, after the demo organizer opened a fresh event. */
export const forgetDemoStatus = () => {
  demoCache = null;
};

/** Whether the demo organizer can act now, whose it is and which event it runs. Asked of the site's own server; cached half a minute. */
export async function readDemoStatus(opts: Fresh = {}): Promise<DemoStatus> {
  if (isMock) return mock.demoStatus();
  if (!opts.fresh && demoCache && Date.now() - demoCache.at < 30_000) return demoCache.value;
  try {
    const res = await fetch("/api/demo/status", { cache: "no-store" });
    const body = (await res.json()) as Partial<DemoStatus>;
    const e = /^E[1-9]\d{0,8}$/.test(str(body.event)) ? str(body.event) : "";
    const value: DemoStatus = {
      online: body.online === true,
      organizer: addr(body.organizer),
      event: e || demoEventFallback(),
      eventState: oneOf<DemoEventState>(DEMO_STATES, body.eventState, e ? "open" : "none"),
      reason: str(body.reason),
      notices: body.notices === true,
      noticesReason: str(body.noticesReason),
      prefix: /^https:\/\/[a-z0-9.-]+\/[A-Za-z0-9._~/-]*\/$/.test(str(body.prefix)) ? str(body.prefix) : "",
    };
    demoCache = { at: Date.now(), value };
    return value;
  } catch {
    return { online: false, organizer: "", event: demoEventFallback(), eventState: "none", reason: "the site's server did not answer", notices: false, noticesReason: "", prefix: "" };
  }
}

async function askDemo(path: string, body: Record<string, string>): Promise<DemoAnswer> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const answer = (await res.json()) as Record<string, unknown>;
    if (answer.ok === true && typeof answer.hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(answer.hash)) return { ok: true, hash: answer.hash };
    return { ok: false, reason: sentence(str(answer.reason, "the demo organizer did not answer")), retryAfter: num(answer.retryAfter) || undefined };
  } catch {
    return { ok: false, reason: "The site's server did not answer. Try again in a minute." };
  }
}

/** Asks the demo organizer to announce one of its six fixed notices on the demo event: it asks the network to read that page. */
export async function requestDemoNotice(event: string, notice: string): Promise<DemoAnswer> {
  if (isMock) return mock.demoNotice(event, notice);
  return askDemo("/api/demo/notice", { event, notice });
}

/** Asks the demo organizer for a fresh demo event, once the last one started, sold out or changed. */
export async function requestDemoReopen(): Promise<DemoAnswer> {
  if (isMock) return mock.demoReopen();
  return askDemo("/api/demo/reopen", {});
}

// ---- transactions, balances, the faucet -------------------------------------------------------------

/** One poll of a transaction. Pages call this every 3 s until it is final. */
export async function txStatus(hash: string): Promise<TxStatus> {
  if (isMock) return mock.txStatus(hash);
  // Two quick tries: the caller polls anyway. eth_* has its own bucket and its own retry budget,
  // so neither a gen_call cooldown nor the gen_call retry loops ever stall the rail.
  const tx = await withRetry(() => rpc<RawTx | null>("eth_getTransactionByHash", [hash]), { tries: 2, bucket: "eth", ownBudget: true });
  return decodeTx(tx);
}

/** Balance in atto of an address (eth_getBalance). */
export async function balanceOf(address: string): Promise<bigint> {
  if (isMock) return mock.balanceOf(address);
  const hex = await withRetry(() => rpc<string>("eth_getBalance", [address, "latest"]), { tries: 3, bucket: "eth", ownBudget: true });
  return BigInt(hex || "0x0");
}

const FAUCET_PAUSE_MS = 10_000;
const FAUCET_TRIES = 3;
const FAUCET_WAIT_MS = 60_000;

/**
 * Faucet: sim_fundAccount with 10 GEN, up to three tries ten seconds apart, each after the gen_call
 * cooldown. Resolves when the balance moved. `stillWanted` is asked between balance polls: once it
 * says no (the wallet switched accounts) the wait ends with an error nobody shows.
 */
export async function faucet(address: string, opts: { stillWanted?: () => boolean } = {}): Promise<bigint> {
  if (isMock) return mock.faucet(address);
  // Studio credits only a checksummed address: the lowercase spelling is accepted and never paid.
  let account: string;
  try {
    account = getAddress(address);
  } catch {
    throw new Error("That is not a valid 0x address, so the faucet was not asked.");
  }
  let before: bigint;
  try {
    before = await balanceOf(account);
  } catch {
    throw new Error("Could not read this wallet's balance from Studio, so the faucet was not asked. Try again in a few seconds.");
  }
  let sent = false;
  for (let i = 0; i < FAUCET_TRIES && !sent; i++) {
    await waitForCooldown("gen");
    try {
      // `amount` is wei as a JS number; a decimal string makes the node compare str with int.
      await rpc("sim_fundAccount", { account_address: account, amount: 10e18 });
      sent = true;
    } catch (e) {
      noteFailure(e, Date.now(), "gen");
      if (i === FAUCET_TRIES - 1) throw new Error(FAUCET_REFUSED);
      await sleep(FAUCET_PAUSE_MS);
    }
  }
  const started = Date.now();
  while (Date.now() - started < FAUCET_WAIT_MS) {
    await sleep(2000);
    if (opts.stillWanted && !opts.stillWanted()) throw new Error("The faucet wait ended: the wallet switched accounts.");
    try {
      const now = await balanceOf(account);
      if (now !== before) return now;
    } catch {
      /* a dropped poll is not a failed faucet; keep polling */
    }
  }
  throw new Error("The faucet did not credit the account within 60 s. Try again.");
}

export const txUrl = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const addressUrl = (address: string) => `${EXPLORER_URL}/address/${address}`;
export const eventPath = (id: string) => `/event/${id}`;
