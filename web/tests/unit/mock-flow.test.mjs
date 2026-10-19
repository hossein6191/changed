// Whole stories through the in-memory contract of mock mode, from node, with no browser:
//
//   node --test tests/unit/mock-flow.test.mjs
//
// A visitor buys a ticket to the demo festival and watches every finding land: the demo organizer's
// door-time notice read as minor, the same text asked again as a repeat, a page that cannot be fetched
// storing nothing, a split reading unclear (free for a holder the first time, paid the second), the
// demo organizer refusing a notice already read, and the move to 21 June read as material, after which
// both holders take their money back and nothing more is read. Then a fresh demo event, a cancellation,
// the settle windows of an unchanged and of a changed event, the end of the refunds, the purchases
// that are refused and returned, and the credit taken back. After every step no atto is created or
// lost, the contract holds exactly the valid tickets' prices and the review credit, and every event's
// escrow is its valid tickets.

import test from "node:test";
import assert from "node:assert/strict";

import * as mock from "../../lib/chain-mock.ts";
import { calls } from "../../lib/calls.ts";
import { DEMO_PRICE, NOTICES, noticeOf } from "../../lib/demo-event.ts";
import { AFTER_START, REFUND_WINDOW, REVIEW_FEE } from "../../lib/rules.ts";

const { VISITOR, DEMO_ORGANIZER, MY_ORGANIZER, EARLIER_FAN, PASSER_BY } = mock;
const FEE = REVIEW_FEE;

const view = async (fn, args) => JSON.parse(await mock.view(fn, args));

async function world() {
  let sum = mock.mockContractBalance();
  for (const a of mock.ACCOUNTS) sum += await mock.balanceOf(a);
  return sum;
}

/** Nothing created or lost; the contract holds the valid tickets' prices and the credit; every event's escrow is its valid tickets. */
async function conserved(total, step) {
  const { held, credit, balance } = mock.mockBooks();
  assert.equal(held + credit, balance, `${step}: the contract's balance is its escrow and its credit`);
  assert.equal(await world(), total, `${step}: no atto created or lost`);
  const st = await view("stats", []);
  assert.equal(BigInt(st.held), BigInt(st.sales) - BigInt(st.refunded_total) - BigInt(st.to_organizers), `${step}: held = sales - refunded - settled`);
  assert.equal(BigInt(st.credit), BigInt(st.deposited) - BigInt(st.credit_out) - BigInt(st.fees), `${step}: credit = deposited - withdrawn - fees`);
  let escrow = 0n;
  for (let k = 1; k <= st.events; k++) {
    const e = await view("event", ["E" + k]);
    let valid = 0n;
    for (let off = 0; off < e.sold; off += 20) {
      const page = await view("event_tickets", ["E" + k, off, 20]);
      for (const t of page.rows) if (t.status === "valid") valid += BigInt(t.price);
    }
    assert.equal(BigInt(e.held), valid, `${step}: E${k} holds exactly its valid tickets`);
    escrow += BigInt(e.held);
  }
  assert.equal(escrow, held, `${step}: the events' escrow adds up to the contract's`);
}

async function finalOf(hash) {
  for (let i = 0; i < 40; i++) {
    const s = await mock.txStatus(hash);
    if (s.status === "FINALIZED" || s.status === "UNDETERMINED") return s;
  }
  throw new Error("never final: " + hash);
}

/** Sends one call as `who` and waits for it. */
async function as(who, call) {
  mock.setMockPersona(who);
  return finalOf(await mock.write(call));
}

const refusedWith = (s, re) => {
  assert.equal(s.status, "FINALIZED");
  assert.equal(s.exec, "ERROR");
  assert.match(s.message, re);
};

const okResult = (s) => {
  assert.equal(s.status, "FINALIZED", s.message);
  assert.equal(s.result?.ok, true, s.message);
  return s.result;
};

test("a fan's whole story on the demo festival: minor, repeat, unread, unclear twice, material, refunds", async () => {
  const total = await world();
  await conserved(total, "seeded");
  const status = mock.demoStatus();
  assert.equal(status.online, true);
  assert.equal(status.eventState, "open");
  const E = status.event;
  const event = await view("event", [E]);
  assert.equal(event.status, "on");
  assert.equal(event.phase, "selling");

  // Buy: exactly the price goes into escrow.
  const before = await mock.balanceOf(VISITOR);
  const bought = okResult(await as(VISITOR, calls.buy(E, DEMO_PRICE)));
  const T = bought.ticket;
  assert.equal(await mock.balanceOf(VISITOR), before - DEMO_PRICE);
  await conserved(total, "bought");

  // No refund before anything changed.
  refusedWith(await as(VISITOR, calls.refund(T)), new RegExp(`${E} has not changed; a ticket is refunded once a review finds a material change`));

  // The demo organizer announces the later door time: minor, its fee to the organizer (itself).
  const a = await mock.demoNotice(E, "doors-later");
  assert.equal(a.ok, true);
  const r1 = okResult(await finalOf(a.hash));
  assert.equal(r1.finding, "minor");
  assert.equal(r1.fp, noticeOf("doors-later").fp);
  assert.equal(r1.fee_to, "organizer");
  assert.equal(r1.repeat_of, "");
  await conserved(total, "minor");

  // The same notice again from the demo organizer: refused before anything is sent.
  const again = await mock.demoNotice(E, "doors-later");
  assert.equal(again.ok, false);
  assert.match(again.reason, /doors-later\.html was already read for E\d+ as R\d+, minor/);

  // The visitor adds credit and asks about the same page: a repeat of the first reading, the fee to the organizer.
  okResult(await as(VISITOR, calls.deposit(5n * FEE)));
  await conserved(total, "deposited");
  const url = (key) => mock.MOCK_PREFIX + noticeOf(key).file;
  const r2 = okResult(await as(VISITOR, calls.review(E, url("doors-later"))));
  assert.equal(r2.repeat_of, r1.review);
  assert.equal(r2.finding, "minor");
  assert.equal(r2.fee_to, "organizer");
  assert.equal(r2.holder, true);
  assert.equal(BigInt(r2.credit), 4n * FEE);
  await conserved(total, "repeat");

  // A page below the prefix that cannot be fetched: nothing stored, no fee taken.
  const missing = await as(VISITOR, calls.review(E, mock.MOCK_PREFIX + "lineup.html"));
  assert.equal(missing.status, "UNDETERMINED");
  assert.match(missing.message, /\[TRANSIENT\] the page could not be fetched; nothing was stored, no fee was taken/);
  assert.equal((await view("credit", [VISITOR])).credit, (4n * FEE).toString());
  await conserved(total, "unread");

  // A page outside the prefix is refused before anything is fetched.
  refusedWith(await as(VISITOR, calls.review(E, "https://elsewhere.example/notices/new-date.html")), /the page is not below E\d+'s site prefix/);

  // The validators split: unclear. A holder's first unclear reading of the event costs nothing...
  mock.setMockSplitNext(true);
  const r3 = okResult(await as(VISITOR, calls.review(E, url("new-support"))));
  assert.equal(r3.finding, "unclear");
  assert.equal(r3.fee_to, "reviewer");
  assert.equal(BigInt(r3.credit), 4n * FEE);
  assert.equal(mock.mockSplitNext(), false, "the split lasts one reading");
  await conserved(total, "free unclear");
  // ...the second is paid, to the organizer.
  mock.setMockSplitNext(true);
  const r4 = okResult(await as(VISITOR, calls.review(E, url("event"))));
  assert.equal(r4.finding, "unclear");
  assert.equal(r4.fee_to, "organizer");
  assert.equal(BigInt(r4.credit), 3n * FEE);
  // The same text read unclear stays unclear: asking again is a repeat, never a free second roll.
  const r5 = okResult(await as(VISITOR, calls.review(E, url("new-support"))));
  assert.equal(r5.repeat_of, r3.review);
  assert.equal(r5.finding, "unclear");
  assert.equal(r5.fee_to, "organizer");
  await conserved(total, "unclear");
  const nsAgain = await mock.demoNotice(E, "new-support");
  assert.equal(nsAgain.ok, false, "the demo organizer will not repeat a text already read");

  // The move to 21 June: material. The event changes, every refund opens, the fee stays with the reviewer.
  const b = await mock.demoNotice(E, "new-date");
  assert.equal(b.ok, true);
  const r6 = okResult(await finalOf(b.hash));
  assert.equal(r6.finding, "material");
  assert.equal(r6.fee_to, "reviewer");
  assert.equal(r6.status, "changed");
  const changed = await view("event", [E]);
  assert.equal(changed.status, "changed");
  assert.equal(changed.changed_by, "review");
  assert.equal(changed.change_review, r6.review);
  assert.equal(changed.phase, "refunds");
  assert.equal(changed.record.material, 1);
  assert.equal(changed.record.minor, 1);
  assert.equal(changed.record.unclear, 2);
  assert.equal(changed.record.repeats, 2);
  await conserved(total, "material");

  // Nothing more is read, and nothing more is sold.
  refusedWith(await as(VISITOR, calls.review(E, url("headliner"))), new RegExp(`${E} is changed; a notice is reviewed while the event is on`));
  const late = await as(PASSER_BY, calls.buy(E, DEMO_PRICE));
  assert.equal(late.result.ok, false);
  assert.match(late.result.reason, /is changed; tickets are sold while it is on/);
  assert.equal(late.result.returned, DEMO_PRICE.toString());
  await conserved(total, "late purchase returned");

  // Both holders take their money back, one ticket per call; a second refund is refused.
  const mid = await mock.balanceOf(VISITOR);
  const back = okResult(await as(VISITOR, calls.refund(T)));
  assert.equal(back.status, "refunded");
  assert.equal(back.to, VISITOR);
  assert.equal(await mock.balanceOf(VISITOR), mid + DEMO_PRICE);
  refusedWith(await as(VISITOR, calls.refund(T)), new RegExp(`${T} is refunded; a ticket is paid out once`));
  const fanTickets = (await view("tickets_of", [EARLIER_FAN, 0, 20])).rows.filter((t) => t.event === E && t.status === "valid");
  assert.equal(fanTickets.length, 1);
  refusedWith(await as(VISITOR, calls.refund(fanTickets[0].ticket)), new RegExp(`only the holder of ${fanTickets[0].ticket} may refund it`));
  okResult(await as(EARLIER_FAN, calls.refund(fanTickets[0].ticket)));
  assert.equal((await view("event", [E])).held, "0");
  await conserved(total, "refunded");

  // The demo organizer reads nothing more on a changed event; a fresh one opens, once.
  assert.match((await mock.demoNotice(E, "headliner")).reason, /has changed and its refunds are open/);
  assert.equal(mock.demoStatus().eventState, "changed");
  const open = await mock.demoReopen();
  assert.equal(open.ok, true);
  const fresh = okResult(await finalOf(open.hash));
  assert.notEqual(fresh.event, E);
  assert.equal(mock.demoStatus().event, fresh.event);
  assert.equal(mock.demoStatus().eventState, "open");
  const twice = await mock.demoReopen();
  assert.equal(twice.ok, false);
  assert.match(twice.reason, /is still on sale/);

  // Credit back: all of it, once.
  const credit = BigInt((await view("credit", [VISITOR])).credit);
  const w = okResult(await as(VISITOR, calls.withdraw()));
  assert.equal(BigInt(w.withdrawn), credit);
  refusedWith(await as(VISITOR, calls.withdraw()), /this address holds no review credit/);
  await conserved(total, "withdrawn");
});

test("every notice reads as expected on a fresh demo event, and each moves the money its own way", async () => {
  const total = await world();
  for (const n of NOTICES.filter((x) => x.key !== "doors-later")) {
    let s = mock.demoStatus();
    if (s.eventState !== "open") okResult(await finalOf((await mock.demoReopen()).hash));
    s = mock.demoStatus();
    okResult(await as(VISITOR, calls.deposit(FEE)));
    const before = BigInt((await view("credit", [VISITOR])).credit);
    const r = okResult(await as(VISITOR, calls.review(s.event, mock.MOCK_PREFIX + n.file)));
    assert.equal(r.finding, n.expect, n.file);
    assert.equal(r.fp, n.fp, n.file);
    assert.equal(BigInt(r.credit), n.expect === "material" ? before : before - FEE, `${n.file}: the fee`);
    assert.equal((await view("event", [s.event])).status, n.expect === "material" ? "changed" : "on");
    await conserved(total, n.file);
  }
});

test("a cancellation opens every refund; a stranger may not cancel, and nobody cancels after the start", async () => {
  const total = await world();
  const E = "E3"; // the folk night of the "You, an organizer" persona, on sale in two days
  const t = okResult(await as(VISITOR, calls.buy(E, 10n ** 18n))).ticket;
  refusedWith(await as(PASSER_BY, calls.cancel(E)), /only the organizer of E3 may cancel it/);
  const c = okResult(await as(MY_ORGANIZER, calls.cancel(E)));
  assert.equal(c.changed_by, "organizer");
  refusedWith(await as(MY_ORGANIZER, calls.cancel(E)), /E3 is changed; its refunds are already open/);
  const row = await view("event", [E]);
  assert.equal(row.changed_by, "organizer");
  assert.equal(row.change_review, "");
  okResult(await as(VISITOR, calls.refund(t)));
  await conserved(total, "cancelled and refunded");
  // The earlier fan never refunds: a changed event's ticket settles to the organizer only after the refund window.
  const fan = (await view("tickets_of", [EARLIER_FAN, 0, 20])).rows.find((x) => x.event === E && x.status === "valid");
  refusedWith(await as(PASSER_BY, calls.settle(fan.ticket)), /E3 changed; its holders take their money back until \d+, and only a ticket nobody refunded settles to the organizer after that; in \d+ seconds/);
  mock.advanceClock(row.starts_at + REFUND_WINDOW - mock.mockNow());
  refusedWith(await as(EARLIER_FAN, calls.refund(fan.ticket)), /refunds of E3 closed at \d+, seven days after its start; settle\(T\d+\) now sends the price to the organizer/);
  const orgBefore = await mock.balanceOf(MY_ORGANIZER);
  const s = okResult(await as(PASSER_BY, calls.settle(fan.ticket)));
  assert.equal(s.to, MY_ORGANIZER);
  assert.equal(await mock.balanceOf(MY_ORGANIZER), orgBefore + 10n ** 18n);
  await conserved(total, "settled after the window");
});

test("an unchanged event settles to its organizer a day after the start, by anyone, one ticket per call", async () => {
  const total = await world();
  let s = mock.demoStatus();
  if (s.eventState !== "open") okResult(await finalOf((await mock.demoReopen()).hash));
  s = mock.demoStatus();
  const E = s.event;
  const t = okResult(await as(VISITOR, calls.buy(E, DEMO_PRICE))).ticket;
  const own = await as(DEMO_ORGANIZER, calls.buy(E, DEMO_PRICE));
  assert.match(own.result.reason, /may not buy its own tickets/);
  const short = await as(PASSER_BY, calls.buy(E, DEMO_PRICE - 1n));
  assert.match(short.result.reason, /send exactly the price of \d+ atto to buy a ticket to E\d+; this one sent \d+/);
  assert.equal(short.result.returned, (DEMO_PRICE - 1n).toString());
  await conserved(total, "refused purchases returned");
  const row = await view("event", [E]);
  refusedWith(await as(PASSER_BY, calls.settle(t)), new RegExp(`${t} settles to the organizer from \\d+, a day after ${E} starts, while its notices can still be reviewed; in \\d+ seconds`));
  mock.advanceClock(row.starts_at - mock.mockNow());
  assert.equal(mock.demoStatus().eventState, "started");
  const afterStart = await as(PASSER_BY, calls.buy(E, DEMO_PRICE));
  assert.match(afterStart.result.reason, /tickets are sold before the start/);
  refusedWith(await as(DEMO_ORGANIZER, calls.cancel(E)), /it can be cancelled only before its start/);
  mock.advanceClock(AFTER_START);
  refusedWith(await as(PASSER_BY, calls.review(E, mock.MOCK_PREFIX + "new-venue.html")), /closed at \d+, a day after its start|holds 0; deposit\(\) first/);
  refusedWith(await as(VISITOR, calls.refund(t)), /has not changed/);
  const settled = okResult(await as(PASSER_BY, calls.settle(t)));
  assert.equal(settled.to, DEMO_ORGANIZER);
  assert.equal((await view("ticket", [t])).status, "settled");
  refusedWith(await as(PASSER_BY, calls.settle(t)), /is settled; a ticket is paid out once/);
  await conserved(total, "settled");
});

test("a sold-out event refuses and returns the next purchase; a deposit of nothing is refused and returned", async () => {
  const total = await world();
  const terms = JSON.stringify({ date: "2 November 2026", venue: "The Copper Lane Rooms", main_act: "Maple & Ash Quartet", details: "" });
  const opened = okResult(await as(MY_ORGANIZER, calls.openEvent("Copper Lane Late Show", terms, "https://copperlane.example/late/", 10n ** 17n, 1, mock.mockNow() + 7200)));
  okResult(await as(VISITOR, calls.buy(opened.event, 10n ** 17n)));
  const full = await as(PASSER_BY, calls.buy(opened.event, 10n ** 17n));
  assert.match(full.result.reason, /is sold out: all 1 tickets are sold/);
  assert.equal(full.result.returned, (10n ** 17n).toString());
  const nothing = await as(PASSER_BY, calls.deposit(0n));
  assert.equal(nothing.result.ok, false);
  assert.match(nothing.result.reason, /send the credit to add with the call/);
  refusedWith(await as(PASSER_BY, calls.review(opened.event, "https://copperlane.example/late/a.html")), /a review takes 10000000000000000 atto \(0\.01 GEN\) of review credit and this address holds 0; deposit\(\) first/);
  const st = await view("stats", []);
  assert.ok(st.refused_payments >= 2);
  await conserved(total, "sold out");
});
