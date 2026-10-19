// The site against the contract it talks to, read from contracts/changed.py in this repository: every
// write builder names a real write method with the right number of arguments and sends value only to
// the payable ones; every view the site reads exists and the site reads every view; the limits and the
// two questions of a review are the contract's own; every refusal sentence the in-memory contract gives
// and every sentence the forms give is made of the contract's words; the readers of the caller's
// arguments answer as the contract's do; and the in-memory rules() is the contract's rules(), compared
// whole.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { calls } from "../../lib/calls.ts";
import * as rules from "../../lib/rules.ts";
import * as mock from "../../lib/chain-mock.ts";
import { askContract } from "./oracle.mjs";

// The contract's source with its escaped quotes read as quotes, and Python's adjacent string literals
// (a sentence split over two lines) joined back into one, so its sentences can be looked up whole.
const raw = readFileSync(new URL("../../../contracts/changed.py", import.meta.url), "utf8");
const contract = raw
  .replace(/\\"/g, '"')
  .replace(/"\s*\n\s*"/g, "")
  .replace(/"\s*\n\s*\+\s*"/g, "")
  .replace(/"\s*\+\s*\n\s*"/g, "")
  .replace(/" "/g, "");
const chainSource = readFileSync(new URL("../../lib/chain.ts", import.meta.url), "utf8");
const mockSource = readFileSync(new URL("../../lib/chain-mock.ts", import.meta.url), "utf8");
const rulesSource = readFileSync(new URL("../../lib/rules.ts", import.meta.url), "utf8");

/** { name: { kind, payable, params } } for every public method of the contract. */
function methods() {
  const out = {};
  const re = /@gl\.public\.(write(?:\.payable)?|view)\s*\n\s*def (\w+)\(self(?:,\s*([^)]*))?\)/g;
  for (const m of raw.matchAll(re)) {
    const params = (m[3] ?? "").split(",").map((p) => p.trim()).filter(Boolean);
    out[m[2]] = { kind: m[1].startsWith("view") ? "view" : "write", payable: m[1].endsWith("payable"), params: params.length };
  }
  return out;
}

/** The value of a Python constant written as `NAME = <expr>` at the start of a line. */
const constant = (name) => {
  const m = new RegExp(`^${name}\\s*=\\s*([^#\\n]+)`, "m").exec(raw);
  assert.ok(m, `the contract defines ${name}`);
  return m[1].trim();
};

/** A parenthesised Python string constant, joined. */
const pyString = (name) => {
  const start = raw.indexOf(`\n${name} = (`);
  assert.ok(start >= 0, `the contract defines ${name}`);
  const body = raw.slice(start, raw.indexOf("\n)", start));
  return [...body.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g)].map((m) => (m[1] ?? m[2]).replace(/\\"/g, '"')).join("");
};

test("every write builder names a write method of the contract, with its arguments and its value", () => {
  const all = methods();
  const built = [
    calls.openEvent("Harbour Lights Festival", "{}", "https://a.example/n/", 10n ** 18n, 10, 1_900_000_000),
    calls.cancel("E1"),
    calls.buy("E1", 10n ** 18n),
    calls.refund("T1"),
    calls.settle("T1"),
    calls.deposit(10n ** 16n),
    calls.withdraw(),
    calls.review("E1", "https://a.example/n/x.html"),
  ];
  const writes = Object.entries(all).filter(([, m]) => m.kind === "write").map(([n]) => n).sort();
  assert.equal(writes.length, 8);
  assert.deepEqual([...new Set(built.map((c) => c.fn))].sort(), writes, "the site can send every write and nothing else");
  for (const c of built) {
    const m = all[c.fn];
    assert.equal(c.args.length, m.params, `${c.fn} takes ${m.params} arguments`);
    assert.equal(c.value !== undefined, m.payable, `${c.fn} sends value only when payable`);
  }
  assert.deepEqual(Object.entries(all).filter(([, m]) => m.payable).map(([n]) => n).sort(), ["buy", "deposit"]);
  const open = calls.openEvent("A show", "{}", "https://a.example/n/", 15n * 10n ** 17n, 40.7, 1_900_000_000.9);
  assert.equal(open.args[3], "1500000000000000000", "the price travels as a string of digits");
  assert.equal(open.args[4], 40, "the capacity travels as an integer");
  assert.equal(open.args[5], 1_900_000_000, "the start travels as an integer");
  assert.equal(calls.buy("E1", 5n).value, 5n, "the price is the value sent");
});

test("every view the site reads is a view of the contract, and the site reads every view", () => {
  const all = methods();
  const read = [...chainSource.matchAll(/view\("(\w+)"/g)].map((m) => m[1]);
  const views = Object.entries(all).filter(([, m]) => m.kind === "view").map(([n]) => n);
  assert.equal(views.length, 10);
  for (const name of read) assert.equal(all[name]?.kind, "view", `${name} is a view`);
  for (const name of views) assert.ok(read.includes(name), `the site reads ${name}`);
  for (const name of views) assert.ok(mockSource.includes(`case "${name}":`), `the in-memory contract answers ${name}`);
  // Every list view is paged, at most PAGE rows, and the site never asks for more.
  assert.match(chainSource, /Math\.min\(PAGE, Math\.trunc\(limit\)\)/);
});

test("the limits are the contract's own", () => {
  const nums = {
    MIN_CAPACITY: 1, MAX_CAPACITY: 500, MIN_LEAD: 3600, AFTER_START: 86400, MIN_NAME: 3, MAX_NAME: 80, MIN_TERM: 3, MAX_TERM: 120, MAX_DETAILS: 300,
    MAX_TERMS_JSON: 1200, MAX_PREFIX: 120, MAX_URL: 200, MAX_RAW_PAGE: 32000, MAX_PAGE_TEXT: 6000, FP_CHARS: 16, PAGE: 20, ID_CHARS: 16, ADDRESS_CHARS: 42,
  };
  for (const [name, value] of Object.entries(nums)) {
    assert.equal(Number(constant(name)), value, `${name} in the contract`);
    assert.equal(rules[name], value, `${name} in lib/rules.ts`);
  }
  const products = { MAX_LEAD: ["400 * 86400", 400 * 86400], REFUND_WINDOW: ["7 * 86400", 7 * 86400], MAX_RAW_BYTES: ["4 * MAX_RAW_PAGE", 128000] };
  for (const [name, [expr, value]] of Object.entries(products)) {
    assert.equal(constant(name), expr, `${name} in the contract`);
    assert.equal(rules[name], value, `${name} in lib/rules.ts`);
  }
  const G = 10n ** 18n;
  assert.equal(constant("MIN_PRICE"), "ATTO // 20");
  assert.equal(rules.MIN_PRICE, G / 20n);
  assert.equal(constant("MAX_PRICE"), "50 * ATTO");
  assert.equal(rules.MAX_PRICE, 50n * G);
  assert.equal(constant("REVIEW_FEE"), "ATTO // 100");
  assert.equal(rules.REVIEW_FEE, G / 100n);
  assert.match(raw, /^URL_SIGNS = \("-", "\.", "_", "~", "\/"\)$/m);
  assert.deepEqual(rules.URL_SIGNS, ["-", ".", "_", "~", "/"]);
  assert.match(raw, /^TERM_KEYS = \("date", "venue", "main_act"\)$/m);
  assert.deepEqual([...rules.TERM_KEYS], ["date", "venue", "main_act"]);
  assert.equal(constant("TERMS_SHAPE"), "'" + rules.TERMS_SHAPE + "'");
});

test("the questions, their meanings, the definition and the reading are the contract's own, word for word", () => {
  for (const name of ["QUESTION_CHANGED", "QUESTION_HOLDS", "MEANING_CHANGED", "MEANING_HOLDS", "DESCRIBED", "READING"]) assert.equal(rules[name], pyString(name), name);
});

test("the words the contract stores are the site's", () => {
  for (const [name, list] of [["F_MATERIAL", "material"], ["F_MINOR", "minor"], ["UNCLEAR", "unclear"]]) assert.equal(constant(name), JSON.stringify(list));
  assert.deepEqual(rules.FINDINGS, ["material", "minor", "unclear"]);
  assert.equal(constant("TO_REVIEWER"), '"reviewer"');
  assert.equal(constant("TO_ORGANIZER"), '"organizer"');
  assert.deepEqual(rules.FEE_TO, ["reviewer", "organizer"]);
  assert.equal(constant("ST_ON"), '"on"');
  assert.equal(constant("ST_CHANGED"), '"changed"');
  assert.equal(constant("T_REFUNDED"), '"refunded"');
  assert.equal(constant("T_SETTLED"), '"settled"');
  for (const phase of rules.PHASES) assert.ok(raw.includes(`"${phase}"`), `the contract writes the phase ${phase}`);
});

/** The text of every call `name(...)` in a source, with its parentheses balanced (strings respected). */
function argsOf(source, name) {
  const out = [];
  let at = 0;
  for (;;) {
    const i = source.indexOf(name + "(", at);
    if (i < 0) return out;
    let depth = 0;
    let j = i + name.length;
    let quote = "";
    for (; j < source.length; j++) {
      const ch = source[j];
      if (quote) {
        if (ch === "\\") j++;
        else if (ch === quote) quote = "";
        continue;
      }
      if (ch === '"' || ch === "`" || ch === "'") quote = ch;
      else if (ch === "(") depth++;
      else if (ch === ")" && --depth === 0) break;
    }
    out.push(source.slice(i + name.length + 1, j));
    at = j;
  }
}

/** Every string literal in an expression, cut at its ${...} holes: the pieces of a sentence the code writes itself. */
function pieces(expr) {
  const out = [];
  for (const m of expr.matchAll(/"((?:[^"\\]|\\.)*)"|`([^`]*)`/g)) {
    const text = (m[1] ?? m[2]).replace(/\\"/g, '"');
    for (const part of text.split(/\$\{[^}]*\}/)) {
      const p = part.trim().replace(/^[;:,.]\s*/, "");
      if (p.length >= 8) out.push(p);
    }
  }
  return out;
}

test("every refusal the in-memory contract gives is in the contract's own words", () => {
  const raised = argsOf(mockSource, " fail").filter((a) => /["`]/.test(a));
  assert.ok(raised.length >= 20, `found ${raised.length} refusals`);
  for (const r of raised) for (const p of pieces(r)) assert.ok(contract.includes(p), `the contract says "${p}"`);
  const refused = [...mockSource.matchAll(/problem =\s*([\s\S]*?);\n/g)].map((m) => m[1]).filter((a) => /["`]/.test(a));
  assert.ok(refused.length >= 7, `found ${refused.length} payable refusals`);
  for (const r of refused) for (const p of pieces(r)) assert.ok(contract.includes(p), `the contract says "${p}"`);
  for (const p of pieces(argsOf(mockSource, "refuse").join(" "))) assert.ok(contract.includes(p), `the contract says "${p}"`);
});

test("every sentence the forms give in lib/rules.ts is in the contract's own words", () => {
  const start = rulesSource.indexOf("// ---- reading the caller");
  const end = rulesSource.indexOf("// ---- what the site sends");
  const said = [...rulesSource.slice(start, end).matchAll(/return\s+\(?\s*([^;]+);/g)].map((m) => m[1]).filter((a) => /"/.test(a));
  assert.ok(said.length >= 12, `found ${said.length} sentences`);
  for (const r of said) for (const p of pieces(r)) assert.ok(contract.includes(p), `the contract says "${p}"`);
});

test("the readers of the caller's arguments answer as the contract's do", (t) => {
  const texts = [
    ["", 3, 80, "the name"],
    ["Harbour Lights Festival", 3, 80, "the name"],
    ["two\nlines", 3, 120, "the date term"],
    ["café", 3, 120, "the venue term"],
    ["x".repeat(121), 3, 120, "the main_act term"],
    ["tab\there", 0, 300, "the details"],
    ["<b>angle brackets are fine</b>", 3, 120, "the venue term"],
  ];
  const base = "https://raw.githubusercontent.com/demo-owner/changed/0123456789abcdef0123456789abcdef01234567/notices/";
  const urls = [
    base + "doors-later.html",
    "http://tickets.example/notices/a.html",
    "https://Tickets.example/notices/a.html",
    "https://tickets/notices/a.html",
    "https://tickets.example/a page",
    "https://tickets.example/p?q=1",
    "https://tickets.example//a.html",
    "https://tickets.example/notices/../secret.html",
    "https://tickets.example/notices/./a.html",
    "https://.tickets.example/a",
    "https://tickets.example./a",
    "https://tickets.example",
    "https://" + "a".repeat(200) + ".example/",
    "https://tïckets.example/a",
    "https://tickets.example/~me/notices/",
  ];
  const prefixes = [base, base.slice(0, -1), "https://tickets.example/", "https://tickets.example/" + "n".repeat(110) + "/", "https://tickets.example/a/../b/"];
  const unders = [[base + "x.html", base], [base, base], ["https://tickets.example/notices-x/a", "https://tickets.example/notices"], ["https://other.example/a", base]];
  const numbers = [0, 5, -1, "12", " 7 ", "1.5", "abc", "", "1".repeat(41), true, null, 3.5, "١"];
  const terms = [
    JSON.stringify({ date: "14 June 2027", venue: "Saltmarsh Pier Arena", main_act: "The Lantern Tides", details: "Doors 18:00." }),
    JSON.stringify({ date: " 14 June 2027 ", venue: "Saltmarsh Pier Arena", main_act: "The Lantern Tides" }),
    JSON.stringify({ date: "14 June 2027", venue: "Saltmarsh Pier Arena", main_act: "The Lantern Tides", price: "1" }),
    JSON.stringify({ date: "14 June 2027", venue: "Saltmarsh Pier Arena" }),
    JSON.stringify({ date: 2027, venue: "Saltmarsh Pier Arena", main_act: "The Lantern Tides" }),
    '{"date": "14 June 2027", "venue": "Saltmarsh Pier Arena", "main_act": "The Lantern Tides", "details": 1.5}',
    '{"date": "14 June 2027", "venue": "Pier", "main_act": "Tides", "details": "1e3 is text"}',
    "[1, 2]",
    "not json",
    JSON.stringify({ date: "14 June 2027", venue: "Saltmarsh Pier Arena", main_act: "The Lantern Tides", details: "x".repeat(301) }),
    JSON.stringify({ date: "14 June 2027", venue: "Saltmarsh Pier Arena", main_act: "The Lantern Tides", details: null }),
    JSON.stringify({ date: "No", venue: "Saltmarsh Pier Arena", main_act: "The Lantern Tides" }),
    "x".repeat(1201),
  ];
  const answers = askContract([
    ...texts.map((a) => ({ fn: "_text_problem", args: a })),
    ...urls.map((u) => ({ fn: "_url_problem", args: [u, 200, "the page address"] })),
    ...prefixes.map((p) => ({ fn: "_prefix_problem", args: [p] })),
    ...unders.map((u) => ({ fn: "_under", args: u })),
    ...numbers.map((n) => ({ fn: "_number_arg", args: [n] })),
    ...terms.map((j) => ({ fn: "_terms_problem", args: [j] })),
  ]);
  if (!answers) return t.skip("no python3 on this machine");
  let k = 0;
  for (const a of texts) assert.equal(rules.textProblem(...a), answers[k++].ok, `text ${JSON.stringify(a[0]).slice(0, 30)}`);
  for (const u of urls) assert.equal(rules.urlProblem(u, 200, "the page address"), answers[k++].ok, `url ${u.slice(0, 60)}`);
  for (const p of prefixes) assert.equal(rules.prefixProblem(p), answers[k++].ok, `prefix ${p.slice(0, 60)}`);
  for (const u of unders) assert.equal(rules.under(...u), answers[k++].ok, `under ${u[0].slice(-30)}`);
  for (const n of numbers) assert.equal(rules.numberArg(n).toString(), String(answers[k++].ok), `number ${JSON.stringify(n)}`);
  for (const j of terms) {
    const [problem, out] = answers[k++].ok;
    const mine = rules.termsProblem(j);
    assert.equal(mine.problem, problem, `terms ${j.slice(0, 60)}`);
    if (!problem) assert.deepEqual(mine.terms, out, `terms stored as ${JSON.stringify(out)}`);
  }
});

test("an event is opened, or refused, exactly where the contract would", async () => {
  const G = 10n ** 18n;
  const good = rules.termsJson({ date: "14 June 2027", venue: "Saltmarsh Pier Arena", main_act: "The Lantern Tides", details: "" });
  const prefix = "https://tickets.example/notices/";
  const now = mock.mockNow();
  const cases = [
    [["Harbour", good, prefix, G, 10, now + 7200], ""],
    [["Ha", good, prefix, G, 10, now + 7200], "the name is 3 to 80 characters; this one is 2"],
    [["Harbour", "{}", prefix, G, 10, now + 7200], 'the terms give "date" as a string'],
    [["Harbour", good, "https://tickets.example/notices", G, 10, now + 7200], "the site prefix ends with /, so it names a whole directory of pages: https://tickets.example/notices"],
    [["Harbour", good, prefix, G / 100n, 10, now + 7200], rules.priceProblem(G / 100n)],
    [["Harbour", good, prefix, G, 501, now + 7200], rules.capacityProblem(501n)],
  ];
  mock.setMockPersona(mock.PASSER_BY);
  for (const [args, expected] of cases) {
    const hash = await mock.write(calls.openEvent(...args));
    let s;
    for (let i = 0; i < 20; i++) {
      s = await mock.txStatus(hash);
      if (s.status === "FINALIZED") break;
    }
    if (expected) assert.equal(s.message, "[EXPECTED] " + expected);
    else assert.equal(s.result?.ok, true, "an event inside every limit opens");
  }
  // The start's own check against the transaction's clock.
  const late = await mock.write(calls.openEvent("Harbour", good, prefix, G, 10, now + 60));
  let s;
  for (let i = 0; i < 20; i++) s = await mock.txStatus(late);
  assert.match(s.message, /^\[EXPECTED\] the start is a unix time from 3600 to 34560000 seconds after now \(\d+\); this one is \d+$/);
});

test("the in-memory rules() is the contract's rules(), whole", async (t) => {
  const mine = JSON.parse(await mock.view("rules", []));
  const answers = askContract([{ fn: "rules" }]);
  if (!answers) return t.skip("no python3 on this machine");
  assert.deepEqual(mine, answers[0].ok);
});
