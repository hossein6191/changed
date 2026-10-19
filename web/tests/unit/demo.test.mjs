// The demo organizer, without a network: the forgiving reader of its key, the limiter, its demo event
// (the terms, the price and the start the contract takes), its eight notice pages with their
// fingerprints recomputed from notices/ and asked of contracts/changed.py itself, the copies the site
// serves, which notices it will announce on which events (only its six fixed ones, only on its own
// demo event, each text once), when it opens a fresh event, and the server's routes read as source: a
// fixed list of notices, no visitor text ever signed, the key never logged or returned, and a status
// that names exactly what is missing.

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

import { BAD_KEY, NO_KEY, cleanKey, keyProblem } from "../../lib/demo-key.ts";
import { DEMO_LIMITS, createLimiter } from "../../lib/demo-limit.ts";
import * as demo from "../../lib/demo-event.ts";
import { MAX_LEAD, MIN_LEAD, capacityProblem, nameProblem, prefixProblem, priceProblem, reviewUrlProblem, termsProblem } from "../../lib/rules.ts";
import { askContract } from "./oracle.mjs";

const KEY = "ab".repeat(32);
const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const REPO = "demo-owner/changed";
const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const notice = (file) => readFileSync(new URL(`../../../notices/${file}`, import.meta.url), "utf8");

test("the key is read forgivingly: quotes, spaces and a missing 0x are forgiven, anything else is named", () => {
  assert.equal(keyProblem(undefined), NO_KEY);
  assert.equal(keyProblem("  "), NO_KEY);
  assert.equal(keyProblem('""'), NO_KEY);
  for (const k of [KEY, "0x" + KEY, `"0x${KEY}"`, ` '${KEY}' `, "0X" + KEY, "`0x" + KEY + "`"]) {
    assert.equal(keyProblem(k), "", k);
    assert.equal(cleanKey(k), "0x" + KEY);
  }
  for (const k of ["key", "0x" + KEY.slice(2), KEY + "0", "0x" + "zz".repeat(32)]) assert.equal(keyProblem(k), BAD_KEY, k);
});

test("the limiter: one attempt per event every 20 s, twelve a minute in all", () => {
  const l = createLimiter(DEMO_LIMITS);
  assert.deepEqual(l.attempt("notice:E1", 0), { ok: true });
  assert.equal(l.attempt("notice:E1", 5_000).ok, false);
  assert.equal(l.attempt("notice:E1", 5_000).retryAfter, 15);
  assert.deepEqual(l.attempt("notice:E1", 20_000), { ok: true });
  const g = createLimiter(DEMO_LIMITS);
  for (let i = 0; i < 12; i++) assert.equal(g.attempt("notice:E" + i, 1000 + i).ok, true);
  assert.equal(g.attempt("reopen", 2000).ok, false, "the thirteenth in a minute waits");
});

test("the demo event opens: its name, terms, price, capacity and start are inside the contract's limits", () => {
  assert.equal(nameProblem(demo.DEMO_EVENT_NAME), "");
  const read = termsProblem(demo.DEMO_TERMS_JSON);
  assert.equal(read.problem, "");
  assert.deepEqual(read.terms, demo.DEMO_TERMS);
  assert.equal(priceProblem(demo.DEMO_PRICE), "");
  assert.equal(capacityProblem(BigInt(demo.DEMO_CAPACITY)), "");
  assert.ok(demo.DEMO_LEAD >= MIN_LEAD && demo.DEMO_LEAD <= MAX_LEAD, "six hours is a start the contract takes");
  assert.ok(demo.DEMO_CREDIT_TOP_UP > demo.DEMO_CREDIT_LOW);
  // The terms are the ones the notices talk about.
  for (const t of [demo.DEMO_TERMS.date, demo.DEMO_TERMS.venue, demo.DEMO_TERMS.main_act]) assert.ok(notice("event.html").includes(t), t);
});

/** The contract's _visible and _page_text, in JavaScript, as the smoke run computes them. */
function fingerprint(html) {
  const pieces = html.slice(0, 32000).split("<");
  let out = pieces[0];
  for (const piece of pieces.slice(1)) {
    const close = piece.indexOf(">");
    if (close === -1) out += "<" + piece;
    else if (/^(script|style)/.test(piece.slice(0, 6).toLowerCase())) out += " ";
    else out += " " + piece.slice(close + 1);
  }
  const text = out.slice(0, 32000).split(/\s+/).filter(Boolean).join(" ").slice(0, 6000);
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

test("every page in notices/ is a demo notice, with the fingerprint the contract gives it", (t) => {
  const files = readdirSync(new URL("../../../notices/", import.meta.url)).filter((f) => f.endsWith(".html") && !f.startsWith("._")).sort();
  assert.deepEqual(demo.NOTICES.map((n) => n.file).sort(), files, "one notice per page, and no other");
  for (const n of demo.NOTICES) assert.equal(fingerprint(notice(n.file)), n.fp, `${n.file} fingerprint`);
  assert.equal(new Set(demo.NOTICES.map((n) => n.fp)).size, demo.NOTICES.length, "every text is a different text");
  const answers = askContract(demo.NOTICES.map((n) => ({ fn: "fingerprint", args: [notice(n.file)] })));
  if (!answers) return t.skip("no python3 on this machine");
  demo.NOTICES.forEach((n, i) => assert.equal(answers[i].ok.fp, n.fp, `${n.file}: the contract's own reading`));
});

test("the site serves exact copies of the notices", () => {
  for (const n of demo.NOTICES) assert.equal(readFileSync(new URL(`../../public/notices/${n.file}`, import.meta.url), "utf8"), notice(n.file), n.file);
});

test("the six notices the demo organizer announces: two that leave the terms standing, four that do not", () => {
  assert.deepEqual([...demo.BOT_NOTICE_KEYS], ["doors-later", "new-support", "new-date", "new-venue", "headliner", "cancelled"]);
  assert.deepEqual(demo.BOT_NOTICES.map((n) => n.expect), ["minor", "minor", "material", "material", "material", "material"]);
  assert.equal(demo.noticeOf("event").expect, "minor");
  assert.equal(demo.noticeOf("postponed").expect, "material");
  for (const n of demo.NOTICES) assert.ok(n.title && n.says && n.why, n.key);
});

test("the pinned folder is a site prefix the contract takes, and every notice address is below it", () => {
  const base = demo.noticesBase(REPO, COMMIT);
  assert.equal(base, `https://raw.githubusercontent.com/${REPO}/${COMMIT}/notices/`);
  assert.equal(prefixProblem(base), "");
  assert.equal(demo.baseProblem(base), "");
  for (const n of demo.NOTICES) {
    const url = demo.noticeUrl(REPO, COMMIT, n.file);
    assert.equal(reviewUrlProblem(url, base, "E1"), "", url);
    assert.equal(demo.noticeOfUrl(url), n);
  }
  assert.match(demo.baseProblem(demo.noticesBase("a-very-long-owner-name-indeed/" + "r".repeat(40), COMMIT)), /more than the contract's 120/);
  assert.equal(demo.repoOf("https://github.com/demo-owner/changed"), REPO);
  assert.equal(demo.repoOf("https://github.com/demo-owner/changed.git"), REPO);
  assert.equal(demo.repoOf("https://gitlab.com/demo-owner/changed"), "");
});

test("the scripted reader: a demo notice as expected against the demo terms, another event's page as minor, anything else unread", () => {
  const base = demo.noticesBase(REPO, COMMIT);
  const other = { date: "2 November 2026", venue: "The Copper Lane Rooms", main_act: "Maple & Ash Quartet" };
  for (const n of demo.NOTICES) {
    assert.deepEqual(demo.scriptedReading(base + n.file, demo.DEMO_TERMS), { finding: n.expect, fp: n.fp });
    assert.deepEqual(demo.scriptedReading(base + n.file, other), { finding: "minor", fp: n.fp });
  }
  assert.deepEqual(demo.scriptedReading(base + "missing.html", demo.DEMO_TERMS), { error: demo.FETCH_FAILED });
  assert.ok(src("../../../contracts/changed.py").includes(demo.FETCH_FAILED.replace("[TRANSIENT] ", "").split(";")[0]));
});

test("which notices the demo organizer announces, on which event, and when", () => {
  const now = 1_900_000_000;
  const e = { id: "E4", status: "on", startsAt: now + 3600, sold: 2, capacity: 500 };
  assert.equal(demo.demoNoticeProblem(e, "E4", "doors-later", [], now), "");
  assert.match(demo.demoNoticeProblem(e, "", "doors-later", [], now), /not open on this contract yet/);
  assert.match(demo.demoNoticeProblem(e, "E4", "event", [], now), /only what its buttons say/);
  assert.match(demo.demoNoticeProblem(e, "E4", "free text", [], now), /only what its buttons say/);
  assert.match(demo.demoNoticeProblem(null, "E4", "new-date", [], now), /no such event/);
  assert.match(demo.demoNoticeProblem({ ...e, id: "E3" }, "E4", "new-date", [], now), /E3 is not the demo event/);
  assert.match(demo.demoNoticeProblem({ ...e, status: "changed" }, "E4", "new-date", [], now), /has changed and its refunds are open/);
  assert.match(demo.demoNoticeProblem(e, "E4", "new-date", [], now + 3600 + 86400), /closed a day after its start/);
  const before = [{ id: "R7", url: demo.noticesBase(REPO, COMMIT) + "new-support.html", finding: "minor" }];
  assert.match(demo.demoNoticeProblem(e, "E4", "new-support", before, now), /new-support\.html was already read for E4 as R7, minor; that reading stands/);
  assert.equal(demo.demoNoticeProblem(e, "E4", "new-date", before, now), "");
});

test("a fresh demo event opens once the last one started, sold out or changed, and not before", () => {
  const now = 1_900_000_000;
  const e = { id: "E4", status: "on", startsAt: now + 3600, sold: 2, capacity: 500 };
  assert.equal(demo.demoStateOf(null, now), "none");
  assert.equal(demo.demoStateOf(e, now), "open");
  assert.equal(demo.demoStateOf({ ...e, status: "changed" }, now), "changed");
  assert.equal(demo.demoStateOf(e, now + 3600), "started");
  assert.equal(demo.demoStateOf({ ...e, sold: 500 }, now), "sold_out");
  assert.match(demo.reopenProblem(e, now), /E4 is still on sale/);
  for (const x of [null, { ...e, status: "changed" }, { ...e, sold: 500 }]) assert.equal(demo.reopenProblem(x, now), "");
  assert.equal(demo.reopenProblem(e, now + 3600), "");
  assert.ok(demo.isDemoEvent({ organizer: "0xAB", name: demo.DEMO_EVENT_NAME }, "0xab"));
  assert.ok(!demo.isDemoEvent({ organizer: "0xab", name: "Copper Lane Jazz Night" }, "0xab"));
  assert.ok(!demo.isDemoEvent({ organizer: "0xcd", name: demo.DEMO_EVENT_NAME }, "0xab"));
  assert.ok(!demo.isDemoEvent({ organizer: "0xab", name: demo.DEMO_EVENT_NAME }, ""));
});

test("the routes sign only fixed calls, and nothing of the key ever leaves the server", () => {
  const server = src("../../lib/demo-server.ts");
  const notice = src("../../app/api/demo/notice/route.ts");
  const reopen = src("../../app/api/demo/reopen/route.ts");
  const status = src("../../app/api/demo/status/route.ts");
  // The notice is one of the fixed keys; the event an id; nothing else from the body is read.
  assert.match(notice, /isBotNoticeKey\(body\.notice\)/);
  assert.match(notice, /parseEventId\(body\.event\)/);
  assert.match(notice, /text\.length > 200/);
  assert.doesNotMatch(reopen, /request\.(json|text)/, "a reopen reads no body");
  // The server signs exactly three calls, every argument its own or a fixed constant.
  const signed = [...server.matchAll(/sign\((calls\.\w+)\(([^)]*\)?)\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(signed, ["calls.deposit", "calls.openEvent", "calls.review"]);
  assert.match(server, /sign\(calls\.review\(event, s\.prefix \+ noticeOf\(key\)!\.file\)\)/);
  assert.match(server, /calls\.openEvent\(DEMO_EVENT_NAME, DEMO_TERMS_JSON, s\.prefix, DEMO_PRICE, DEMO_CAPACITY, nowSeconds\(\) \+ DEMO_LEAD\)/);
  // A notice is checked against a fresh read before it is signed.
  assert.match(server, /readEvent\(event, \{ fresh: true \}\)/);
  assert.match(server, /demoNoticeProblem\(/);
  for (const s of [server, notice, reopen, status]) {
    assert.doesNotMatch(s, /console\./, "nothing is logged");
    assert.doesNotMatch(s, /body:\s*\{[^}]*key/i, "no answer carries the key");
  }
  assert.match(server, /process\.env\.DEMO_ORGANIZER_KEY/);
  assert.doesNotMatch(status, /DEMO_ORGANIZER_KEY/, "the status route never touches the key itself");
});
