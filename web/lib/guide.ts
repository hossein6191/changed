// What a visitor is told whenever they wait, in plain lines: what is happening now and who it waits
// for, how long that takes or the exact time, whether anything is needed from them, whether they can
// close the page and where things stay, and where the money is: in escrow until the event or a refund.
// The same words for every in-between state of the site: a wallet prompt, a transaction on its way,
// the validators reading a notice, the demo organizer at work, a ticket bought and waiting for the
// show, a notice read as minor, as unclear or as a repeat, a material change with the refunds open, a
// cancellation, the settle window, and every way a ticket ends.
//
// Pure, with no React: the state, the viewer's role and the clock in, the words out. The waiting
// handbill (components/wait-bill.tsx) renders a guide; the rows of /tickets and /organizer print the
// one-line form. tests/unit/guide.test.mjs runs every state for every role. Nothing here may promise
// what contracts/changed.py does not do.

import { gen, plural, span } from "./format.ts";
import { AFTER_START, REFUND_WINDOW, REVIEW_FEE, type ChangedBy, type EventStatus, type FeeTo, type Finding, type TicketStatus } from "./rules.ts";
import type { WriteFn } from "./types.ts";

/** Who is looking: a holder of a ticket to the event, its organizer, or anyone else. */
export type Role = "holder" | "organizer" | "visitor";

/** Who or what the state waits for, for the bill's kicker. */
export type Waiter = "you" | "validators" | "show" | "holders" | "anyone" | "demo" | "nobody" | "done";

export type GuideTone = "busy" | "waiting" | "ready" | "alert" | "done";

export type Guide = {
  /** a stable name for the state, written on the bill for tests and tools */
  id: string;
  tone: GuideTone;
  waitsFor: Waiter;
  /** the small capitals above the line: who it waits for */
  kicker: string;
  /** 1. what is happening now (a headline, no full stop) */
  now: string;
  /** 2. how long it usually takes, or the exact time */
  time: string;
  /** 3. whether anything is needed from the viewer right now */
  need: string;
  /** 4. whether the viewer can close the page, and where the thing stays */
  leave: string;
  canLeave: boolean;
  /** 5. where the money is right now, with the amount */
  money: string;
  /** one more sentence when the state needs it */
  note?: string;
  /** seconds until the next thing happens on the contract's clock, for a countdown */
  left?: number;
  leftLabel?: string;
};

export const KICKERS: Record<Waiter, string> = {
  you: "Your move",
  validators: "The network is reading",
  show: "Waiting for the show",
  holders: "Waiting for the holders",
  anyone: "Open to anyone",
  demo: "Waiting for the demo organizer",
  nobody: "Nothing is waiting on you",
  done: "Closed · nothing left to do",
};

export const NOTHING_NEEDED = "Nothing is needed from you.";
export const NOTHING_LEFT = "Nothing is left to do here.";

type Lines = Omit<Guide, "kicker"> & { kicker?: string };
const make = (g: Lines): Guide => ({ ...g, kicker: g.kicker ?? KICKERS[g.waitsFor] });

const FEE = gen(REVIEW_FEE);

const ABOUT_30 = (mock?: boolean) => (mock ? "A few seconds in this demo build; about 30 seconds on Studio." : "About 30 seconds.");
const READING_TIME = (mock?: boolean) =>
  mock
    ? "A few seconds in this demo build; 2 to 5 minutes on Studio, where every validator fetches the page itself."
    : "Usually 2 to 5 minutes: every validator fetches the page itself and asks its model four questions about it.";

/** "21:40, in 5 h 12 min" or "2 h ago" (no full stop). */
const at = (instant: number, now: number): string => {
  if (!instant) return "a time the contract has not set";
  if (!now) return "the time on the poster";
  return instant > now ? `in ${span(instant - now)}` : `${span(now - instant)} ago`;
};

/** "You can close this page; E4 stays at /event/E4" (no full stop). */
function keep(id: string, role: Role): string {
  if (role === "holder") return `You can close this page; your ticket to ${id} stays under My tickets`;
  if (role === "organizer") return `You can close this page; ${id} stays on your organizer's desk`;
  return `You can close this page and come back to ${id} later`;
}

// ---- the wallet prompt --------------------------------------------------------------------------------

export type SignInput = {
  fn: WriteFn;
  /** what the call does, e.g. "Buying a ticket to E4 for 0.5 GEN" */
  label: string;
  /** the ticket price, sent with buy or paid out by refund and settle */
  priceAtto?: string;
  /** the value sent with deposit, or the credit withdraw takes back */
  valueAtto?: string;
  event?: string;
  mock?: boolean;
};

/** Where the money is while a signature is waiting: nothing has moved yet. */
function moneyBeforeSigning(s: SignInput): string {
  const price = gen(s.priceAtto ?? "0");
  const value = gen(s.valueAtto ?? "0");
  switch (s.fn) {
    case "buy":
      return `${price} is still in your wallet. Once you confirm it is held by the contract, in escrow, not paid to the organizer; a refused purchase sends all of it back in the same transaction.`;
    case "refund":
      return `${price} is held in escrow for this ticket; refunding sends it back to you in the same transaction.`;
    case "settle":
      return `${price} is held in escrow for this ticket; settling sends it to the organizer in the same transaction.`;
    case "deposit":
      return `${value} is still in your wallet. Once you confirm it becomes your review credit, held by the contract; withdraw takes all of it back at any time.`;
    case "withdraw":
      return `Your ${value} of review credit is held by the contract; withdrawing sends all of it back to you.`;
    case "review":
      return `The review takes ${FEE} of your review credit, held by the contract until the reading lands; no GEN leaves your wallet with this signature.`;
    case "cancel":
      return "Cancelling sends no GEN. Every ticket price stays in escrow, and each holder takes theirs back with a refund.";
    case "open_event":
      return "This sends no GEN; an event holds nothing until somebody buys a ticket.";
  }
}

/** A signature is waiting in the wallet. */
export function signGuide(s: SignInput): Guide {
  return make({
    id: "sign-" + s.fn,
    tone: "busy",
    waitsFor: "you",
    kicker: "Waiting for your wallet",
    now: `Your wallet is asking you to sign: ${s.label}`,
    time: "As long as you take. Nothing happens until you confirm in the wallet.",
    need: "Confirm in your wallet, or reject there to send nothing.",
    leave: "Stay on this page until the wallet answers; closing it now sends nothing.",
    canLeave: false,
    money: moneyBeforeSigning(s),
  });
}

export type SendingInput = {
  fn: Exclude<WriteFn, "review">;
  label: string;
  event: string;
  role: Role;
  priceAtto?: string;
  valueAtto?: string;
  mock?: boolean;
};

/** A transaction is on its way (anything but a review, which has its own reading guide). */
export function sendingGuide(s: SendingInput): Guide {
  const price = gen(s.priceAtto ?? "0");
  const value = gen(s.valueAtto ?? "0");
  const where = s.event || "this event";
  const money: Record<SendingInput["fn"], string> = {
    open_event: "No GEN moves with this; the event holds nothing until a ticket is sold.",
    cancel: `No GEN moves with the cancel itself. Every ticket price of ${where} stays in escrow until each holder takes theirs back.`,
    buy: `${price} has left your wallet and is with the contract, in escrow. If the purchase is refused it comes back in the same transaction.`,
    refund: `${price} is still in escrow until this is final; then it is back in your wallet within seconds.`,
    settle: `${price} is still in escrow until this is final; then it goes to the organizer.`,
    deposit: `${value} has left your wallet and is with the contract as your review credit.`,
    withdraw: `Your ${value} of credit is still with the contract until this is final; then it is back in your wallet.`,
  };
  return make({
    id: "sending-" + s.fn,
    tone: "busy",
    waitsFor: "validators",
    kicker: "On its way",
    now: `${s.label}: the validators are checking the call`,
    time: ABOUT_30(s.mock),
    need: NOTHING_NEEDED,
    leave: `${keep(where, s.role)}; the transaction goes through whether the page is open or not.`,
    canLeave: true,
    money: money[s.fn],
  });
}

/** A short line while the page re-reads the chain after a change. */
export function updatingGuide(what: string): Guide {
  return make({
    id: "updating",
    tone: "busy",
    waitsFor: "nobody",
    kicker: "Reading the chain",
    now: `Reading ${what} again`,
    time: "A second or two.",
    need: NOTHING_NEEDED,
    leave: "You can close this page; nothing is waiting on it.",
    canLeave: true,
    money: "Nothing moves while the page reads.",
  });
}

// ---- the validators reading a notice -------------------------------------------------------------------

export type ReadingInput = {
  event: string;
  /** the page's file name or address, for the headline */
  page: string;
  role: Role;
  /** who asked: the visitor, or the demo organizer from its own credit */
  by: "you" | "demo";
  mock?: boolean;
};

/** Every validator is fetching the page and asking its four questions. */
export function readingGuide(r: ReadingInput): Guide {
  const fee =
    r.by === "demo"
      ? `The demo organizer pays the ${FEE} review fee from its own credit; your ticket price stays in escrow whatever the reading.`
      : `${FEE} of your review credit is set aside for this reading: it stays yours on a material change (and on your first unclear reading while you hold a ticket), and goes to the organizer otherwise. If the page cannot be read nothing is taken.`;
  return make({
    id: "reading",
    tone: "busy",
    waitsFor: "validators",
    now: `The validators are reading ${r.page} against the terms of ${r.event}`,
    time: READING_TIME(r.mock),
    need: NOTHING_NEEDED,
    leave: `${keep(r.event, r.role)}; the reading lands on the chain whether the page is open or not.`,
    canLeave: true,
    money: fee,
    note: "Each validator asks two questions in both orders: does the page say the event will not take place as described, and will it still take place as described. Only four matching answers are material or minor; anything else is unclear.",
  });
}

export type DemoInput = { state: "asking" | "failed" | "reopening"; what: string; event: string; reason?: string; mock?: boolean };

/** Asking the demo organizer to announce a notice, or to open a fresh demo event. */
export function demoGuide(d: DemoInput): Guide {
  if (d.state === "failed")
    return make({
      id: "demo-failed",
      tone: "alert",
      waitsFor: "you",
      kicker: "The demo organizer did not act",
      now: `The demo organizer did not ${d.what}`,
      time: "Try again in a minute, or press another notice.",
      need: d.reason ? `Why: ${d.reason.replace(/\.$/, "")}.` : "Nothing; the server did not say why.",
      leave: "You can close this page; nothing was sent and nothing changed.",
      canLeave: true,
      money: "Nothing moved: your ticket price, if you hold one, stays in escrow.",
    });
  return make({
    id: d.state === "reopening" ? "demo-reopening" : "demo-asking",
    tone: "busy",
    waitsFor: "demo",
    now: d.state === "reopening" ? "The demo organizer is opening a fresh Harbour Lights Festival" : `The demo organizer is posting the notice and asking the network to ${d.what}`,
    time: d.mock ? "A second in this demo build; a few seconds on Studio before its transaction appears." : "A few seconds before its transaction appears below.",
    need: NOTHING_NEEDED,
    leave: "Stay a moment: the transaction's link appears here once the demo organizer has sent it.",
    canLeave: false,
    money: d.state === "reopening" ? "No GEN moves; the new event holds nothing until a ticket is sold." : `The demo organizer pays the ${FEE} review fee; your ticket price stays in escrow.`,
  });
}

// ---- an event's state, for one viewer ---------------------------------------------------------------

/** The latest review of the event, as the viewer last saw it. */
export type LastReading = { review: string; finding: Finding; repeatOf: string; feeTo: FeeTo; mine: boolean };

export type EventInput = {
  role: Role;
  now: number;
  id: string;
  status: EventStatus;
  changedBy: ChangedBy;
  startsAt: number;
  sold: number;
  capacity: number;
  priceAtto: string;
  heldAtto: string;
  /** the viewer's own tickets to this event, by status */
  mine: { valid: number; refunded: number; settled: number };
  last?: LastReading | null;
  mock?: boolean;
};

const escrowOf = (g: EventInput) => gen(BigInt(g.priceAtto || "0") * BigInt(g.mine.valid));

/** Where an event stands for one viewer, as five lines. */
export function eventGuide(g: EventInput): Guide {
  const { role, now, id } = g;
  const settleOn = g.startsAt + AFTER_START;
  const refundEnd = g.startsAt + REFUND_WINDOW;
  const held = gen(g.heldAtto);
  const tickets = plural(g.mine.valid, "ticket");

  // ---- changed: a material change was found, or the organizer cancelled
  if (g.status === "changed") {
    const what = g.changedBy === "organizer" ? "The organizer cancelled" : "A material change was found";
    const idBase = g.changedBy === "organizer" ? "cancelled" : "refunds";
    if (now >= refundEnd) {
      if (role === "holder" && g.mine.valid > 0)
        return make({
          id: "refunds-closed",
          tone: "alert",
          waitsFor: "anyone",
          now: `Refunds of ${id} closed seven days after the start`,
          time: `They closed ${at(refundEnd, now)}.`,
          need: "Nothing can bring the refund back now: an unrefunded ticket settles to the organizer when anyone sends settle.",
          leave: `${keep(id, role)}.`,
          canLeave: true,
          money: `${escrowOf(g)} is still in escrow for your ${tickets}, and goes to the organizer on settle.`,
        });
      return make({
        id: "refunds-closed",
        tone: role === "organizer" ? "ready" : "done",
        waitsFor: role === "organizer" ? "you" : "done",
        now: `Refunds of ${id} have closed`,
        time: `They closed ${at(refundEnd, now)}.`,
        need: role === "organizer" ? "Settle each ticket nobody refunded, one per call; anyone may send it." : NOTHING_LEFT,
        leave: `${keep(id, role)}.`,
        canLeave: true,
        money: role === "organizer" ? `${held} of unrefunded tickets is still in escrow and settles to you, one ticket per call.` : `${held} is left in escrow, for tickets nobody refunded; it settles to the organizer.`,
      });
    }
    if (role === "holder" && g.mine.valid > 0)
      return make({
        id: idBase,
        tone: "ready",
        waitsFor: "you",
        kicker: "Refunds are open",
        now: `${what}: take your money back`,
        time: `Refunds stay open until seven days after the start, ${at(refundEnd, now)}.`,
        need: `Press Refund on each ticket you hold: one ticket per call, ${plural(g.mine.valid, "call")}.`,
        leave: `${keep(id, role)}; the refund stays open until then, and after that the price goes to the organizer.`,
        canLeave: true,
        money: `${escrowOf(g)} is still in escrow for your ${tickets}, waiting for your refund.`,
        left: Math.max(0, refundEnd - now),
        leftLabel: "refunds close",
      });
    if (role === "holder")
      return make({
        id: idBase + "-done",
        tone: "done",
        waitsFor: "done",
        now: g.mine.refunded > 0 ? `${what}, and your money is back` : `${what}; your tickets are closed`,
        time: "Nothing is left to wait for.",
        need: NOTHING_LEFT,
        leave: `${keep(id, role)}.`,
        canLeave: true,
        money: g.mine.refunded > 0 ? `${gen(BigInt(g.priceAtto || "0") * BigInt(g.mine.refunded))} went back to your wallet from escrow.` : "Your tickets' prices have left escrow.",
      });
    if (role === "organizer")
      return make({
        id: idBase,
        tone: "waiting",
        waitsFor: "holders",
        now: g.changedBy === "organizer" ? `You cancelled ${id}: holders take their money back` : `${what} on ${id}: holders take their money back`,
        time: `Refunds stay open until seven days after the start, ${at(refundEnd, now)}.`,
        need: "Nothing; each holder sends their own refund.",
        leave: `${keep(id, role)}.`,
        canLeave: true,
        money: `${held} is still in escrow. Whatever nobody refunds by then settles to you, one ticket per call.`,
        left: Math.max(0, refundEnd - now),
        leftLabel: "refunds close",
      });
    return make({
      id: idBase,
      tone: "waiting",
      waitsFor: "holders",
      now: `${what}: ${id}'s refunds are open to its holders`,
      time: `Refunds stay open until seven days after the start, ${at(refundEnd, now)}.`,
      need: "Nothing; you hold no ticket to this event. Holders refund their own.",
      leave: `${keep(id, role)}.`,
      canLeave: true,
      money: `${held} is in escrow, waiting for the holders' refunds.`,
    });
  }

  // ---- on: the event did not change (yet)
  if (now >= settleOn) {
    if (role === "holder" && g.mine.valid > 0)
      return make({
        id: "settling",
        tone: "waiting",
        waitsFor: "anyone",
        now: `Nothing changed: ${id} took place as described`,
        time: `Settling opened a day after the start, ${at(settleOn, now)}.`,
        need: "Nothing; there is no refund for an event that did not change. Anyone may send settle.",
        leave: `${keep(id, role)}.`,
        canLeave: true,
        money: `${escrowOf(g)} is still in escrow for your ${tickets}; it goes to the organizer on settle.`,
      });
    if (role === "holder")
      return make({
        id: "settled",
        tone: "done",
        waitsFor: "done",
        now: `${id} took place as described and your tickets are settled`,
        time: "Nothing is left to wait for.",
        need: NOTHING_LEFT,
        leave: `${keep(id, role)}.`,
        canLeave: true,
        money: "The ticket prices went to the organizer from escrow.",
      });
    if (role === "organizer")
      return make({
        id: "settling",
        tone: BigInt(g.heldAtto || "0") > 0n ? "ready" : "done",
        waitsFor: BigInt(g.heldAtto || "0") > 0n ? "you" : "done",
        kicker: BigInt(g.heldAtto || "0") > 0n ? "Settle open" : undefined,
        now: BigInt(g.heldAtto || "0") > 0n ? `Nothing changed: settle ${id}'s tickets to you` : `${id} is settled`,
        time: `Settling opened a day after the start, ${at(settleOn, now)}.`,
        need: BigInt(g.heldAtto || "0") > 0n ? "Press Settle on each ticket, one per call; anyone may send it." : NOTHING_LEFT,
        leave: `${keep(id, role)}.`,
        canLeave: true,
        money: `${held} is still in escrow and comes to you one ticket per call.`,
      });
    return make({
      id: "settling",
      tone: "done",
      waitsFor: "anyone",
      now: `Nothing changed: ${id}'s tickets settle to the organizer`,
      time: `Settling opened a day after the start, ${at(settleOn, now)}.`,
      need: "Nothing; anyone may send settle, one ticket per call.",
      leave: `${keep(id, role)}.`,
      canLeave: true,
      money: `${held} is in escrow, going to the organizer one ticket per call.`,
    });
  }

  // A notice was just read and nothing changed: say what that reading means.
  const last = g.last;
  const started = now >= g.startsAt;
  const until = started ? `Notices can still be read until a day after the start, ${at(settleOn, now)}.` : `The show starts ${at(g.startsAt, now)}; notices can be read until a day after.`;
  const holding = role === "holder" && g.mine.valid > 0;
  const moneyOn =
    holding
      ? `${escrowOf(g)} for your ${tickets} is held in escrow until the event: back to you if a material change is found, to the organizer a day after the start if nothing changes.`
      : role === "organizer"
        ? `${held} is held in escrow for ${plural(g.sold, "ticket")}; it reaches you one ticket per call from a day after the start, if nothing changes.`
        : `${held} of ticket prices is held in escrow until the event or a refund.`;
  if (last && last.repeatOf)
    return make({
      id: "repeat",
      tone: "done",
      waitsFor: "nobody",
      kicker: "Read before",
      now: `That text was already read for ${id}: the earlier reading, ${last.finding}, stands`,
      time: until,
      need: "Nothing; asking again about the same text changes nothing. A different notice is read afresh.",
      leave: `${keep(id, role)}.`,
      canLeave: true,
      money: `${last.mine ? "Your" : "The"} ${FEE} review fee went to the organizer. ${moneyOn}`,
    });
  if (last && last.finding === "minor")
    return make({
      id: "minor",
      tone: "done",
      waitsFor: holding ? "show" : "nobody",
      kicker: "Minor · tickets stand",
      now: holding ? "Minor: your ticket stands and the show goes ahead as described" : `Minor: ${id} still takes place as described`,
      time: until,
      need: holding ? "Nothing; a door time or a support act is not a reason for a refund." : NOTHING_NEEDED,
      leave: `${keep(id, role)}.`,
      canLeave: true,
      money: `${last.mine ? "Your" : "The"} ${FEE} review fee went to the organizer. ${moneyOn}`,
    });
  if (last && last.finding === "unclear")
    return make({
      id: "unclear",
      tone: "alert",
      waitsFor: "nobody",
      kicker: "Unclear · nothing changed",
      now: `Unclear: the validators' answers did not all agree, so nothing changed on ${id}`,
      time: until,
      need: "Nothing is required. A clearer notice can be read if one is posted; the same text again is only a repeat.",
      leave: `${keep(id, role)}.`,
      canLeave: true,
      money: `${last.feeTo === "reviewer" ? `The ${FEE} review fee stayed with the reviewer: a holder's first unclear reading of an event is free.` : `The ${FEE} review fee went to the organizer.`} ${moneyOn}`,
    });
  if (started)
    return make({
      id: "started",
      tone: "waiting",
      waitsFor: "show",
      now: `${id} has started; its notices can still be read for a day`,
      time: `Settling opens a day after the start, ${at(settleOn, now)}.`,
      need: holding ? "Nothing, unless the organizer posted a change: then ask the network to read it." : NOTHING_NEEDED,
      leave: `${keep(id, role)}.`,
      canLeave: true,
      money: moneyOn,
      left: Math.max(0, settleOn - now),
      leftLabel: "settle opens",
    });
  const soldOut = g.sold >= g.capacity;
  if (holding)
    return make({
      id: "bought",
      tone: "waiting",
      waitsFor: "show",
      kicker: "Ticket held",
      now: "Your ticket is held in escrow until the show",
      time: until,
      need: "Nothing. If the organizer posts a notice, anyone can ask the network to read it against your ticket's terms.",
      leave: `${keep(id, role)}.`,
      canLeave: true,
      money: moneyOn,
      left: Math.max(0, g.startsAt - now),
      leftLabel: "until the show",
    });
  if (role === "organizer")
    return make({
      id: soldOut ? "sold-out" : "selling",
      tone: "waiting",
      waitsFor: "show",
      now: soldOut ? `${id} is sold out; the money waits in escrow` : `${id} is on sale; every price waits in escrow`,
      time: until,
      need: "Nothing. To call it off, cancel before the start and every holder can take their money back.",
      leave: `${keep(id, role)}.`,
      canLeave: true,
      money: moneyOn,
      left: Math.max(0, g.startsAt - now),
      leftLabel: "until the show",
    });
  return make({
    id: soldOut ? "sold-out" : "selling",
    tone: soldOut ? "done" : "ready",
    waitsFor: soldOut ? "show" : "you",
    kicker: soldOut ? "Sold out" : "On sale",
    now: soldOut ? `${id} is sold out` : `${id} is on sale: the price waits in escrow until the show`,
    time: until,
    need: soldOut ? "Nothing; no tickets are left." : `Nothing is required. Buying a ticket sends exactly ${gen(g.priceAtto)} into escrow.`,
    leave: `${keep(id, role)}.`,
    canLeave: true,
    money: moneyOn,
    left: Math.max(0, g.startsAt - now),
    leftLabel: "until the show",
  });
}

// ---- one ticket, in one line ----------------------------------------------------------------------

export type TicketInput = {
  id: string;
  event: string;
  status: TicketStatus;
  eventStatus: EventStatus;
  startsAt: number;
  priceAtto: string;
  now: number;
};

/** What one ticket is waiting for, and where its price is, in one line. */
export function ticketLine(t: TicketInput): string {
  const price = gen(t.priceAtto);
  if (t.status === "refunded") return `Refunded: ${price} went back to the holder from escrow.`;
  if (t.status === "settled") return `Settled: ${price} went to the organizer from escrow.`;
  if (t.eventStatus === "changed") {
    const end = t.startsAt + REFUND_WINDOW;
    if (t.now >= end) return `Refunds closed ${at(end, t.now)}; ${price} waits in escrow and settles to the organizer.`;
    return `${t.event} changed: refund open until ${at(end, t.now)}. ${price} waits in escrow for the holder.`;
  }
  if (t.now >= t.startsAt + AFTER_START) return `Nothing changed: ${price} in escrow settles to the organizer; anyone may send it.`;
  if (t.now >= t.startsAt) return `The show started; notices can be read until ${at(t.startsAt + AFTER_START, t.now)}. ${price} waits in escrow.`;
  return `Held in escrow until the show, ${at(t.startsAt, t.now)}: ${price} back to the holder if a material change is found.`;
}

/** What a review slip says about its money, in one line. */
export function feeLine(r: { finding: Finding; repeatOf: string; feeTo: FeeTo; holder: boolean }): string {
  if (r.repeatOf) return `A repeat of ${r.repeatOf}: the earlier reading stands; the ${FEE} fee went to the organizer.`;
  if (r.feeTo === "reviewer")
    return r.finding === "material" ? `The ${FEE} fee stayed with the reviewer: a material change pays for its own reading.` : `The ${FEE} fee stayed with the reviewer: a holder's first unclear reading of an event.`;
  return `The ${FEE} fee went to the organizer.`;
}
