// Seeded random journeys through the in-memory contract: anyone does anything, in any order, with right
// and wrong prices, real, unreadable and outside pages, split readings, the demo organizer's buttons
// and fresh demo events, and the clock jumps. After every step no atto is created or lost; the contract
// holds exactly the valid tickets' prices and the review credit; stats() adds up; a ticket paid out
// never changes again; an event that changed never changes back; and a repeat always carries the
// finding of the reading it repeats.

import test from "node:test";
import assert from "node:assert/strict";

import * as mock from "../../lib/chain-mock.ts";
import { calls } from "../../lib/calls.ts";
import { BOT_NOTICE_KEYS, NOTICES } from "../../lib/demo-event.ts";
import { REVIEW_FEE } from "../../lib/rules.ts";

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const view = async (fn, args) => JSON.parse(await mock.view(fn, args));

async function finalOf(hash) {
  for (let i = 0; i < 40; i++) {
    const s = await mock.txStatus(hash);
    if (s.status === "FINALIZED" || s.status === "UNDETERMINED") return s;
  }
  throw new Error("never final");
}

const closedTickets = new Map();
const changedEvents = new Set();
const findings = new Map();

async function check(total, step) {
  let sum = mock.mockContractBalance();
  for (const a of mock.ACCOUNTS) sum += await mock.balanceOf(a);
  assert.equal(sum, total, `${step}: no atto created or lost`);
  const { held, credit, balance } = mock.mockBooks();
  assert.equal(held + credit, balance, `${step}: the contract holds its escrow and its credit, nothing else`);
  const st = await view("stats", []);
  assert.equal(BigInt(st.held), BigInt(st.sales) - BigInt(st.refunded_total) - BigInt(st.to_organizers), `${step}: held adds up`);
  assert.equal(BigInt(st.credit), BigInt(st.deposited) - BigInt(st.credit_out) - BigInt(st.fees), `${step}: credit adds up`);
  assert.equal(st.reviews, st.material + st.minor + st.unclear + st.repeats, `${step}: every review is one finding or a repeat`);
  assert.equal(st.changed, st.changed_by_review + st.cancelled, `${step}: every change is a review or a cancel`);
  let escrow = 0n;
  for (let k = 1; k <= st.events; k++) {
    const e = await view("event", ["E" + k]);
    escrow += BigInt(e.held);
    if (changedEvents.has("E" + k)) assert.equal(e.status, "changed", `${step}: E${k} never changes back`);
    if (e.status === "changed") changedEvents.add("E" + k);
    const revs = await view("reviews_of", ["E" + k, 0, 20]);
    for (let off = 20; off < revs.total; off += 20) revs.rows.push(...(await view("reviews_of", ["E" + k, off, 20])).rows);
    for (const r of revs.rows) {
      if (!findings.has(r.review)) findings.set(r.review, r.finding);
      assert.equal(r.finding, findings.get(r.review), `${step}: ${r.review} is stored for good`);
      if (r.repeat_of) assert.equal(r.finding, findings.get(r.repeat_of), `${step}: ${r.review} carries ${r.repeat_of}'s finding`);
      if (r.finding === "material" && !r.repeat_of) assert.equal(r.fee_to, "reviewer");
    }
  }
  assert.equal(escrow, held, `${step}: the events' escrow adds up`);
  for (let k = 1; k <= st.tickets; k++) {
    const t = await view("ticket", ["T" + k]);
    if (closedTickets.has("T" + k)) assert.equal(t.status, closedTickets.get("T" + k), `${step}: T${k} is paid out once`);
    if (t.status !== "valid") closedTickets.set("T" + k, t.status);
  }
}

const PEOPLE = [mock.VISITOR, mock.MY_ORGANIZER, mock.EARLIER_FAN, mock.PASSER_BY, mock.DEMO_ORGANIZER];

test("sixteen seeded journeys: the money adds up after every step", async () => {
  const total = await (async () => {
    let s = mock.mockContractBalance();
    for (const a of mock.ACCOUNTS) s += await mock.balanceOf(a);
    return s;
  })();
  const seen = { minor: 0, material: 0, unclear: 0, repeat: 0, refund: 0, settle: 0, cancel: 0, returned: 0, unread: 0 };
  for (let seed = 1; seed <= 16; seed++) {
    const r = rng(seed);
    const pick = (list) => list[Math.floor(r() * list.length)];
    for (let step = 0; step < 60; step++) {
      const who = pick(PEOPLE);
      mock.setMockPersona(who);
      const st = await view("stats", []);
      const eid = "E" + (1 + Math.floor(r() * Math.max(1, st.events)));
      const tid = "T" + (1 + Math.floor(r() * Math.max(1, st.tickets)));
      const e = await view("event", [eid]);
      const roll = r();
      let label = "";
      let hash = "";
      if (roll < 0.18) {
        // Half the purchases go to the demo festival on sale now.
        const target = r() < 0.5 && mock.demoStatus().event ? await view("event", [mock.demoStatus().event]) : e;
        const price = r() < 0.8 ? BigInt(target.price) : BigInt(target.price) - 1n;
        label = `${who.slice(0, 6)} buys ${target.event}`;
        if (price <= (await mock.balanceOf(who))) hash = await mock.write(calls.buy(target.event, price));
      } else if (roll < 0.36) {
        // Half the reviews go to the demo festival on sale now, whose notices can be read.
        const target = r() < 0.5 && mock.demoStatus().event ? await view("event", [mock.demoStatus().event]) : e;
        const n = pick(r() < 0.5 ? NOTICES.filter((x) => x.expect !== "material") : NOTICES);
        // Sometimes a page this event already read: asking again must be a repeat, never a second roll.
        const read = (await view("reviews_of", [target.event, 0, 20])).rows;
        const url = read.length && r() < 0.3 ? pick(read).url : r() < 0.85 ? target.site_prefix + n.file : r() < 0.5 ? e.site_prefix + "unknown.html" : "https://elsewhere.example/notices/" + n.file;
        if (r() < 0.2) mock.setMockSplitNext(true);
        label = `${who.slice(0, 6)} reviews ${url.slice(-20)} on ${target.event}`;
        hash = await mock.write(calls.review(target.event, url));
      } else if (roll < 0.46) {
        label = `${who.slice(0, 6)} deposits`;
        hash = await mock.write(calls.deposit(pick([0n, REVIEW_FEE, 3n * REVIEW_FEE])));
      } else if (roll < 0.5) {
        label = `${who.slice(0, 6)} withdraws`;
        hash = await mock.write(calls.withdraw());
      } else if (roll < 0.62) {
        // Mostly a ticket this person holds, sometimes anybody's.
        const mine = (await view("tickets_of", [who, 0, 20])).rows.filter((t) => t.status === "valid");
        const ticket = mine.length && r() < 0.7 ? pick(mine).ticket : tid;
        label = `${who.slice(0, 6)} refunds ${ticket}`;
        hash = await mock.write(calls.refund(ticket));
      } else if (roll < 0.72) {
        label = `${who.slice(0, 6)} settles ${tid}`;
        hash = await mock.write(calls.settle(tid));
      } else if (roll < 0.78) {
        // Mostly the organizer of the demo festival on sale now, sometimes anybody, of any event.
        const demoEvent = mock.demoStatus().event;
        const target = demoEvent && r() < 0.6 ? demoEvent : eid;
        if (target === demoEvent) mock.setMockPersona(mock.DEMO_ORGANIZER);
        label = `${mock.mockAddress().slice(0, 6)} cancels ${target}`;
        hash = await mock.write(calls.cancel(target));
      } else if (roll < 0.84) {
        const status = mock.demoStatus();
        const answer = await mock.demoNotice(status.event, pick(BOT_NOTICE_KEYS));
        label = "the demo organizer announces";
        hash = answer.ok ? answer.hash : "";
      } else if (roll < 0.9) {
        const answer = await mock.demoReopen();
        label = "a fresh demo event";
        hash = answer.ok ? answer.hash : "";
      } else {
        const jump = pick([600, 3600, 6 * 3600, 86400, 3 * 86400]);
        mock.advanceClock(jump);
        label = `the clock moves ${jump} s`;
      }
      if (hash) {
        const s = await finalOf(hash);
        const res = s.result ?? {};
        if (s.status === "UNDETERMINED") seen.unread++;
        if (res.finding && res.repeat_of) seen.repeat++;
        else if (res.finding) seen[res.finding]++;
        if (res.status === "refunded") seen.refund++;
        if (res.status === "settled") seen.settle++;
        if (res.changed_by === "organizer") seen.cancel++;
        if (res.ok === false && res.returned !== "0") seen.returned++;
      }
      await check(total, `seed ${seed} step ${step} (${label})`);
    }
  }
  for (const [k, v] of Object.entries(seen)) assert.ok(v > 0, `the journeys reached ${k}: ${JSON.stringify(seen)}`);
});
