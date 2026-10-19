// The shapes the pages use, in one place with no runtime code: lib/chain.ts maps every view answer
// into these, and lib/chain-mock.ts answers in the contract's own JSON so the same mappers run in
// both modes. Every instant is seconds on the message clock; 0 until it happens. Every amount is a
// decimal string of atto.

import type { ChangedBy, EventStatus, FeeTo, Finding, Phase, TicketStatus } from "./rules.ts";

/** What happened to an event's tickets and notices so far. */
export type EventRecord = {
  refunded: number;
  refundedAtto: string;
  settled: number;
  settledAtto: string;
  reviews: number;
  material: number;
  minor: number;
  unclear: number;
  repeats: number;
  feesWonAtto: string;
};

/** event(id): one event, its terms (fixed for good), its escrow and where it stands on the view's clock. */
export type EventRow = {
  /** "E1" */
  id: string;
  organizer: string;
  name: string;
  date: string;
  venue: string;
  mainAct: string;
  details: string;
  sitePrefix: string;
  priceAtto: string;
  capacity: number;
  sold: number;
  left: number;
  startsAt: number;
  openedAt: number;
  status: EventStatus;
  changedBy: ChangedBy;
  changedAt: number;
  changeReview: string;
  heldAtto: string;
  /** reviews are taken until this instant (0 once the event changed) */
  reviewUntil: number;
  /** a ticket nobody can claim any more settles to the organizer from this instant */
  settleFrom: number;
  /** refunds are taken until this instant (0 while the event is on) */
  refundUntil: number;
  record: EventRecord;
  /** the view's own clock; 0 when the read had none */
  now: number;
  phase: Phase;
};

/** ticket(id): one ticket and its event's status. */
export type Ticket = {
  /** "T4" */
  id: string;
  event: string;
  eventName: string;
  eventStatus: EventStatus;
  holder: string;
  n: number;
  priceAtto: string;
  boughtAt: number;
  status: TicketStatus;
  closedAt: number;
  startsAt: number;
};

/** One review: which page, what the network found, where the fee went. */
export type Review = {
  /** "R2" */
  id: string;
  event: string;
  reviewer: string;
  url: string;
  finding: Finding;
  fp: string;
  /** the earlier review of the same text whose finding this one carries; "" when first */
  repeatOf: string;
  feeTo: FeeTo;
  /** the reviewer held a ticket to the event */
  holder: boolean;
  at: number;
};

export type Credit = { address: string; creditAtto: string; reviewFeeAtto: string; reviews: number };

export type Paged<T> = { total: number; offset: number; limit: number; rows: T[] };

/** stats(): totals only. Amounts in atto. */
export type Stats = {
  events: number;
  changed: number;
  changedByReview: number;
  cancelled: number;
  tickets: number;
  refunded: number;
  settled: number;
  reviews: number;
  material: number;
  minor: number;
  unclear: number;
  repeats: number;
  heldAtto: string;
  salesAtto: string;
  refundedAtto: string;
  toOrganizersAtto: string;
  creditAtto: string;
  depositedAtto: string;
  creditOutAtto: string;
  feesAtto: string;
  refusedPayments: number;
  returnedAtto: string;
};

/** rules(): the contract's own words, kept as it wrote them. */
export type Rules = Record<string, unknown>;

export type Votes = { agree: number; disagree: number; idle: number };

export type TxStatus = {
  /** PENDING | PROPOSING | COMMITTING | REVEALING | ACCEPTED | FINALIZED | CANCELED | UNDETERMINED | UNKNOWN */
  status: string;
  votes: Votes;
  /** null until votes exist */
  applied: boolean | null;
  /** finished with no majority: nothing was stored */
  undetermined: boolean;
  /** SUCCESS | ERROR | null */
  exec: string | null;
  /** the contract's JSON return, if any */
  result: Record<string, unknown> | null;
  /** the decoded return or error text */
  message: string;
};

export type ReadResult<T> = { data: T; source: "chain" | "mock" };

/** The contract's write methods, by name. */
export type WriteFn = "open_event" | "cancel" | "buy" | "refund" | "settle" | "deposit" | "withdraw" | "review";

export type Arg = string | number;

/** One contract call, ready to sign: the method, its arguments in the contract's order, and the value sent. */
export type Call = { fn: WriteFn; args: Arg[]; value?: bigint };

/** Where the demo event stands for the demo organizer: open for sales and notices, or why a fresh one is due. */
export type DemoEventState = "open" | "none" | "started" | "changed" | "sold_out";

/**
 * Whether the demo organizer can act now, whose it is, which event it runs, and exactly why not.
 * `notices` says whether its notices are pinned to a commit of a known repository (it cannot open or
 * review without them); `eventState` whether its newest event still takes sales and notices.
 */
export type DemoStatus = {
  online: boolean;
  organizer: string;
  event: string;
  eventState: DemoEventState;
  reason: string;
  notices: boolean;
  noticesReason: string;
  /** the pinned folder the demo event reads its notices from; "" while it is not known */
  prefix: string;
};

/** What the demo organizer answered when asked to act: a transaction hash, or why not. */
export type DemoAnswer = { ok: true; hash: string } | { ok: false; reason: string; retryAfter?: number };
