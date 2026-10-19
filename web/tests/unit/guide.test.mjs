// The waiting copy (lib/guide.ts) for every in-between state of the site and every role: what is
// happening, how long, whether anything is needed, whether the page can be closed and where the money
// is, never empty, and never promising what the contract does not do.

import test from "node:test";
import assert from "node:assert/strict";

import * as g from "../../lib/guide.ts";
import { DEMO_PRICE } from "../../lib/demo-event.ts";
import { AFTER_START, REFUND_WINDOW } from "../../lib/rules.ts";

const ROLES = ["holder", "organizer", "visitor"];
const NOW = 1_800_000_000;
const PRICE = DEMO_PRICE.toString();

function lines(guide, where) {
  for (const k of ["id", "kicker", "now", "time", "need", "leave", "money"]) assert.ok(String(guide[k] ?? "").trim().length > 3, `${where}: ${k} is said`);
  assert.ok(["busy", "waiting", "ready", "alert", "done"].includes(guide.tone), `${where}: a known tone`);
  assert.equal(typeof guide.canLeave, "boolean", `${where}: whether the page can be closed`);
  for (const k of ["time", "need", "leave", "money"]) assert.match(guide[k], /[.)]$/, `${where}: ${k} is a sentence`);
  assert.doesNotMatch(guide.now, /\.$/, `${where}: the headline has no full stop`);
  assert.doesNotMatch(JSON.stringify(guide), /undefined|NaN|\[object|null/, `${where}: no unfilled value`);
  assert.match(guide.leave, guide.canLeave ? /close this page/ : /Stay/, `${where}: says whether the page can be closed`);
  if (guide.left !== undefined) assert.ok(guide.left >= 0 && guide.leftLabel, `${where}: a countdown has a label`);
}

const ev = (role, o = {}) => ({
  role,
  now: NOW,
  id: "E4",
  status: "on",
  changedBy: "",
  startsAt: NOW + 6 * 3600,
  sold: 3,
  capacity: 500,
  priceAtto: PRICE,
  heldAtto: (3n * DEMO_PRICE).toString(),
  mine: role === "holder" ? { valid: 1, refunded: 0, settled: 0 } : { valid: 0, refunded: 0, settled: 0 },
  last: null,
  ...o,
});

const last = (finding, o = {}) => ({ review: "R3", finding, repeatOf: "", feeTo: "organizer", mine: false, ...o });

/** Every state an event can be in for a viewer, by name, and the guide id it must give. */
const STATES = {
  "on sale": [(r) => ev(r), { holder: "bought", organizer: "selling", visitor: "selling" }],
  "sold out": [(r) => ev(r, { sold: 500 }), { holder: "bought", organizer: "sold-out", visitor: "sold-out" }],
  "minor, just read": [(r) => ev(r, { last: last("minor") }), { holder: "minor", organizer: "minor", visitor: "minor" }],
  "unclear, free": [(r) => ev(r, { last: last("unclear", { feeTo: "reviewer", mine: true }) }), { holder: "unclear", organizer: "unclear", visitor: "unclear" }],
  "unclear, paid": [(r) => ev(r, { last: last("unclear") }), { holder: "unclear", organizer: "unclear", visitor: "unclear" }],
  repeat: [(r) => ev(r, { last: last("minor", { repeatOf: "R1" }) }), { holder: "repeat", organizer: "repeat", visitor: "repeat" }],
  started: [(r) => ev(r, { now: NOW + 7 * 3600 }), { holder: "started", organizer: "started", visitor: "started" }],
  settling: [(r) => ev(r, { now: NOW + 6 * 3600 + AFTER_START + 60 }), { holder: "settling", organizer: "settling", visitor: "settling" }],
  "settled, nothing held": [(r) => ev(r, { now: NOW + 6 * 3600 + AFTER_START + 60, heldAtto: "0", mine: { valid: 0, refunded: 0, settled: r === "holder" ? 1 : 0 } }), { holder: "settled", organizer: "settling", visitor: "settling" }],
  "material, refunds open": [(r) => ev(r, { status: "changed", changedBy: "review" }), { holder: "refunds", organizer: "refunds", visitor: "refunds" }],
  "material, refunded": [(r) => ev(r, { status: "changed", changedBy: "review", mine: r === "holder" ? { valid: 0, refunded: 1, settled: 0 } : { valid: 0, refunded: 0, settled: 0 } }), { holder: "refunds-done", organizer: "refunds", visitor: "refunds" }],
  cancelled: [(r) => ev(r, { status: "changed", changedBy: "organizer" }), { holder: "cancelled", organizer: "cancelled", visitor: "cancelled" }],
  "refunds closed": [(r) => ev(r, { status: "changed", changedBy: "review", now: NOW + 6 * 3600 + REFUND_WINDOW }), { holder: "refunds-closed", organizer: "refunds-closed", visitor: "refunds-closed" }],
};

test("every state of an event, for every role, says all five things", () => {
  for (const [name, [build, ids]] of Object.entries(STATES))
    for (const role of ROLES) {
      const guide = g.eventGuide(build(role));
      lines(guide, `${name} as ${role}`);
      assert.equal(guide.id, ids[role], `${name} as ${role}`);
    }
});

test("the money line says where the money is: in escrow until the event or a refund, or where it went", () => {
  for (const [name, [build]] of Object.entries(STATES))
    for (const role of ROLES) {
      const guide = g.eventGuide(build(role));
      assert.match(guide.money, /escrow|went to|went back|left escrow/, `${name} as ${role}: ${guide.money}`);
    }
  const holding = g.eventGuide(ev("holder"));
  assert.match(holding.money, /0\.5 GEN for your 1 ticket is held in escrow until the event: back to you if a material change is found, to the organizer a day after the start if nothing changes/);
  const refunds = g.eventGuide(ev("holder", { status: "changed", changedBy: "review" }));
  assert.match(refunds.need, /Press Refund on each ticket you hold: one ticket per call/);
  assert.match(refunds.money, /still in escrow for your 1 ticket, waiting for your refund/);
  assert.equal(refunds.left, 6 * 3600 + REFUND_WINDOW);
});

test("a holder is told what an unclear reading cost, and that the same text again is only a repeat", () => {
  const free = g.eventGuide(ev("holder", { last: last("unclear", { feeTo: "reviewer", mine: true }) }));
  assert.match(free.money, /stayed with the reviewer: a holder's first unclear reading of an event is free/);
  assert.match(free.need, /the same text again is only a repeat/);
  const paid = g.eventGuide(ev("holder", { last: last("unclear") }));
  assert.match(paid.money, /went to the organizer/);
  const repeat = g.eventGuide(ev("visitor", { last: last("unclear", { repeatOf: "R1", mine: true }) }));
  assert.match(repeat.now, /the earlier reading, unclear, stands/);
  assert.match(repeat.money, /^Your 0\.01 GEN review fee went to the organizer/);
});

test("a minor reading tells a holder the ticket stands, and nobody is told to act", () => {
  const m = g.eventGuide(ev("holder", { last: last("minor") }));
  assert.match(m.now, /Minor: your ticket stands/);
  assert.match(m.need, /not a reason for a refund/);
  assert.equal(m.canLeave, true);
});

test("every wallet prompt, for every write, says what is still in the wallet and asks to stay", () => {
  for (const fn of ["open_event", "cancel", "buy", "refund", "settle", "deposit", "withdraw", "review"]) {
    const guide = g.signGuide({ fn, label: "Doing it", priceAtto: PRICE, valueAtto: "10000000000000000" });
    lines(guide, `sign ${fn}`);
    assert.equal(guide.canLeave, false);
  }
  assert.match(g.signGuide({ fn: "buy", label: "x", priceAtto: PRICE }).money, /0\.5 GEN is still in your wallet\. Once you confirm it is held by the contract, in escrow, not paid to the organizer/);
});

test("every transaction on its way, for every role, says how long and where the money is", () => {
  for (const fn of ["open_event", "cancel", "buy", "refund", "settle", "deposit", "withdraw"])
    for (const role of ROLES) lines(g.sendingGuide({ fn, label: "Doing it", event: "E4", role, priceAtto: PRICE, valueAtto: "10000000000000000" }), `sending ${fn} as ${role}`);
  assert.match(g.sendingGuide({ fn: "buy", label: "x", event: "E4", role: "visitor", priceAtto: PRICE }).money, /in escrow\. If the purchase is refused it comes back in the same transaction/);
});

test("a reading in progress: who pays, how long, and that the page can be closed", () => {
  for (const by of ["you", "demo"])
    for (const role of ROLES)
      for (const mock of [false, true]) {
        const guide = g.readingGuide({ event: "E4", page: "new-date.html", role, by, mock });
        lines(guide, `reading by ${by} as ${role}`);
        assert.equal(guide.canLeave, true);
        assert.match(guide.time, mock ? /demo build/ : /2 to 5 minutes/);
      }
  assert.match(g.readingGuide({ event: "E4", page: "x", role: "holder", by: "you" }).money, /If the page cannot be read nothing is taken/);
  assert.match(g.readingGuide({ event: "E4", page: "x", role: "holder", by: "demo" }).money, /The demo organizer pays the 0\.01 GEN review fee/);
});

test("the demo organizer at work, and when it did not act", () => {
  for (const state of ["asking", "reopening", "failed"]) lines(g.demoGuide({ state, what: "read new-date.html", event: "E4", reason: "the demo organizer is offline: no key set." }), `demo ${state}`);
  assert.match(g.demoGuide({ state: "failed", what: "x", event: "E4", reason: "no key set" }).need, /Why: no key set\./);
  lines(g.updatingGuide("the event"), "updating");
});

test("one line per ticket, for every way a ticket stands", () => {
  const base = { id: "T9", event: "E4", startsAt: NOW + 3600, priceAtto: PRICE, now: NOW };
  const cases = [
    [{ status: "valid", eventStatus: "on" }, /Held in escrow until the show/],
    [{ status: "valid", eventStatus: "on", now: NOW + 7200 }, /The show started/],
    [{ status: "valid", eventStatus: "on", now: NOW + 3600 + AFTER_START }, /settles to the organizer; anyone may send it/],
    [{ status: "valid", eventStatus: "changed" }, /E4 changed: refund open until/],
    [{ status: "valid", eventStatus: "changed", now: NOW + 3600 + REFUND_WINDOW }, /Refunds closed/],
    [{ status: "refunded", eventStatus: "changed" }, /Refunded: 0\.5 GEN went back to the holder from escrow/],
    [{ status: "settled", eventStatus: "on" }, /Settled: 0\.5 GEN went to the organizer from escrow/],
  ];
  for (const [o, re] of cases) {
    const line = g.ticketLine({ ...base, ...o });
    assert.match(line, re);
    assert.match(line, /\.$/);
    assert.doesNotMatch(line, /undefined|NaN/);
  }
});

test("one line per review slip, for where its fee went", () => {
  assert.match(g.feeLine({ finding: "material", repeatOf: "", feeTo: "reviewer", holder: true }), /a material change pays for its own reading/);
  assert.match(g.feeLine({ finding: "unclear", repeatOf: "", feeTo: "reviewer", holder: true }), /a holder's first unclear reading/);
  assert.match(g.feeLine({ finding: "minor", repeatOf: "", feeTo: "organizer", holder: false }), /went to the organizer/);
  assert.match(g.feeLine({ finding: "minor", repeatOf: "R2", feeTo: "organizer", holder: true }), /A repeat of R2: the earlier reading stands/);
});
