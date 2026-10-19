// A stand-in for the contract, in memory, for NEXT_PUBLIC_MOCK=1. lib/chain.ts delegates here.
//
// It follows contracts/changed.py on everything deterministic: who may call what and when, the order of
// the checks and their refusal sentences word for word, the escrow, the review credit and where every
// review fee goes, the once-per-text rule (a repeat carries the earlier finding), a holder's one free
// unclear reading, the counters, and every view answered in the contract's own JSON shape, so the
// mappers in lib/chain.ts run on the same rows in both modes. The one thing it cannot do is fetch a page
// or ask a model: a demo notice is read as SCRIPTED (lib/demo-event.ts) against the demo terms, any
// other address cannot be fetched and stores nothing, and the demo bar says so on every page. The demo
// bar can also make the next reading split, as validators whose four answers disagree would, so the
// unclear outcome can be seen.
//
// The visitor acts as one of a few demo accounts. The demo organizer runs the Harbour Lights Festival
// and announces a notice when its buttons are pressed (demoNotice and demoReopen, the in-memory twins of
// POST /api/demo/notice and /api/demo/reopen). A few events are seeded so the ledger and the tickets
// page have something to show, and the clock can be moved on so a start, a settle window and the end of
// the refunds can be seen. State lasts as long as the tab.

import type { Call, DemoAnswer, DemoStatus, TxStatus, WriteFn } from "./types.ts";
import { notify } from "./browser-store.ts";
import { REPO_URL } from "./config.ts";
import {
  DEMO_CAPACITY,
  DEMO_CREDIT_LOW,
  DEMO_CREDIT_TOP_UP,
  DEMO_EVENT_NAME,
  DEMO_LEAD,
  DEMO_PRICE,
  DEMO_TERMS_JSON,
  demoNoticeProblem,
  demoStateOf,
  noticeOf,
  noticesBase,
  reopenProblem,
  repoOf,
  scriptedReading,
} from "./demo-event.ts";
import {
  ADDRESS_CHARS,
  AFTER_START,
  DESCRIBED,
  FP_CHARS,
  ID_CHARS,
  MAX_CAPACITY,
  MAX_DETAILS,
  MAX_LEAD,
  MAX_NAME,
  MAX_PAGE_TEXT,
  MAX_PREFIX,
  MAX_PRICE,
  MAX_RAW_BYTES,
  MAX_RAW_PAGE,
  MAX_TERM,
  MAX_TERMS_JSON,
  MAX_URL,
  MEANING_CHANGED,
  MEANING_HOLDS,
  MIN_CAPACITY,
  MIN_LEAD,
  MIN_NAME,
  MIN_PRICE,
  MIN_TERM,
  PAGE,
  QUESTION_CHANGED,
  QUESTION_HOLDS,
  READING,
  REFUND_WINDOW,
  REVIEW_FEE,
  numberArg,
  phaseOf,
  prefixProblem,
  pyStrip,
  termsJson,
  termsProblem,
  textProblem,
  under,
  urlProblem,
  type ChangedBy,
  type EventStatus,
  type FeeTo,
  type Finding,
  type TicketStatus,
} from "./rules.ts";

const GEN = 10n ** 18n;
export const MOCK_CONTRACT = "0x00000000000000000000000000000000c4a96ed0";
/** The commit the demo build pretends its notices are pinned to. */
export const MOCK_COMMIT = "0123456789abcdef0123456789abcdef01234567";
export const MOCK_REPO = repoOf(REPO_URL) || "demo-owner/changed";
/** The demo event's site prefix in the demo build. */
export const MOCK_PREFIX = noticesBase(MOCK_REPO, MOCK_COMMIT);
/** The address of a demo notice under the demo build's pretend commit. */
export const mockNotice = (key: string): string => MOCK_PREFIX + (noticeOf(key)?.file ?? key);

const inBrowser = typeof window !== "undefined";
const delay = (ms: number) => (inBrowser ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

// ---- the clock -----------------------------------------------------------------------------------

let clockOffset = 0;
/** The mock's message clock, in seconds: the browser's clock plus however far the visitor moved it on. */
export const mockNow = (): number => Math.floor(Date.now() / 1000) + clockOffset;
/** How far the clock has been moved on, in seconds: a stable snapshot for useSyncExternalStore. */
export const mockClockOffset = (): number => clockOffset;
/** Moves the mock clock on, so a start, a settle window or the end of the refunds can be seen. */
export function advanceClock(seconds: number): void {
  clockOffset += Math.max(0, Math.floor(seconds));
  notify();
}

// ---- the next reading --------------------------------------------------------------------------

let splitNext = false;
/** Whether the next review's validators will disagree among their four answers (mock only). */
export const mockSplitNext = (): boolean => splitNext;
export function setMockSplitNext(on: boolean): void {
  splitNext = on;
  notify();
}

// ---- who the visitor is acting as -----------------------------------------------------------------

export type Persona = { address: string; name: string; note: string };

export const VISITOR = "0x5e1a3c9b07d24f68a1e3c5b7d9f0a2c4e6b8d0f1";
export const MY_ORGANIZER = "0x7a2c4e6f81b3d5a7c9e0f2a4b6d8c0e1f3a5b7c9";
export const DEMO_ORGANIZER = "0xd3e5f7a9b1c2d4e6f8a0b2c4d6e8f0a1b3c5d7e9";
export const EARLIER_FAN = "0xb4d6f8a0c2e4a6b8d0f2c4e6a8b0d2f4c6e8a0b2";
export const PASSER_BY = "0x91c3e5a7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9";

/** The accounts a visitor can act as in mock mode. The first is a newcomer with test GEN. */
export const PERSONAS: Persona[] = [
  { address: VISITOR, name: "You, a fan", note: "buy a ticket to the demo festival and watch the notices" },
  { address: MY_ORGANIZER, name: "You, an organizer", note: "runs E2 (settled) and E3 (on sale)" },
  { address: EARLIER_FAN, name: "An earlier fan", note: "tickets to every event so far" },
  { address: PASSER_BY, name: "A stranger", note: "holds no ticket; may read everything" },
  { address: DEMO_ORGANIZER, name: "The demo organizer", note: "runs the Harbour Lights Festival" },
];

let persona = VISITOR;
/** The address the mock treats as the connected wallet. */
export const mockAddress = (): string => persona;
export function setMockPersona(address: string): void {
  if (PERSONAS.some((p) => p.address === address)) persona = address;
  notify();
}

// ---- wallet balances ------------------------------------------------------------------------------

const balances = new Map<string, bigint>([
  [VISITOR, 20n * GEN],
  [MY_ORGANIZER, 12n * GEN],
  [DEMO_ORGANIZER, 30n * GEN],
  [EARLIER_FAN, 25n * GEN],
  [PASSER_BY, 3n * GEN],
]);
const balance = (a: string) => balances.get(a.toLowerCase()) ?? 0n;
const credit = (a: string, v: bigint) => {
  balances.set(a.toLowerCase(), balance(a) + v);
  notify();
};
/** The balance as a decimal string: a stable snapshot for useSyncExternalStore. */
export const mockBalanceText = (address: string): string => balance(address).toString();
/** The contract's own balance: every ticket price in escrow and all review credit. */
let contractBalance = 0n;
export const mockContractBalance = (): bigint => contractBalance;

// ---- the contract's state -----------------------------------------------------------------------

type EventRec = {
  organizer: string;
  name: string;
  date: string;
  venue: string;
  main_act: string;
  details: string;
  site_prefix: string;
  price: bigint;
  capacity: number;
  starts_at: number;
  opened_at: number;
  status: EventStatus;
  changed_by: ChangedBy;
  changed_at: number;
  change_review: string;
  sold: number;
  held: bigint;
  n_refunded: number;
  refunded: bigint;
  n_settled: number;
  settled: bigint;
  n_reviews: number;
  n_material: number;
  n_minor: number;
  n_unclear: number;
  n_repeats: number;
  fees_won: bigint;
};

type TicketRec = { event_id: string; holder: string; n: number; price: bigint; bought_at: number; status: TicketStatus; closed_at: number };

type ReviewRec = { event_id: string; reviewer: string; url: string; finding: Finding; fp: string; fee_to: FeeTo; holder: boolean; repeat_of: string; at: number };

const eventRows = new Map<string, EventRec>();
const ticketRows = new Map<string, TicketRec>();
const reviewRows = new Map<string, ReviewRec>();
const lists = new Map<string, string[]>();
const seen = new Map<string, string>();
const freeUnclear = new Map<string, string>();
const bought = new Map<string, number>();
const creditOf = new Map<string, bigint>();
const n = {
  event_count: 0,
  ticket_count: 0,
  review_count: 0,
  held_total: 0n,
  sales_total: 0n,
  refunded_total: 0n,
  to_organizers: 0n,
  credit_total: 0n,
  deposited_total: 0n,
  credit_out: 0n,
  fees_total: 0n,
  returned: 0n,
  n_refused: 0,
  n_changed: 0,
  n_by_review: 0,
  n_cancelled: 0,
  n_refunded: 0,
  n_settled: 0,
  n_material: 0,
  n_minor: 0,
  n_unclear: 0,
  n_repeats: 0,
};

/** A refusal that raises: nothing is stored, and the receipt carries the sentence. */
class Refused extends Error {}
const fail = (message: string): never => {
  throw new Refused("[EXPECTED] " + message);
};
/** A round that stores nothing: the page could not be read. The tag is the contract's. */
class NotSettled extends Error {}

type Ctx = { sender: string; value: bigint; now: number };
type Row = Record<string, unknown>;

const isStr = (v: unknown): v is string => typeof v === "string";

const clock = (c: Ctx): number => {
  if (c.now < 0) fail("no readable clock on this transaction; no window can be measured");
  return c.now;
};

function idArg(raw: unknown, what: string): string {
  if (!isStr(raw)) fail(what + " is a string");
  return pyStrip(raw as string);
}
function eventOf(eid: string): EventRec {
  const e = eventRows.get(eid);
  if (!e) return fail("no event " + eid.slice(0, ID_CHARS));
  return e;
}
function ticketOf(tid: string): TicketRec {
  const t = ticketRows.get(tid);
  if (!t) return fail("no ticket " + tid.slice(0, ID_CHARS));
  return t;
}
const creditFor = (who: string): bigint => creditOf.get(who) ?? 0n;
const boughtBy = (eid: string, who: string): number => bought.get(eid + "|" + who) ?? 0;
const push = (key: string, id: string) => lists.set(key, [...(lists.get(key) ?? []), id]);

function transfer(to: string, value: bigint): void {
  contractBalance -= value;
  credit(to, value);
}

function change(e: EventRec, by: ChangedBy, now: number, rid: string): void {
  e.status = "changed";
  e.changed_by = by;
  e.changed_at = now;
  e.change_review = rid;
  n.n_changed++;
  if (by === "review") n.n_by_review++;
  else n.n_cancelled++;
}

function closeTicket(t: TicketRec, e: EventRec, status: TicketStatus, now: number): void {
  const price = t.price;
  t.status = status;
  t.closed_at = now;
  e.held -= price;
  n.held_total -= price;
  if (status === "refunded") {
    e.n_refunded++;
    e.refunded += price;
    n.n_refunded++;
    n.refunded_total += price;
    transfer(t.holder, price);
  } else {
    e.n_settled++;
    e.settled += price;
    n.n_settled++;
    n.to_organizers += price;
    transfer(e.organizer, price);
  }
}

function closed(tid: string, t: TicketRec): Row {
  const e = eventRows.get(t.event_id)!;
  const to = t.status === "refunded" ? t.holder : e.organizer;
  return { ok: true, ticket: tid, event: t.event_id, status: t.status, paid: t.price.toString(), to, held: e.held.toString(), closed_at: t.closed_at };
}

function refuse(sender: string, value: bigint, reason: string, fields: Row): Row {
  n.n_refused++;
  n.returned += value;
  if (value > 0n) transfer(sender, value);
  return { ok: false, ...fields, reason, returned: value.toString() };
}

// ---- the writes -----------------------------------------------------------------------------------

function openEvent(c: Ctx, args: unknown[]): Row {
  const [rawName, rawTerms, rawPrefix] = args;
  if (!isStr(rawName) || !isStr(rawTerms) || !isStr(rawPrefix)) fail("the name, the terms and the site prefix are strings");
  const name = pyStrip(rawName as string);
  const sitePrefix = pyStrip(rawPrefix as string);
  let problem = textProblem(name, MIN_NAME, MAX_NAME, "the name");
  if (problem) fail(problem);
  const read = termsProblem(rawTerms as string);
  if (read.problem) fail(read.problem);
  const terms = read.terms!;
  problem = prefixProblem(sitePrefix);
  if (problem) fail(problem);
  const [cost, seats, start] = [args[3], args[4], args[5]].map(numberArg);
  if (cost < MIN_PRICE || cost > MAX_PRICE) fail("the price is a whole number of atto from " + MIN_PRICE + " (0.05 GEN) to " + MAX_PRICE + " (50 GEN)");
  if (seats < BigInt(MIN_CAPACITY) || seats > BigInt(MAX_CAPACITY)) fail("the capacity is " + MIN_CAPACITY + " to " + MAX_CAPACITY + " tickets");
  const now = clock(c);
  if (start < BigInt(now + MIN_LEAD) || start > BigInt(now + MAX_LEAD))
    fail("the start is a unix time from " + MIN_LEAD + " to " + MAX_LEAD + " seconds after now (" + now + "); this one is " + start);
  n.event_count++;
  const eid = "E" + n.event_count;
  eventRows.set(eid, {
    organizer: c.sender, name, date: terms.date, venue: terms.venue, main_act: terms.main_act, details: terms.details, site_prefix: sitePrefix, price: cost,
    capacity: Number(seats), starts_at: Number(start), opened_at: now, status: "on", changed_by: "", changed_at: 0, change_review: "", sold: 0, held: 0n,
    n_refunded: 0, refunded: 0n, n_settled: 0, settled: 0n, n_reviews: 0, n_material: 0, n_minor: 0, n_unclear: 0, n_repeats: 0, fees_won: 0n,
  });
  push("organizer:" + c.sender, eid);
  return {
    ok: true, event: eid, organizer: c.sender, name, terms, site_prefix: sitePrefix, price: cost.toString(), capacity: Number(seats), starts_at: Number(start),
    opened_at: now, status: "on",
  };
}

function cancel(c: Ctx, raw: unknown): Row {
  const eid = idArg(raw, "the event id");
  const e = eventOf(eid);
  if (c.sender !== e.organizer) fail("only the organizer of " + eid + " may cancel it");
  if (e.status !== "on") fail(eid + " is " + e.status + "; its refunds are already open");
  const now = clock(c);
  if (now >= e.starts_at) fail(eid + " started at " + e.starts_at + "; it can be cancelled only before its start, and a notice of a change on the day is reviewed instead");
  change(e, "organizer", now, "");
  return { ok: true, event: eid, status: "changed", changed_by: "organizer", changed_at: now, refund_until: e.starts_at + REFUND_WINDOW, held: e.held.toString() };
}

function buy(c: Ctx, raw: unknown): Row {
  const value = c.value;
  const who = c.sender;
  let problem = "";
  let eid = "";
  if (!isStr(raw)) {
    problem = "the event id is a string";
  } else {
    eid = pyStrip(raw);
    if (!eventRows.has(eid)) problem = "no event " + eid.slice(0, ID_CHARS);
  }
  let now = -1;
  if (!problem) {
    const e = eventRows.get(eid)!;
    now = c.now;
    if (who === e.organizer) problem = "the organizer of " + eid + " may not buy its own tickets";
    else if (e.status !== "on") problem = eid + " is " + e.status + "; tickets are sold while it is on";
    else if (now < 0) problem = "no readable clock on this transaction; no window can be measured";
    else if (now >= e.starts_at) problem = eid + " started at " + e.starts_at + "; tickets are sold before the start";
    else if (e.sold >= e.capacity) problem = eid + " is sold out: all " + e.capacity + " tickets are sold";
    else if (value !== e.price) problem = "send exactly the price of " + e.price + " atto to buy a ticket to " + eid + "; this one sent " + value;
  }
  if (problem) return refuse(c.sender, value, problem, { event: eid.slice(0, ID_CHARS), ticket: "" });
  const e = eventRows.get(eid)!;
  n.ticket_count++;
  const tid = "T" + n.ticket_count;
  const k = e.sold + 1;
  ticketRows.set(tid, { event_id: eid, holder: who, n: k, price: value, bought_at: now, status: "valid", closed_at: 0 });
  e.sold = k;
  e.held += value;
  n.held_total += value;
  n.sales_total += value;
  bought.set(eid + "|" + who, boughtBy(eid, who) + 1);
  push("holder:" + who, tid);
  push("event:" + eid, tid);
  return { ok: true, ticket: tid, event: eid, holder: who, n: k, price: value.toString(), held: value.toString(), left: e.capacity - k, bought_at: now };
}

function refund(c: Ctx, raw: unknown): Row {
  const tid = idArg(raw, "the ticket id");
  const t = ticketOf(tid);
  if (c.sender !== t.holder) fail("only the holder of " + tid + " may refund it");
  if (t.status !== "valid") fail(tid + " is " + t.status + "; a ticket is paid out once");
  const eid = t.event_id;
  const e = eventRows.get(eid)!;
  if (e.status !== "changed")
    fail(eid + " has not changed; a ticket is refunded once a review finds a material change or the organizer cancels, and review(" + eid + ", url) asks the network to read a notice");
  const now = clock(c);
  const until = e.starts_at + REFUND_WINDOW;
  if (now >= until) fail("refunds of " + eid + " closed at " + until + ", seven days after its start; settle(" + tid + ") now sends the price to the organizer");
  closeTicket(t, e, "refunded", now);
  return closed(tid, t);
}

function settle(c: Ctx, raw: unknown): Row {
  const tid = idArg(raw, "the ticket id");
  const t = ticketOf(tid);
  if (t.status !== "valid") fail(tid + " is " + t.status + "; a ticket is paid out once");
  const eid = t.event_id;
  const e = eventRows.get(eid)!;
  const now = clock(c);
  if (e.status === "on") {
    const opens = e.starts_at + AFTER_START;
    if (now < opens) fail(tid + " settles to the organizer from " + opens + ", a day after " + eid + " starts, while its notices can still be reviewed; in " + (opens - now) + " seconds");
  } else {
    const opens = e.starts_at + REFUND_WINDOW;
    if (now < opens)
      fail(eid + " changed; its holders take their money back until " + opens + ", and only a ticket nobody refunded settles to the organizer after that; in " + (opens - now) + " seconds");
  }
  closeTicket(t, e, "settled", now);
  return closed(tid, t);
}

function deposit(c: Ctx): Row {
  const value = c.value;
  const who = c.sender;
  if (value <= 0n) return refuse(c.sender, value, "send the credit to add with the call", {});
  creditOf.set(who, creditFor(who) + value);
  n.credit_total += value;
  n.deposited_total += value;
  return { ok: true, address: who, added: value.toString(), credit: creditFor(who).toString() };
}

function withdraw(c: Ctx): Row {
  const who = c.sender;
  const amount = creditFor(who);
  if (amount <= 0n) fail("this address holds no review credit");
  creditOf.set(who, 0n);
  n.credit_total -= amount;
  n.credit_out += amount;
  transfer(c.sender, amount);
  return { ok: true, address: who, withdrawn: amount.toString(), credit: "0" };
}

function review(c: Ctx, rawEvent: unknown, rawUrl: unknown): Row {
  if (!isStr(rawEvent) || !isStr(rawUrl)) fail("the event id and the page address are strings");
  const eid = pyStrip(rawEvent as string);
  const url = pyStrip(rawUrl as string);
  const e = eventOf(eid);
  const problem = urlProblem(url, MAX_URL, "the page address");
  if (problem) fail(problem);
  if (!under(url, e.site_prefix)) fail("the page is not below " + eid + "'s site prefix " + e.site_prefix + "; only the organizer's own notices are read");
  if (e.status !== "on") fail(eid + " is " + e.status + "; a notice is reviewed while the event is on");
  const now = clock(c);
  const until = e.starts_at + AFTER_START;
  if (now >= until) fail("reviews of " + eid + " closed at " + until + ", a day after its start");
  const who = c.sender;
  const held = creditFor(who);
  if (held < REVIEW_FEE) fail("a review takes " + REVIEW_FEE + " atto (0.01 GEN) of review credit and this address holds " + held + "; deposit() first");
  // The consensus round, scripted: a page the mock cannot read stores nothing and takes no fee.
  const reading = scriptedReading(url, { date: e.date, venue: e.venue, main_act: e.main_act });
  if ("error" in reading) throw new NotSettled(reading.error);
  let finding: Finding = reading.finding;
  if (splitNext) {
    finding = "unclear";
    splitNext = false;
  }
  const fp = reading.fp;
  const holder = boughtBy(eid, who) > 0;
  const textKey = eid + "|" + fp;
  const freeKey = eid + "|" + who;
  const repeatOf = seen.get(textKey) ?? "";
  let feeTo: FeeTo;
  if (repeatOf) {
    finding = reviewRows.get(repeatOf)!.finding;
    feeTo = "organizer";
  } else {
    const free = finding === "unclear" && holder && !freeUnclear.has(freeKey);
    feeTo = finding === "material" || free ? "reviewer" : "organizer";
  }
  n.review_count++;
  const rid = "R" + n.review_count;
  reviewRows.set(rid, { event_id: eid, reviewer: who, url, finding, fp, fee_to: feeTo, holder, repeat_of: repeatOf, at: now });
  push("reviews:" + eid, rid);
  e.n_reviews++;
  if (repeatOf) {
    e.n_repeats++;
    n.n_repeats++;
  } else {
    seen.set(textKey, rid);
    if (finding === "material") {
      e.n_material++;
      n.n_material++;
    } else if (finding === "minor") {
      e.n_minor++;
      n.n_minor++;
    } else {
      e.n_unclear++;
      n.n_unclear++;
      if (feeTo === "reviewer") freeUnclear.set(freeKey, rid);
    }
  }
  if (feeTo === "organizer") {
    creditOf.set(who, held - REVIEW_FEE);
    n.credit_total -= REVIEW_FEE;
    e.fees_won += REVIEW_FEE;
    n.fees_total += REVIEW_FEE;
  }
  if (finding === "material") change(e, "review", now, rid);
  if (feeTo === "organizer") transfer(e.organizer, REVIEW_FEE);
  return { ok: true, event: eid, review: rid, url, finding, fp, repeat_of: repeatOf, fee_to: feeTo, holder, status: e.status, credit: creditFor(who).toString(), at: now };
}

function run(fn: WriteFn, args: unknown[], c: Ctx): Row {
  switch (fn) {
    case "open_event":
      return openEvent(c, args);
    case "cancel":
      return cancel(c, args[0]);
    case "buy":
      return buy(c, args[0]);
    case "refund":
      return refund(c, args[0]);
    case "settle":
      return settle(c, args[0]);
    case "deposit":
      return deposit(c);
    case "withdraw":
      return withdraw(c);
    case "review":
      return review(c, args[0], args[1]);
  }
}

// ---- the views ------------------------------------------------------------------------------------

function eventRow(eid: string, now: number): Row {
  const e = eventRows.get(eid)!;
  const starts = e.starts_at;
  const on = e.status === "on";
  return {
    event: eid, organizer: e.organizer, name: e.name, terms: { date: e.date, venue: e.venue, main_act: e.main_act, details: e.details },
    site_prefix: e.site_prefix, price: e.price.toString(), capacity: e.capacity, sold: e.sold, left: e.capacity - e.sold, starts_at: starts,
    opened_at: e.opened_at, status: e.status, changed_by: e.changed_by, changed_at: e.changed_at, change_review: e.change_review, held: e.held.toString(),
    review_until: on ? starts + AFTER_START : 0, settle_from: starts + (on ? AFTER_START : REFUND_WINDOW), refund_until: on ? 0 : starts + REFUND_WINDOW,
    record: {
      refunded: e.n_refunded, refunded_value: e.refunded.toString(), settled: e.n_settled, settled_value: e.settled.toString(), reviews: e.n_reviews,
      material: e.n_material, minor: e.n_minor, unclear: e.n_unclear, repeats: e.n_repeats, fees_won: e.fees_won.toString(),
    },
    now, phase: phaseOf({ status: e.status, startsAt: starts, sold: e.sold, capacity: e.capacity }, now),
  };
}

function ticketRow(tid: string): Row {
  const t = ticketRows.get(tid)!;
  const e = eventRows.get(t.event_id)!;
  return {
    ticket: tid, event: t.event_id, event_name: e.name, event_status: e.status, holder: t.holder, n: t.n, price: t.price.toString(), bought_at: t.bought_at,
    status: t.status, closed_at: t.closed_at, starts_at: e.starts_at,
  };
}

function reviewRow(rid: string): Row {
  const r = reviewRows.get(rid)!;
  return { review: rid, event: r.event_id, reviewer: r.reviewer, url: r.url, finding: r.finding, fp: r.fp, repeat_of: r.repeat_of, fee_to: r.fee_to, holder: r.holder, at: r.at };
}

function pageOf(key: string, offset: unknown, limit: unknown): { total: number; start: number; size: number; ids: string[] } {
  const all = lists.get(key) ?? [];
  const off = numberArg(offset);
  const start = Number(off < 0n ? 0n : off);
  let size = Number(numberArg(limit));
  size = size < 1 || size > PAGE ? PAGE : size;
  return { total: all.length, start, size, ids: all.slice(start, Math.min(all.length, start + size)) };
}

/** rules(), as the contract publishes it. */
const RULES = {
  review: {
    value: '{"finding": "material" | "minor" | "unclear", "fp": "<16 hex>"}',
    askings: [
      "1, blocks TERMS then PAGE: " + QUESTION_CHANGED + " " + MEANING_CHANGED,
      "2, blocks PAGE then TERMS: " + QUESTION_CHANGED + " " + MEANING_CHANGED,
      "3, blocks TERMS then PAGE: " + QUESTION_HOLDS + " " + MEANING_HOLDS,
      "4, blocks PAGE then TERMS: " + QUESTION_HOLDS + " " + MEANING_HOLDS,
    ],
    described: DESCRIBED,
    terms:
      "the TERMS block holds the event's name, date, venue and main act, and the details marked not material, one labelled line each, as the organizer gave them when it opened the event",
    reading: READING,
    page:
      "fetched once by every validator itself, and the body of that one answer is what is judged: a status outside 200 to 299 is a failed read and stores nothing; then the first " +
      MAX_RAW_BYTES +
      " bytes of the body read as UTF-8, every tag removed and the text after a script or style tag dropped, the whitespace of the first " +
      MAX_RAW_PAGE +
      " characters collapsed to single spaces, the first " +
      MAX_PAGE_TEXT +
      " characters of that judged; fp is the first " +
      FP_CHARS +
      " hex characters of their sha256",
    combine: { material: "CHANGED yes in both orders and HOLDS no in both orders", minor: "CHANGED no in both orders and HOLDS yes in both orders", unclear: "anything else" },
    outcome: {
      material: "the event becomes changed and every ticket's refund opens; the review fee stays with the reviewer",
      minor: "nothing changes; the review fee goes to the organizer",
      unclear:
        "nothing changes; the review fee goes to the organizer, unless the reviewer holds a ticket to the event and has had no free unclear reading of it before, when it stays with the reviewer",
      repeat: "nothing changes; the earlier reading stands, and the review fee goes to the organizer, whoever asked",
    },
    once: "each text is read once per event: a page whose agreed fp was already read for the event, under any address, is a repeat of that reading; a page edited since it was read has another fp and is read afresh",
  },
  compared: "the whole value, by exact equality; every validator does all the work itself inside one consensus block, and never agrees with a leader that raised",
  money: {
    buy: "the holder pays exactly the price; it is held here in escrow",
    review_fee: REVIEW_FEE + " atto (0.01 GEN) of the reviewer's credit; deposit() adds credit, withdraw() takes all of it back",
    refund: "a changed event, the holder, until starts_at + " + REFUND_WINDOW + " seconds: the ticket's price back from escrow, one ticket per call",
    cancel: "the organizer, before starts_at: the event becomes changed and every refund opens",
    settle_on: "an event that never changed, anyone, from starts_at + " + AFTER_START + " seconds: the ticket's price to the organizer, one ticket per call",
    settle_changed: "a changed event, anyone, from starts_at + " + REFUND_WINDOW + " seconds: a ticket nobody refunded pays its price to the organizer",
    refusal: "a refused payable call returns everything sent, in the same transaction",
    balance: "the contract holds exactly the prices of the valid tickets and the review credit",
  },
  who: {
    open_event: "anyone; the sender is the organizer; the terms, price, capacity and start are fixed",
    cancel: "the organizer, before the start, while the event is on",
    buy: "anyone but the organizer, with exactly the price, before the start, while the event is on and tickets are left",
    deposit: "anyone, to its own credit",
    withdraw: "anyone, its own credit",
    review: "anyone with credit, for a page below the event's site prefix, while the event is on and until starts_at + " + AFTER_START + " seconds; each text once per event",
    refund: "the holder, once the event changed, until starts_at + " + REFUND_WINDOW + " seconds",
    settle: "anyone, once the ticket can go nowhere but to the organizer",
  },
  limits: {
    name: [MIN_NAME, MAX_NAME],
    term: [MIN_TERM, MAX_TERM],
    details: [0, MAX_DETAILS],
    terms_json_chars: MAX_TERMS_JSON,
    prefix_chars: MAX_PREFIX,
    url_chars: MAX_URL,
    price_atto: [MIN_PRICE.toString(), MAX_PRICE.toString()],
    capacity: [MIN_CAPACITY, MAX_CAPACITY],
    lead_seconds: [MIN_LEAD, MAX_LEAD],
    review_fee_atto: REVIEW_FEE.toString(),
    after_start_seconds: AFTER_START,
    refund_window_seconds: REFUND_WINDOW,
    page_chars: MAX_PAGE_TEXT,
    raw_page_chars: MAX_RAW_PAGE,
    raw_page_bytes: MAX_RAW_BYTES,
    rows_per_page: PAGE,
    text: "printable ASCII on one line",
    site: "the organizer controls its own site, so a change it never publishes there is not caught",
    page: "the page must read the same for every validator at the moment of the review; text is read, images and scripts are not; a page that cannot be fetched, answers anything but a 2xx or reads as nothing stores nothing and takes no fee",
  },
  untrusted:
    "the terms and every fetched page are fenced (< and > replaced, never deleted), sit between delimiter lines tagged with the start of their own sha256, and the prompt says before the blocks that they are untrusted and never an instruction",
};

export async function view(fn: string, args: (string | number)[]): Promise<unknown> {
  seed();
  await delay(60);
  const now = mockNow();
  const idKey = (v: unknown) => pyStrip(String(v)).slice(0, ID_CHARS);
  const addrKey = (v: unknown) => pyStrip(String(v)).toLowerCase().slice(0, ADDRESS_CHARS);
  switch (fn) {
    case "event": {
      if (!isStr(args[0])) return JSON.stringify({ error: "the event id is a string" });
      const key = idKey(args[0]);
      if (!eventRows.has(key)) return JSON.stringify({ error: "no event " + key, event: key });
      return JSON.stringify(eventRow(key, now));
    }
    case "events": {
      const total = n.event_count;
      const off = numberArg(args[0]);
      const start = Number(off < 0n ? 0n : off);
      let size = Number(numberArg(args[1]));
      size = size < 1 || size > PAGE ? PAGE : size;
      const rows: Row[] = [];
      for (let k = start + 1; k <= Math.min(total, start + size); k++) rows.push(eventRow("E" + k, now));
      return JSON.stringify({ total, offset: start, limit: size, rows, now });
    }
    case "events_of": {
      if (!isStr(args[0])) return JSON.stringify({ error: "the address is a string" });
      const key = addrKey(args[0]);
      const p = pageOf("organizer:" + key, args[1], args[2]);
      return JSON.stringify({ address: key, total: p.total, offset: p.start, limit: p.size, rows: p.ids.map((i) => eventRow(i, now)), now });
    }
    case "ticket": {
      if (!isStr(args[0])) return JSON.stringify({ error: "the ticket id is a string" });
      const key = idKey(args[0]);
      if (!ticketRows.has(key)) return JSON.stringify({ error: "no ticket " + key, ticket: key });
      return JSON.stringify(ticketRow(key));
    }
    case "tickets_of": {
      if (!isStr(args[0])) return JSON.stringify({ error: "the address is a string" });
      const key = addrKey(args[0]);
      const p = pageOf("holder:" + key, args[1], args[2]);
      return JSON.stringify({ address: key, total: p.total, offset: p.start, limit: p.size, rows: p.ids.map(ticketRow) });
    }
    case "event_tickets": {
      if (!isStr(args[0])) return JSON.stringify({ error: "the event id is a string" });
      const key = idKey(args[0]);
      const p = pageOf("event:" + key, args[1], args[2]);
      return JSON.stringify({ event: key, total: p.total, offset: p.start, limit: p.size, rows: p.ids.map(ticketRow) });
    }
    case "reviews_of": {
      if (!isStr(args[0])) return JSON.stringify({ error: "the event id is a string" });
      const key = idKey(args[0]);
      const p = pageOf("reviews:" + key, args[1], args[2]);
      return JSON.stringify({ event: key, total: p.total, offset: p.start, limit: p.size, rows: p.ids.map(reviewRow) });
    }
    case "credit": {
      if (!isStr(args[0])) return JSON.stringify({ error: "the address is a string" });
      const key = addrKey(args[0]);
      const held = creditFor(key);
      return JSON.stringify({ address: key, credit: held.toString(), review_fee: REVIEW_FEE.toString(), reviews: Number(held / REVIEW_FEE) });
    }
    case "stats":
      return JSON.stringify({
        events: n.event_count, changed: n.n_changed, changed_by_review: n.n_by_review, cancelled: n.n_cancelled, tickets: n.ticket_count, refunded: n.n_refunded,
        settled: n.n_settled, reviews: n.review_count, material: n.n_material, minor: n.n_minor, unclear: n.n_unclear, repeats: n.n_repeats,
        held: n.held_total.toString(), sales: n.sales_total.toString(), refunded_total: n.refunded_total.toString(), to_organizers: n.to_organizers.toString(),
        credit: n.credit_total.toString(), deposited: n.deposited_total.toString(), credit_out: n.credit_out.toString(), fees: n.fees_total.toString(),
        refused_payments: n.n_refused, returned: n.returned.toString(),
      });
    case "rules":
      return JSON.stringify(RULES);
    default:
      throw new Error("the mock has no view " + fn);
  }
}

// ---- transactions ---------------------------------------------------------------------------------

type Pending = { fn: string; polls: number; result: Row; error: string; judged: boolean; settled: boolean };
const pending = new Map<string, Pending>();
let txCount = 0;
const fakeHash = () => "0x" + (++txCount).toString(16).padStart(8, "0") + "c4a96ed0".repeat(7);

/** Runs one call as `sender` and records it as a transaction; the hash comes back at once. */
function send(sender: string, fn: WriteFn, args: unknown[], value: bigint): string {
  if (value > balance(sender)) throw new Error("insufficient funds for this demo account");
  if (value > 0n) {
    credit(sender, -value);
    contractBalance += value;
  }
  let result: Row = {};
  let error = "";
  let settledRound = true;
  try {
    result = run(fn, args, { sender, value, now: mockNow() });
  } catch (e) {
    if (!(e instanceof Refused) && !(e instanceof NotSettled)) throw e;
    // A raised refusal changes nothing; no write that takes value raises, but the value goes back regardless.
    if (value > 0n) {
      contractBalance -= value;
      credit(sender, value);
    }
    error = e.message;
    settledRound = !(e instanceof NotSettled);
  }
  const hash = fakeHash();
  const judged = fn === "review" && (!error || !settledRound);
  pending.set(hash, { fn, polls: 0, result, error, judged, settled: settledRound });
  notify();
  return hash;
}

export async function write(call: Call): Promise<string> {
  seed();
  await delay(250);
  return send(persona.toLowerCase(), call.fn, call.args, call.value ?? 0n);
}

const STAGES = ["PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED", "FINALIZED"];
const NO_VOTES = { agree: 0, disagree: 0, idle: 0 };

export async function txStatus(hash: string): Promise<TxStatus> {
  await delay(60);
  const p = pending.get(hash);
  if (!p) return { status: "UNKNOWN", votes: NO_VOTES, applied: null, undetermined: false, exec: null, result: null, message: "" };
  p.polls += 1;
  // A review fetches a page and asks four questions on every validator, so it moves slower.
  const stages = p.judged ? Math.max(1, Math.floor(p.polls / 2)) : p.polls;
  const done = stages >= STAGES.length;
  if (!p.settled) {
    // The page could not be read: every validator disagrees with a leader that raised, and the round
    // ends with no majority. Nothing is stored.
    const disagree = done ? 4 : Math.min(Math.max(0, stages - 2), 4);
    return {
      status: done ? "UNDETERMINED" : STAGES[Math.min(stages - 1, STAGES.length - 2)],
      votes: { agree: 0, disagree, idle: done || disagree ? 5 - disagree : 0 },
      applied: done ? false : null,
      undetermined: done,
      exec: done ? "ERROR" : null,
      result: null,
      message: done ? p.error : "",
    };
  }
  // Studio assigns five validators and one is often idle in a round; the mock shows the same shape.
  const agree = done ? 4 : p.judged ? Math.min(Math.max(0, stages - 2), 4) : 0;
  return {
    status: STAGES[Math.min(stages - 1, STAGES.length - 1)],
    votes: { agree, disagree: 0, idle: done || agree ? 5 - agree : 0 },
    applied: done ? true : null,
    undetermined: false,
    exec: done ? (p.error ? "ERROR" : "SUCCESS") : null,
    result: done && !p.error ? p.result : null,
    message: done ? p.error || JSON.stringify(p.result) : "",
  };
}

/** True once a transaction the mock knows has been polled to a final status (or it never existed). */
const isDone = (hash: string): boolean => {
  const p = pending.get(hash);
  if (!p) return true;
  return (p.judged ? Math.floor(p.polls / 2) : p.polls) >= STAGES.length;
};

export async function balanceOf(address: string): Promise<bigint> {
  await delay(40);
  return balance(address);
}

export async function faucet(address: string): Promise<bigint> {
  await delay(500);
  credit(address, 10n * GEN);
  return balance(address);
}

// ---- the demo organizer ----------------------------------------------------------------------------

/** The newest event the demo organizer opened under the demo name, or "". */
function demoEventId(): string {
  const mine = (lists.get("organizer:" + DEMO_ORGANIZER) ?? []).filter((id) => eventRows.get(id)!.name === DEMO_EVENT_NAME);
  return mine[mine.length - 1] ?? "";
}

const demoRow = (id: string) => {
  const e = id ? eventRows.get(id) : undefined;
  return e ? { id, status: e.status, startsAt: e.starts_at, sold: e.sold, capacity: e.capacity, reviewUntil: e.starts_at + AFTER_START } : null;
};

export function demoStatus(): DemoStatus {
  seed();
  const id = demoEventId();
  return { online: true, organizer: DEMO_ORGANIZER, event: id, eventState: demoStateOf(demoRow(id), mockNow()), reason: "", notices: true, noticesReason: "", prefix: MOCK_PREFIX };
}

/** The demo organizer's last transaction per event: it acts one transaction at a time. */
const lastDemoTx = new Map<string, string>();
const STILL_GOING = (id: string) => `the demo organizer is still waiting for its last transaction on ${id} to be final; try again once it is`;

/** The in-memory twin of POST /api/demo/notice: the demo organizer asks the network to read one of its six fixed notices. */
export async function demoNotice(rawEvent: string, key: string): Promise<DemoAnswer> {
  seed();
  await delay(300);
  const id = pyStrip(String(rawEvent ?? "")).slice(0, ID_CHARS);
  const before = (lists.get("reviews:" + id) ?? []).map((rid) => ({ id: rid, url: reviewRows.get(rid)!.url, finding: reviewRows.get(rid)!.finding }));
  const problem = demoNoticeProblem(demoRow(id), demoEventId(), key, before, mockNow());
  if (problem) return { ok: false, reason: problem };
  const last = lastDemoTx.get(id);
  if (last && !isDone(last)) return { ok: false, reason: STILL_GOING(id) };
  if (creditFor(DEMO_ORGANIZER) < DEMO_CREDIT_LOW) send(DEMO_ORGANIZER, "deposit", [], DEMO_CREDIT_TOP_UP);
  const hash = send(DEMO_ORGANIZER, "review", [id, mockNotice(key)], 0n);
  lastDemoTx.set(id, hash);
  return { ok: true, hash };
}

/** The in-memory twin of POST /api/demo/reopen: a fresh demo event once the last one started, sold out or changed. */
export async function demoReopen(): Promise<DemoAnswer> {
  seed();
  await delay(300);
  const id = demoEventId();
  const problem = reopenProblem(demoRow(id), mockNow());
  if (problem) return { ok: false, reason: problem };
  const last = lastDemoTx.get("open");
  if (last && !isDone(last)) return { ok: false, reason: "the demo organizer is still opening the next demo event; it is on its way" };
  const hash = send(DEMO_ORGANIZER, "open_event", [DEMO_EVENT_NAME, DEMO_TERMS_JSON, MOCK_PREFIX, DEMO_PRICE.toString(), DEMO_CAPACITY, mockNow() + DEMO_LEAD], 0n);
  lastDemoTx.set("open", hash);
  return { ok: true, hash };
}

// ---- seeding ---------------------------------------------------------------------------------------

let seeded = false;

/** Runs a call at a given instant, outside the transaction log: the seeded past. */
function at(sender: string, now: number, fn: WriteFn, args: unknown[], value = 0n): Row {
  if (value > 0n) {
    credit(sender, -value);
    contractBalance += value;
  }
  return run(fn, args, { sender, value, now });
}

function seed(): void {
  if (seeded) return;
  seeded = true;
  const now = mockNow();
  const MIN = 60;
  const HOUR = 3600;
  const DAY = 86400;
  const D = DEMO_ORGANIZER;
  const F = EARLIER_FAN;
  const O = MY_ORGANIZER;
  // The demo organizer keeps review credit for its notice buttons.
  at(D, now - 4 * DAY, "deposit", [], DEMO_CREDIT_TOP_UP);
  // E1: an earlier Harbour Lights Festival. A later door time was read as minor, then the move to
  // 21 June as material; the earlier fan took the price back from escrow.
  let t = now - 3 * DAY;
  at(D, t, "open_event", [DEMO_EVENT_NAME, DEMO_TERMS_JSON, MOCK_PREFIX, DEMO_PRICE.toString(), DEMO_CAPACITY, t + DEMO_LEAD]);
  at(F, t + 10 * MIN, "buy", ["E1"], DEMO_PRICE);
  at(PASSER_BY, t + 15 * MIN, "buy", ["E1"], DEMO_PRICE);
  at(D, t + 20 * MIN, "review", ["E1", mockNotice("doors-later")]);
  at(D, t + HOUR, "review", ["E1", mockNotice("new-date")]);
  at(F, t + 2 * HOUR, "refund", ["T1"]);
  at(PASSER_BY, t + 3 * HOUR, "refund", ["T2"]);
  // E2: the "You, an organizer" persona's jazz night. Nothing changed; a day after the start its
  // tickets settled to the organizer, one per call.
  t = now - 5 * DAY;
  const jazz = { date: "2 November 2026", venue: "The Copper Lane Rooms", main_act: "Maple & Ash Quartet", details: "Doors 19:30. Seated." };
  at(O, t, "open_event", ["Copper Lane Jazz Night", termsJson(jazz), "https://copperlane.example/jazz/notices/", (GEN / 5n).toString(), 40, t + 3 * HOUR]);
  at(F, t + 20 * MIN, "buy", ["E2"], GEN / 5n);
  at(F, t + 30 * MIN, "buy", ["E2"], GEN / 5n);
  at(O, t + 3 * HOUR + DAY + 10 * MIN, "settle", ["T3"]);
  at(F, t + 3 * HOUR + DAY + 20 * MIN, "settle", ["T4"]);
  // E3: the same organizer's folk night, on sale in two days, one ticket sold.
  t = now - 2 * HOUR;
  const folk = { date: "21 October 2026", venue: "Kestrel Bay Boathouse", main_act: "The Tidewater Choir", details: "Doors 18:00. Standing. Support: Fen Lanterns." };
  at(O, t, "open_event", ["Kestrel Bay Folk Night", termsJson(folk), "https://kestrelbay.example/2026/notices/", GEN.toString(), 120, now + 2 * DAY]);
  at(F, t + 30 * MIN, "buy", ["E3"], GEN);
  // E4: the demo event on sale now, six hours from its opening.
  t = now - 15 * MIN;
  at(D, t, "open_event", [DEMO_EVENT_NAME, DEMO_TERMS_JSON, MOCK_PREFIX, DEMO_PRICE.toString(), DEMO_CAPACITY, t + DEMO_LEAD]);
  at(F, t + 5 * MIN, "buy", ["E4"], DEMO_PRICE);
}

/** Test hook: the contract's books (held in escrow, review credit) and its own balance, which must add up. */
export function mockBooks(): { held: bigint; credit: bigint; balance: bigint } {
  seed();
  return { held: n.held_total, credit: n.credit_total, balance: contractBalance };
}

/** Every account the mock knows, for the tests' conservation checks. */
export const ACCOUNTS = [VISITOR, MY_ORGANIZER, DEMO_ORGANIZER, EARLIER_FAN, PASSER_BY];
