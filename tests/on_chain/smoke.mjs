/* Changed against GenLayer Studio (chain 61999), with throwaway accounts. Deploys its own copy.
 *
 *   npm ci                                                   # genlayer-js 1.1.8 and viem 2.56.8, pinned by package-lock.json
 *   COMMIT=<sha> node tests/on_chain/smoke.mjs               # the whole run, about thirty minutes
 *   COMMIT=<sha> RESUME=1 node tests/on_chain/smoke.mjs      # continue a run that was cut off, from the saved state
 *   STATE=/some/dir/run.json ...                             # the state file: keys, contract address, every step made
 *   FRESH=1 ...                                              # start over even though a saved run exists
 *
 * The validators read the notices from raw.githubusercontent.com, pinned to one commit, so the page every node
 * fetches is the same bytes. Push the repository first and pass that commit as COMMIT (40 hex characters). REPO
 * is "<owner>/<name>" on GitHub; when it is not set it is read from `git remote get-url origin`. The script
 * fetches the notices itself before it deploys anything, and stops if they are not there.
 *
 * Four accounts the script generates and funds itself play the whole story: ORGANIZER runs the Harbour Lights
 * Festival and publishes its notices under notices/, FAN_A and FAN_B buy tickets, and STRANGER holds no ticket
 * and tries what only the others may do. Tickets cost 0.5 GEN; a review takes 0.01 GEN of credit.
 *
 * Phases:
 *   A  deploy; ORGANIZER opens E1 (14 June 2027, Saltmarsh Pier Arena, The Lantern Tides; three tickets; the
 *      start about three hours away; the site prefix is notices/ at COMMIT). STRANGER tries to cancel it and is
 *      refused. FAN_A and FAN_B buy a ticket each; each 0.5 GEN is held in escrow. ORGANIZER tries to buy its own
 *      ticket and FAN_A sends 0.4 GEN: both refused, the value back in the same transaction. FAN_A asks for a
 *      refund before anything changed and STRANGER tries to settle a ticket to the organizer early: both refused.
 *   B  the notices of E1, one consensus round per review:
 *        STRANGER asks for a review with no credit: refused; the three non-organizers deposit credit
 *        FAN_A points at the repository's README, outside the prefix: refused before anything is fetched
 *        FAN_A: doors-later.html (doors at 18:30)          minor; the 0.01 GEN fee goes to ORGANIZER
 *        FAN_B: doors-later.html again                     the same text: a repeat of the first reading, which
 *                                                          stands; the fee goes to ORGANIZER though FAN_B holds a
 *                                                          ticket, so asking again is never a free second roll
 *        FAN_B: new-date.html (moved to 21 June 2027)      material; E1 changed, the fee stays with FAN_B
 *      FAN_A and FAN_B take their 0.5 GEN back from escrow; a second refund and a late purchase are refused.
 *   C  E2, the same festival on sale again with two tickets: FAN_A and FAN_B buy them, STRANGER finds it sold out
 *      and is refunded in the same transaction. STRANGER (no ticket) asks for new-support.html: minor, the fee to
 *      ORGANIZER. A settle would open only a day after the start, so it is shown refused instead; ORGANIZER cancels
 *      E2 and both fans take their money back. A settle of a refunded ticket is refused.
 *   D  the deployed code is read back and compared with contracts/changed.py byte for byte; the views are checked
 *      against what the run did; everyone takes its credit back; the contract holds nothing; every account ends
 *      where the money says: ORGANIZER up three fees (two minor readings and one repeat), FAN_A, FAN_B and
 *      STRANGER down one fee each.
 *
 * Every refusal is a signed transaction. Balances are read before and after every step that moves money.
 * Transactions are polled with eth_getTransactionByHash, never with views (gen_call is limited to 30 a minute
 * per client, shared with sim_fundAccount). A round the validators do not carry stores nothing; it is sent again
 * and both transactions are kept. Every id is read from the receipt of the call that made it. Every step is saved
 * as it is made, so a run cut off by a closed laptop continues with RESUME=1 without sending anything twice.
 */
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { generatePrivateKey } from "viem/accounts";
import { getAddress } from "viem";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RPC = "https://studio.genlayer.com/api";
const EXPLORER = "https://explorer-studio.genlayer.com";
const STATE = process.env.STATE || join(tmpdir(), "changed-smoke-state.json");
const RECORD = process.env.RECORD || STATE.replace(/\.json$/, "") + "-record.json";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString().slice(11, 19);
const rpc = async (m, p) => {
  let last;
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) });
      const j = await r.json();
      if (j.error && (j.error.code === -32029 || r.status === 429)) { await sleep(((j.error.data?.retry_after_seconds) || 20) * 1000); continue; }
      if (j.error) { last = new Error(m + ": " + JSON.stringify(j.error).slice(0, 200)); await sleep(6000); continue; }
      return j.result;
    } catch (e) { last = e; await sleep(4000); }   // the connection itself failed, or the answer was not JSON
  }
  throw last;
};
let pass = 0, fail = 0;
const ok = (n, c, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  - " + d : ""}`); return !!c; };
const note = (s) => console.log(`      .. ${s}`);
const GEN = 10n ** 18n;
const tally = (v) => `${v.agree} agree, ${v.disagree} disagree, ${v.idle} idle`;
const sha = (text) => createHash("sha256").update(text).digest("hex");

// ---------- where the validators will read the notices ----------
const COMMIT = String(process.env.COMMIT || "").trim();
if (!/^[0-9a-f]{40}$/.test(COMMIT)) {
  console.log("COMMIT must be the 40-character commit the notices were pushed in: COMMIT=<sha> node tests/on_chain/smoke.mjs");
  process.exit(2);
}
let REPO = String(process.env.REPO || "").trim();
if (!REPO) {
  try {
    const origin = execSync("git remote get-url origin", { cwd: new URL("../..", import.meta.url), encoding: "utf8" }).trim();
    REPO = (origin.match(/github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/) || [])[1] || "";
  } catch (e) { REPO = ""; }
}
if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(REPO)) {
  console.log("REPO must be <owner>/<name> on GitHub (or set the git remote origin): REPO=<owner>/changed COMMIT=<sha> ...");
  process.exit(2);
}
const RAW_ROOT = `https://raw.githubusercontent.com/${REPO}/${COMMIT}/`;
const NOTICES = RAW_ROOT + "notices/";
if (NOTICES.length > 120) {
  console.log(`The site prefix ${NOTICES} must be at most 120 characters (the contract's own rule); use a shorter repository name.`);
  process.exit(2);
}
const PAGE = { doors: NOTICES + "doors-later.html", newDate: NOTICES + "new-date.html", support: NOTICES + "new-support.html" };
const OUTSIDE = RAW_ROOT + "README.md";          // a real page of the same commit, but not below the prefix
const LOCAL = {};
for (const [name, address] of Object.entries(PAGE)) {
  LOCAL[name] = readFileSync(new URL("../../notices/" + address.slice(NOTICES.length), import.meta.url), "utf8");
  let there = "";
  try { const r = await fetch(address); there = r.ok ? await r.text() : ""; } catch (e) { there = ""; }
  if (there !== LOCAL[name]) {
    console.log(`${address}\ndoes not serve notices/${address.slice(NOTICES.length)} as it is in this checkout. Push the repository and pass that commit as COMMIT.`);
    process.exit(2);
  }
}
// what every validator should fingerprint: the first 32,000 characters with their tags removed (and the text after a
// script or style tag), then their spacing collapsed, at most 6,000; the contract's _visible and _page_text
const visible = (text) => {
  const pieces = text.slice(0, 32000).split("<");
  let out = pieces[0];
  for (const piece of pieces.slice(1)) {
    const close = piece.indexOf(">");
    if (close === -1) out += "<" + piece;
    else if (/^(script|style)/.test(piece.slice(0, 6).toLowerCase())) out += " ";
    else out += " " + piece.slice(close + 1);
  }
  return out;
};
const fpOf = (text) => sha(visible(text).slice(0, 32000).split(/\s+/).filter(Boolean).join(" ").slice(0, 6000)).slice(0, 16);

// ---------- state: keys, the contract address and every step already made survive a cut-off run ----------
if (existsSync(STATE) && !process.env.RESUME && !process.env.FRESH) {
  console.log(`A saved run exists at ${STATE}.\nRESUME=1 continues it; FRESH=1 starts over; STATE=<path> keeps another.`);
  process.exit(2);
}
const st = existsSync(STATE) && process.env.RESUME && !process.env.FRESH ? JSON.parse(readFileSync(STATE, "utf8")) : {};
st.keys = st.keys || {}; st.steps = st.steps || {}; st.views = st.views || {}; st.order = st.order || [];
st.commit = st.commit || COMMIT; st.repo = st.repo || REPO;
if (st.commit !== COMMIT) { console.log(`This saved run used commit ${st.commit}; continue it with that COMMIT, or start over with FRESH=1.`); process.exit(2); }
const save = () => {
  writeFileSync(STATE, JSON.stringify(st, null, 1));
  const { keys, ...shown } = st;       // the record carries no key
  writeFileSync(RECORD, JSON.stringify(shown, null, 1));
};
const ROLES = { organizer: "ORGANIZER, who runs the festival", fanA: "FAN_A", fanB: "FAN_B", stranger: "STRANGER" };
for (const k of Object.keys(ROLES)) st.keys[k] = st.keys[k] || generatePrivateKey();
const acct = {}, client = {};
for (const k of Object.keys(ROLES)) { acct[k] = createAccount(st.keys[k]); client[k] = createClient({ chain: studionet, account: acct[k] }); }
const rd = createClient({ chain: studionet });
st.accounts = Object.fromEntries(Object.keys(ROLES).map((k) => [k, getAddress(acct[k].address)]));
save();

const balance = async (a) => BigInt(await rpc("eth_getBalance", [a, "latest"]) || "0x0");
const nonceOf = async (a) => Number(BigInt(await rpc("eth_getTransactionCount", [a, "latest"]) || "0x0"));
const fundOnce = async (k, whole) => {
  st.funded = st.funded || {};
  if (st.funded[k]) return;
  await rpc("sim_fundAccount", { account_address: getAddress(acct[k].address), amount: whole * 1e18 });   // checksummed
  for (let i = 0; i < 20 && (await balance(acct[k].address)) === 0n; i++) await sleep(3000);
  st.funded[k] = String(await balance(acct[k].address)); save();
};

// ---------- transactions ----------
const errText = (e) => String(e?.details || e?.shortMessage || e?.cause?.message || e?.message || e);
// A request the network refused or never received is made again. When the failure is ambiguous the
// sender's nonce says whether the transaction landed after all, and its hash is read back, so nothing
// is ever sent twice.
const sendRaw = async (who, what, make) => {
  const addr = acct[who].address;
  for (let i = 0; ; i++) {
    const n0 = await nonceOf(addr);
    try { return await make(); } catch (e) {
      const text = errText(e);
      if (i >= 8) throw e;
      console.log(`      ${what} was not taken (${text.slice(0, 70)}); looking again in 20s`);
      await sleep(20000);
      if ((await nonceOf(addr)) > n0) {
        const list = await rpc("sim_getTransactionsForAddress", [addr]);
        const hit = (list || []).find((t) => String(t.from_address).toLowerCase() === addr.toLowerCase() && Number(t.nonce) === n0);
        if (hit?.hash) return hit.hash;
        throw new Error(what + " landed but its hash could not be read back");
      }
    }
  }
};
const countVotes = (t) => { let a = 0, d = 0, idl = 0; for (const k in (t.consensus_data?.votes || {})) { const v = t.consensus_data.votes[k]; if (v === "agree") a++; else if (v === "disagree") d++; else idl++; } return { agree: a, disagree: d, idle: idl }; };
const wait = async (tx) => {
  let stuck = 0;
  for (let i = 0; i < 900; i++) {
    await sleep(4000);
    const t = await rpc("eth_getTransactionByHash", [tx]);
    if (t?.status === "FINALIZED") {
      const lr = t.consensus_data?.leader_receipt, one = Array.isArray(lr) ? lr[0] : lr;
      let msg = "";
      try { msg = Buffer.from(one.result, "base64").toString("utf8").replace(/[^\x20-\x7e]/g, " ").trim(); } catch (e) {}
      const v = countVotes(t);
      return { tx, msg, exec: one?.execution_result || "", votes: v, applied: v.agree * 2 > v.agree + v.disagree + v.idle, address: t.data?.contract_address || t.to_address || "" };
    }
    // a round no majority carried is final as it stands once it has been left alone for ten minutes
    if (t?.status === "UNDETERMINED" && (stuck = stuck + 1) > 150) return { tx, msg: "UNDETERMINED", exec: "", votes: countVotes(t), applied: false, address: "" };
    if (t?.status === "CANCELED") return { tx, msg: "CANCELED", exec: "", votes: { agree: 0, disagree: 0, idle: 0 }, applied: false, address: "" };
    if (i > 0 && i % 75 === 0) console.log(`      [${stamp()}] still ${t?.status || "unknown"} after ${Math.round(i * 4 / 60)} minutes: ${tx}`);
  }
  return { tx, msg: "TIMEOUT", exec: "", votes: { agree: 0, disagree: 0, idle: 0 }, applied: false, address: "" };
};
const jsonOf = (msg) => { const b = String(msg).indexOf("{"); if (b === -1) return null; try { return JSON.parse(String(msg).slice(b)); } catch (e) { return null; } };
const settleBalance = async (a, before, want) => { for (let i = 0; i < 45; i++) { const b = await balance(a); if (b - before === want) return b; await sleep(4000); } return await balance(a); };

// One step of the run: a signed transaction, its tally, what it returned, and the balances it moved.
// opt.value is what is sent with it; opt.watch names the accounts whose balances are read before and
// after; opt.expect is the change each should show once every transfer has landed, a table or a
// function of what the call returned. A step already in the saved state is not sent again.
const call = async (id, who, fn, args = [], opt = {}) => {
  if (!st.steps[id]) { st.steps[id] = { id, who, fn, args: args.map(String), value: String(opt.value || 0n), tries: [] }; st.order.push(id); }
  const rec = st.steps[id];
  if (!rec.done) {
    const watch = opt.watch || [];
    if (!rec.before) { rec.before = {}; for (const k of watch) rec.before[k] = String(await balance(acct[k].address)); save(); }
    let r;
    for (;;) {
      if (!rec.pending) {
        rec.pending = await sendRaw(who, fn, () => client[who].writeContract({ address: st.contract, functionName: fn, args, ...(opt.value ? { value: opt.value } : {}) }));
        save();
      }
      r = await wait(rec.pending);
      rec.tries.push({ tx: r.tx, votes: r.votes, exec: r.exec, applied: r.applied, msg: r.msg, at: stamp() });
      rec.pending = null; save();
      console.log(`      [${stamp()}] ${who.toUpperCase()} ${fn}(${args.map((x) => String(x).slice(-30)).join(", ")})${opt.value ? " +" + Number(opt.value) / 1e18 + " GEN" : ""}  ${r.tx}  ${tally(r.votes)}  ${r.exec}`);
      if (r.msg === "TIMEOUT" || rec.tries.length >= 4) break;
      if (!r.applied) { console.log("      the validators did not carry that round (" + tally(r.votes) + "), so nothing was stored; sending it again"); continue; }
      break;
    }
    const expect = typeof opt.expect === "function" ? opt.expect(jsonOf(r.msg)) : opt.expect;
    rec.after = {}; rec.delta = {};
    for (const k of watch) {
      const before = BigInt(rec.before[k]);
      const want = expect && expect[k] !== undefined ? BigInt(expect[k]) : null;
      const now = want === null ? await balance(acct[k].address) : await settleBalance(acct[k].address, before, want);
      rec.after[k] = String(now); rec.delta[k] = String(now - before);
    }
    rec.done = true; save();
  }
  const last = rec.tries[rec.tries.length - 1];
  return { ...last, j: jsonOf(last.msg), tries: rec.tries, delta: rec.delta || {} };
};
const refused = (r, words) => r.exec === "ERROR" && r.msg.includes(words);
const moved = (r, k, want) => r.delta[k] === String(want);
const votes = (r) => r.tries.map((t) => tally(t.votes)).join(", then ");

const deploy = async (id, who, path) => {
  if (!st.steps[id]) { st.steps[id] = { id, who, fn: "deploy " + path.split("/").pop(), args: [], value: "0", tries: [] }; st.order.push(id); }
  const rec = st.steps[id];
  if (!rec.done) {
    const code = readFileSync(new URL(path, import.meta.url));
    for (;;) {
      if (!rec.pending) { rec.pending = await sendRaw(who, "deploy", () => client[who].deployContract({ code, args: [], leaderOnly: false })); save(); }
      const r = await wait(rec.pending);
      rec.tries.push({ tx: r.tx, votes: r.votes, exec: r.exec, applied: r.applied, msg: r.msg.slice(0, 300), at: stamp() });
      rec.address = r.address; rec.pending = null; save();
      console.log(`      [${stamp()}] ${who.toUpperCase()} deploy ${path.split("/").pop()}  ${r.tx}  ${tally(r.votes)}  ${r.exec}  ${r.address}`);
      if (r.applied || r.msg === "TIMEOUT" || rec.tries.length >= 3) break;
    }
    rec.done = true; save();
  }
  return rec.address;
};

// ---------- reads: paced, and made again on a 429 or on "Contract not found" instead of failing ----------
let lastRead = 0;
const read = async (fn, args = []) => {
  for (let i = 0; i < 30; i++) {
    const gap = 3500 - (Date.now() - lastRead);
    if (gap > 0) await sleep(gap);
    lastRead = Date.now();
    try { return JSON.parse(String(await rd.readContract({ address: st.contract, functionName: fn, args }))); } catch (e) {
      if (i === 29) return { error: "VIEW ERROR " + fn + ": " + errText(e).slice(0, 100) };
      await sleep(/rate|429|limit/i.test(errText(e)) ? 25000 : 10000);
    }
  }
};
// a view read once for a check is kept with the run, so a continued run checks what was seen then
const seen = async (id, fn, args = []) => { if (!st.views[id]) { st.views[id] = { fn, args, at: stamp(), out: await read(fn, args) }; save(); } return st.views[id].out; };

// ---------- the demonstration: one festival, its terms, the same notices as tests/test_pure.py ----------
const NAME = "Harbour Lights Festival";
const DATE = "14 June 2027";
const VENUE = "Saltmarsh Pier Arena";
const MAIN_ACT = "The Lantern Tides";
const DETAILS = "Doors open at 18:00. Support act: Copper Gulls. One night only.";
const TERMS_JSON = JSON.stringify({ date: DATE, venue: VENUE, main_act: MAIN_ACT, details: DETAILS });
const PRICE = GEN / 2n, FEE = GEN / 100n;
const CAPACITY_1 = 3, CAPACITY_2 = 2;
const LEAD = 3 * 3600;                            // each event starts about three hours after it is opened
const QUESTION_CHANGED = "Does the PAGE say that the event will not take place as the TERMS describe it? Answer yes, no or unclear.";
const QUESTION_HOLDS = "Going by the PAGE, will the event still take place as the TERMS describe it? Answer yes, no or unclear.";
const startsAt = (key) => { if (!st[key]) { st[key] = Math.floor(Date.now() / 1000) + LEAD; save(); } return st[key]; };

await fundOnce("organizer", 5); await fundOnce("fanA", 5); await fundOnce("fanB", 5); await fundOnce("stranger", 5);
if (!st.start) { st.start = {}; for (const k of Object.keys(ROLES)) st.start[k] = String(await balance(acct[k].address)); st.started = new Date().toISOString(); save(); }
console.log(`[${stamp()}] ${Object.keys(ROLES).map((k) => k.toUpperCase().padEnd(9) + " " + st.accounts[k]).join("\n           ")}\n           notices ${NOTICES}\n           state ${STATE}`);

// ================================================================ phase A
console.log(`\n[${stamp()}] ---- phase A: deploy, the festival on sale, two tickets in escrow`);
st.contract = st.contract || await deploy("deploy", "organizer", "../../contracts/changed.py");
save();
console.log(`      Changed at ${st.contract}`);
const open1 = await call("openE1", "organizer", "open_event", [NAME, TERMS_JSON, NOTICES, String(PRICE), CAPACITY_1, startsAt("startsAt1")]);
ok("ORGANIZER opens E1, the Harbour Lights Festival: 14 June 2027, Saltmarsh Pier Arena, The Lantern Tides; 0.5 GEN, three tickets", open1.j?.ok === true && open1.j?.event === "E1" && open1.j?.terms?.main_act === MAIN_ACT && open1.j?.site_prefix === NOTICES && open1.j?.price === String(PRICE), `${votes(open1)}  ${open1.msg.slice(0, 120)}`);
const e1 = open1.j?.event || "E1";
const sc = await call("cancelStranger", "stranger", "cancel", [e1]);
ok(`STRANGER may not cancel ${e1}`, refused(sc, "only the organizer of " + e1 + " may cancel it"), `${votes(sc)}  ${sc.msg.slice(0, 110)}`);
const tk = {};
for (const [id, who] of [["buyA1", "fanA"], ["buyB1", "fanB"]]) {
  const r = await call(id, who, "buy", [e1], { value: PRICE, watch: [who], expect: { [who]: -PRICE } });
  ok(`${who === "fanA" ? "FAN_A" : "FAN_B"} buys ${r.j?.ticket} to ${e1}: 0.5 GEN held in escrow`, r.j?.ok === true && r.j?.held === String(PRICE) && moved(r, who, -PRICE), `${votes(r)}  ${r.msg.slice(0, 100)}`);
  tk[id] = r.j?.ticket || "";
}
const own = await call("buyOwn", "organizer", "buy", [e1], { value: PRICE, watch: ["organizer"], expect: { organizer: 0n } });
ok("ORGANIZER may not buy its own ticket, and the 0.5 GEN comes back in the same transaction", own.exec !== "ERROR" && own.j?.ok === false && String(own.j?.reason).includes("may not buy its own tickets") && own.j?.returned === String(PRICE) && moved(own, "organizer", 0n), `${votes(own)}  ${own.j?.reason}`);
const SHORT = PRICE - GEN / 10n;
const short = await call("buyShort", "fanA", "buy", [e1], { value: SHORT, watch: ["fanA"], expect: { fanA: 0n } });
ok("FAN_A sends 0.4 GEN for a 0.5 GEN ticket: refused, and the 0.4 GEN comes back", short.j?.ok === false && String(short.j?.reason).includes("send exactly the price of " + String(PRICE)) && short.j?.returned === String(SHORT) && moved(short, "fanA", 0n), `${votes(short)}  ${short.j?.reason}`);
const early = await call("refundEarly", "fanA", "refund", [tk.buyA1], { watch: ["fanA"], expect: { fanA: 0n } });
ok(`FAN_A may not refund ${tk.buyA1} while nothing has changed`, refused(early, e1 + " has not changed") && moved(early, "fanA", 0n), `${votes(early)}  ${early.msg.slice(0, 140)}`);
const settleEarly = await call("settleEarly", "stranger", "settle", [tk.buyA1], { watch: ["organizer"], expect: { organizer: 0n } });
ok(`nobody may settle ${tk.buyA1} to the organizer before a day after the start`, refused(settleEarly, tk.buyA1 + " settles to the organizer from") && moved(settleEarly, "organizer", 0n), `${votes(settleEarly)}  ${settleEarly.msg.slice(0, 140)}`);

// ================================================================ phase B
console.log(`\n[${stamp()}] ---- phase B: the notices of ${e1}, every review read by the validators on the live web`);
const broke = await call("reviewNoCredit", "stranger", "review", [e1, PAGE.doors]);
ok("STRANGER asks for a review with no credit: refused before anything is fetched", refused(broke, "this address holds 0; deposit() first"), `${votes(broke)}  ${broke.msg.slice(0, 140)}`);
for (const [id, who, value] of [["depositA", "fanA", 3n * FEE], ["depositB", "fanB", 3n * FEE], ["depositS", "stranger", 2n * FEE]]) {
  const r = await call(id, who, "deposit", [], { value, watch: [who], expect: { [who]: -value } });
  ok(`${who === "fanA" ? "FAN_A" : who === "fanB" ? "FAN_B" : "STRANGER"} deposits ${Number(value) / 1e18} GEN of review credit`, r.j?.ok === true && r.j?.credit === String(value) && moved(r, who, -value), `${votes(r)}  ${r.msg.slice(0, 100)}`);
}
const outside = await call("reviewOutside", "fanA", "review", [e1, OUTSIDE], { watch: ["fanA", "organizer"], expect: { fanA: 0n, organizer: 0n } });
ok("FAN_A points at the repository's README, outside the organizer's prefix: refused before any fetch, no fee", refused(outside, "the page is not below " + e1 + "'s site prefix " + NOTICES) && moved(outside, "organizer", 0n), `${votes(outside)}  ${outside.msg.slice(0, 160)}`);
const r1 = await call("reviewDoors", "fanA", "review", [e1, PAGE.doors], { watch: ["organizer"], expect: (j) => ({ organizer: j?.fee_to === "organizer" ? FEE : 0n }) });
ok("every validator reads doors-later.html (doors at 18:30): minor, nothing changes, the 0.01 GEN fee goes to ORGANIZER", r1.applied && r1.j?.finding === "minor" && r1.j?.fee_to === "organizer" && r1.j?.status === "on" && /^[0-9a-f]{16}$/.test(String(r1.j?.fp)) && moved(r1, "organizer", FEE), `${votes(r1)}  ${JSON.stringify({ review: r1.j?.review, finding: r1.j?.finding, fp: r1.j?.fp, credit: r1.j?.credit })}`);
if (r1.j?.fp) note(`the stored fingerprint ${r1.j.fp}; this checkout's file collapsed gives ${fpOf(LOCAL.doors)}`);
const again = await call("reviewDoorsAgain", "fanB", "review", [e1, PAGE.doors], { watch: ["organizer"], expect: (j) => ({ organizer: j?.fee_to === "organizer" ? FEE : 0n }) });
ok(`FAN_B asks about doors-later.html again: the same text, so ${r1.j?.review || "R1"} stands and the fee goes to ORGANIZER although FAN_B holds a ticket`, again.applied && again.j?.repeat_of === (r1.j?.review || "R1") && again.j?.finding === "minor" && again.j?.fp === r1.j?.fp && again.j?.fee_to === "organizer" && again.j?.holder === true && again.j?.credit === String(2n * FEE) && moved(again, "organizer", FEE), `${votes(again)}  ${JSON.stringify({ review: again.j?.review, repeat_of: again.j?.repeat_of, fee_to: again.j?.fee_to })}`);
const r2 = await call("reviewNewDate", "fanB", "review", [e1, PAGE.newDate], { watch: ["fanB", "organizer"], expect: { fanB: 0n, organizer: 0n } });
ok(`every validator reads new-date.html (moved to 21 June 2027): material, ${e1} changes and the fee stays with FAN_B`, r2.applied && r2.j?.finding === "material" && r2.j?.fee_to === "reviewer" && r2.j?.status === "changed" && r2.j?.repeat_of === "" && r2.j?.credit === String(2n * FEE) && moved(r2, "organizer", 0n), `${votes(r2)}  ${JSON.stringify({ review: r2.j?.review, finding: r2.j?.finding, fp: r2.j?.fp })}`);
if (r2.j?.fp) note(`the stored fingerprint ${r2.j.fp}; this checkout's file collapsed gives ${fpOf(LOCAL.newDate)}`);
for (const [id, who, ticket] of [["refundA1", "fanA", tk.buyA1], ["refundB1", "fanB", tk.buyB1]]) {
  const r = await call(id, who, "refund", [ticket], { watch: [who], expect: { [who]: PRICE } });
  ok(`${who === "fanA" ? "FAN_A" : "FAN_B"} takes the 0.5 GEN of ${ticket} back from escrow`, r.j?.status === "refunded" && r.j?.paid === String(PRICE) && moved(r, who, PRICE), `${votes(r)}  ${r.msg.slice(0, 120)}`);
}
const twice = await call("refundTwice", "fanA", "refund", [tk.buyA1]);
ok(`a second refund of ${tk.buyA1} is refused`, refused(twice, tk.buyA1 + " is refunded; a ticket is paid out once"), `${votes(twice)}  ${twice.msg.slice(0, 110)}`);
const late = await call("buyChanged", "fanA", "buy", [e1], { value: PRICE, watch: ["fanA"], expect: { fanA: 0n } });
ok(`${e1} changed, so it sells nothing more, and the 0.5 GEN comes back`, late.j?.ok === false && String(late.j?.reason).includes(e1 + " is changed") && moved(late, "fanA", 0n), `${votes(late)}  ${late.j?.reason}`);

// ================================================================ phase C
console.log(`\n[${stamp()}] ---- phase C: E2 on sale, a minor notice, then the organizer cancels`);
const open2 = await call("openE2", "organizer", "open_event", [NAME, TERMS_JSON, NOTICES, String(PRICE), CAPACITY_2, startsAt("startsAt2")]);
ok("ORGANIZER puts the festival on sale again as E2, with two tickets", open2.j?.ok === true && open2.j?.event === "E2" && open2.j?.capacity === CAPACITY_2, `${votes(open2)}  ${open2.msg.slice(0, 100)}`);
const e2 = open2.j?.event || "E2";
for (const [id, who] of [["buyA2", "fanA"], ["buyB2", "fanB"]]) {
  const r = await call(id, who, "buy", [e2], { value: PRICE, watch: [who], expect: { [who]: -PRICE } });
  ok(`${who === "fanA" ? "FAN_A" : "FAN_B"} buys ${r.j?.ticket} to ${e2}`, r.j?.ok === true && moved(r, who, -PRICE), `${votes(r)}  ${r.msg.slice(0, 100)}`);
  tk[id] = r.j?.ticket || "";
}
const full = await call("buySoldOut", "stranger", "buy", [e2], { value: PRICE, watch: ["stranger"], expect: { stranger: 0n } });
ok(`${e2} is sold out: STRANGER is refused and the 0.5 GEN comes back`, full.j?.ok === false && String(full.j?.reason).includes(e2 + " is sold out: all 2 tickets are sold") && moved(full, "stranger", 0n), `${votes(full)}  ${full.j?.reason}`);
const r3 = await call("reviewSupport", "stranger", "review", [e2, PAGE.support], { watch: ["organizer"], expect: (j) => ({ organizer: j?.fee_to === "organizer" ? FEE : 0n }) });
ok("STRANGER, holding no ticket, asks for new-support.html: minor, the fee goes to ORGANIZER", r3.applied && r3.j?.finding === "minor" && r3.j?.fee_to === "organizer" && r3.j?.holder === false && r3.j?.status === "on" && moved(r3, "organizer", FEE), `${votes(r3)}  ${JSON.stringify({ review: r3.j?.review, finding: r3.j?.finding, fp: r3.j?.fp })}`);
const settle2 = await call("settleE2Early", "stranger", "settle", [tk.buyA2]);
ok(`${tk.buyA2} cannot be settled to the organizer yet: that opens a day after ${e2} starts`, refused(settle2, tk.buyA2 + " settles to the organizer from"), `${votes(settle2)}  ${settle2.msg.slice(0, 140)}`);
const cancelled = await call("cancelE2", "organizer", "cancel", [e2], { watch: ["organizer"], expect: { organizer: 0n } });
ok(`ORGANIZER cancels ${e2} before its start: every refund opens, nothing is paid to anyone yet`, cancelled.j?.status === "changed" && cancelled.j?.changed_by === "organizer" && cancelled.j?.held === String(2n * PRICE) && moved(cancelled, "organizer", 0n), `${votes(cancelled)}  ${cancelled.msg.slice(0, 120)}`);
for (const [id, who, ticket] of [["refundA2", "fanA", tk.buyA2], ["refundB2", "fanB", tk.buyB2]]) {
  const r = await call(id, who, "refund", [ticket], { watch: [who], expect: { [who]: PRICE } });
  ok(`${who === "fanA" ? "FAN_A" : "FAN_B"} takes the 0.5 GEN of ${ticket} back`, r.j?.status === "refunded" && moved(r, who, PRICE), `${votes(r)}  ${r.msg.slice(0, 100)}`);
}
const settleRefunded = await call("settleRefunded", "stranger", "settle", [tk.buyB2]);
ok(`a refunded ticket (${tk.buyB2}) can never be settled to the organizer`, refused(settleRefunded, tk.buyB2 + " is refunded; a ticket is paid out once"), `${votes(settleRefunded)}  ${settleRefunded.msg.slice(0, 110)}`);

// ================================================================ phase D
console.log(`\n[${stamp()}] ---- phase D: the code read back, the views, the credit, the balances`);
{
  const file = readFileSync(new URL("../../contracts/changed.py", import.meta.url));
  const chain = Buffer.from(String(await rpc("gen_getContractCode", [st.contract])), "base64");
  st.code = { address: st.contract, bytes: chain.length, sha256: sha(chain), file_bytes: file.length, file_sha256: sha(file), identical: Buffer.compare(chain, file) === 0 };
  save();
  ok(`the code deployed at ${st.contract} is byte for byte contracts/changed.py`, st.code.identical, `${chain.length} bytes, sha256 ${st.code.sha256}`);
  const ev1 = await seen("event1", "event", [e1]);
  ok(`event(${e1}) reads changed by review ${r2.j?.review}, nothing left in escrow`, ev1.status === "changed" && ev1.changed_by === "review" && ev1.change_review === r2.j?.review && ev1.held === "0" && ev1.record?.refunded === 2 && ev1.record?.minor === 1 && ev1.record?.material === 1 && ev1.record?.repeats === 1 && ev1.record?.fees_won === String(2n * FEE), JSON.stringify({ status: ev1.status, changed_by: ev1.changed_by, record: ev1.record }));
  const revs = await seen("reviews1", "reviews_of", [e1, 0, 20]);
  ok(`reviews_of(${e1}) lists the three reviews with the page, the finding, the repeat, the fingerprint and where the fee went`, revs.total === 3 && revs.rows?.[0]?.url === PAGE.doors && revs.rows?.[0]?.finding === "minor" && revs.rows?.[0]?.fee_to === "organizer" && revs.rows?.[1]?.repeat_of === revs.rows?.[0]?.review && revs.rows?.[1]?.fp === revs.rows?.[0]?.fp && revs.rows?.[1]?.fee_to === "organizer" && revs.rows?.[2]?.url === PAGE.newDate && revs.rows?.[2]?.finding === "material" && revs.rows?.[2]?.fee_to === "reviewer" && revs.rows?.[2]?.fp === r2.j?.fp, JSON.stringify((revs.rows || []).map((r) => [r.review, r.finding, r.repeat_of, r.fee_to])));
  const ev2 = await seen("event2", "event", [e2]);
  ok(`event(${e2}) reads changed by the organizer, both tickets refunded`, ev2.status === "changed" && ev2.changed_by === "organizer" && ev2.change_review === "" && ev2.held === "0" && ev2.record?.refunded === 2, JSON.stringify({ status: ev2.status, changed_by: ev2.changed_by }));
  const mine = await seen("ticketsOfA", "tickets_of", [st.accounts.fanA, 0, 20]);
  ok("tickets_of(FAN_A) finds both tickets, refunded, with the address in any letter case", mine.total === 2 && (mine.rows || []).every((r) => r.status === "refunded"), JSON.stringify({ total: mine.total }));
  const stats = await seen("stats", "stats", []);
  ok("stats(): two events changed (one by review, one cancelled), four refunds, four reviews (one a repeat), four refused payments returned", stats.held === "0" && stats.changed === 2 && stats.changed_by_review === 1 && stats.cancelled === 1 && stats.refunded === 4 && stats.reviews === 4 && stats.material === 1 && stats.minor === 2 && stats.repeats === 1 && stats.fees === String(3n * FEE) && stats.refused_payments === 4, JSON.stringify(stats));
  const rules = await seen("rules", "rules", []);
  ok("rules() publishes the questions word for word, the comparison and the combine table", String(rules.review?.askings?.[0]).startsWith("1, blocks TERMS then PAGE: " + QUESTION_CHANGED) && String(rules.review?.askings?.[2]).startsWith("3, blocks TERMS then PAGE: " + QUESTION_HOLDS) && String(rules.review?.described).includes("a postponement") && String(rules.review?.once).includes("read afresh") && String(rules.compared).includes("exact equality") && rules.review?.combine?.material === "CHANGED yes in both orders and HOLDS no in both orders", "");
  for (const [id, who, back] of [["withdrawA", "fanA", 2n * FEE], ["withdrawB", "fanB", 2n * FEE], ["withdrawS", "stranger", FEE]]) {
    const r = await call(id, who, "withdraw", [], { watch: [who], expect: { [who]: back } });
    ok(`${who === "fanA" ? "FAN_A" : who === "fanB" ? "FAN_B" : "STRANGER"} takes its ${Number(back) / 1e18} GEN of credit back`, r.j?.withdrawn === String(back) && moved(r, who, back), `${votes(r)}  ${r.msg.slice(0, 100)}`);
  }
  ok("the contract's own balance is zero", (await balance(st.contract)) === 0n, String(await balance(st.contract)));
  st.end = {}; for (const k of Object.keys(ROLES)) st.end[k] = String(await balance(acct[k].address));
  st.ended = new Date().toISOString(); save();
  const net = (k) => BigInt(st.end[k]) - BigInt(st.start[k]);
  const want = { organizer: 3n * FEE, fanA: -FEE, fanB: -FEE, stranger: -FEE };
  ok("every account ends where the money says: ORGANIZER up 0.03 GEN, FAN_A, FAN_B and STRANGER down 0.01 GEN each", Object.keys(want).every((k) => net(k) === want[k]), Object.keys(want).map((k) => k.toUpperCase() + " " + Number(net(k)) / 1e18).join("  "));
}

st.checks = { pass, fail }; save();
console.log(`\n${pass} passed, ${fail} failed`);
console.log(`Changed: ${st.contract}  ${EXPLORER}/address/${st.contract}`);
console.log("transactions:", st.order.reduce((n, id) => n + st.steps[id].tries.length, 0), "in", st.order.length, "steps; sent a second time:", st.order.filter((id) => st.steps[id].tries.length > 1).join(", ") || "none");
for (const id of st.order) { const s = st.steps[id]; console.log(`${id.padEnd(19)} ${s.tries.map((t) => t.tx + " " + tally(t.votes) + " " + t.exec).join(" | ")}`); }
console.log("record:", RECORD);
process.exit(fail ? 1 : 0);
