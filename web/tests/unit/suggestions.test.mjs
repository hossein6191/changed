// Every one-click suggestion is inside the contract's limits, so no chip ever fills a field with
// something the contract would refuse: the event names, the terms one by one and as whole sets, the
// prices, capacities and starts, the example prefixes, the credit amounts, and the notice addresses a
// review can point at, each carrying what the network should make of it.

import test from "node:test";
import assert from "node:assert/strict";

import * as s from "../../lib/suggestions.ts";
import { DEMO_EVENT_NAME, DEMO_TERMS, NOTICES, noticesBase } from "../../lib/demo-event.ts";
import {
  MAX_DETAILS,
  MAX_LEAD,
  MAX_TERM,
  MIN_LEAD,
  MIN_TERM,
  REVIEW_FEE,
  capacityProblem,
  nameProblem,
  prefixProblem,
  priceProblem,
  reviewUrlProblem,
  termsJson,
  termsProblem,
  textProblem,
} from "../../lib/rules.ts";

test("event names are inside the limits, distinct, and none is the demo festival's", () => {
  for (const n of s.NAME_CHIPS) {
    assert.equal(nameProblem(n), "", n);
    assert.notEqual(n, DEMO_EVENT_NAME);
  }
  assert.equal(new Set(s.NAME_CHIPS).size, s.NAME_CHIPS.length);
});

test("every term chip, and every whole set of terms, is one the contract stores", () => {
  for (const d of s.DATE_CHIPS) assert.equal(textProblem(d, MIN_TERM, MAX_TERM, "the date term"), "", d);
  for (const v of s.VENUE_CHIPS) assert.equal(textProblem(v, MIN_TERM, MAX_TERM, "the venue term"), "", v);
  for (const a of s.ACT_CHIPS) assert.equal(textProblem(a, MIN_TERM, MAX_TERM, "the main_act term"), "", a);
  for (const d of s.DETAILS_CHIPS) assert.equal(textProblem(d.value, 0, MAX_DETAILS, "the details"), "", d.label);
  for (const t of s.TERMS_CHIPS) {
    const read = termsProblem(termsJson(t.terms));
    assert.equal(read.problem, "", t.label);
    assert.deepEqual(read.terms, t.terms, t.label);
  }
  assert.deepEqual(s.TERMS_CHIPS[0].terms, DEMO_TERMS, "the demo festival's terms come first");
});

test("prices, capacities, starts and credit amounts are inside the limits", () => {
  for (const c of s.PRICE_CHIPS) assert.equal(priceProblem(c.value), "", c.label);
  for (const c of s.CAPACITY_CHIPS) assert.equal(capacityProblem(BigInt(c.value)), "", c.label);
  for (const c of s.START_CHIPS) assert.ok(c.value >= MIN_LEAD && c.value <= MAX_LEAD, c.label);
  for (const c of s.DEPOSIT_CHIPS) assert.ok(c.value >= REVIEW_FEE && c.value % REVIEW_FEE === 0n, c.label);
  for (const c of s.EXAMPLE_PREFIXES) assert.equal(prefixProblem(c.value), "", c.label);
});

test("the notice chips are addresses below the event's prefix, each with what it should read as", () => {
  const base = noticesBase("demo-owner/changed", "0123456789abcdef0123456789abcdef01234567");
  const demo = s.noticeChips(base, DEMO_TERMS);
  assert.equal(demo.length, NOTICES.length);
  demo.forEach((c, i) => {
    assert.equal(reviewUrlProblem(c.value, base, "E4"), "", c.value);
    assert.equal(c.expect, NOTICES[i].expect);
  });
  const other = s.noticeChips(s.EXAMPLE_PREFIXES[0].value, { date: "21 October 2026", venue: "Kestrel Bay Boathouse", main_act: "The Tidewater Choir" });
  for (const c of other) {
    assert.equal(reviewUrlProblem(c.value, s.EXAMPLE_PREFIXES[0].value, "E3"), "", c.value);
    assert.equal(c.expect, "another event");
  }
});
