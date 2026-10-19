// Opens the demo festival from its key: the Harbour Lights Festival (lib/demo-event.ts) on sale for six
// hours, its site prefix the notices/ folder of the public repository pinned to one commit on
// raw.githubusercontent.com, and tops the key's review credit up for the notice buttons. Run it by hand
// after the contract is deployed and the repository is pushed; nothing in the build runs it. Later
// demo festivals open from the site itself (POST /api/demo/reopen).
//
//   REGISTER=0x... DEMO_ORGANIZER_KEY=0x... COMMIT=<40 hex> node tools/open-demo-event.mjs
//   DRY=1 REGISTER=0x... COMMIT=<40 hex> node tools/open-demo-event.mjs      # print the calls, send nothing
//   REPO=<owner>/<name> ...                                                   # when the git remote does not name it
//
// The key is a throwaway Studio test key, the same one the site's server holds in DEMO_ORGANIZER_KEY; it
// is read from the environment only and never printed. Before anything is sent, every notice is fetched
// from the pinned folder and compared with notices/ in this checkout, so a wrong commit is caught
// before anyone relies on it (NOTICES_COMMIT in lib/config.ts takes the same commit). If this key's
// newest demo festival is still on sale, nothing is opened. Each transaction is followed to a final
// status. Needs Node 22.18 or later (it reads lib/*.ts directly).

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { getAddress } from "viem";

import { REPO_URL } from "../lib/config.ts";
import { cleanKey, keyProblem } from "../lib/demo-key.ts";
import {
  DEMO_CAPACITY,
  DEMO_CREDIT_LOW,
  DEMO_CREDIT_TOP_UP,
  DEMO_EVENT_NAME,
  DEMO_LEAD,
  DEMO_PRICE,
  DEMO_TERMS_JSON,
  NOTICES,
  baseProblem,
  demoStateOf,
  noticesBase,
  repoOf,
} from "../lib/demo-event.ts";
import { capacityProblem, nameProblem, priceProblem, termsProblem } from "../lib/rules.ts";

const RPC = "https://studio.genlayer.com/api";
const EXPLORER = "https://explorer-studio.genlayer.com";
const studio = { ...studionet, rpcUrls: { ...studionet.rpcUrls, default: { http: [RPC] } } };

const REGISTER = (process.env.REGISTER || "").trim();
const COMMIT = (process.env.COMMIT || "").trim();
const DRY = process.env.DRY === "1";
function remoteRepo() {
  try {
    const origin = execSync("git remote get-url origin", { cwd: new URL("..", import.meta.url), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return (origin.match(/github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/) || [])[1] || "";
  } catch {
    return "";
  }
}
const REPO = (process.env.REPO || repoOf(REPO_URL) || remoteRepo()).trim();

const fail = (message) => {
  console.error(message);
  process.exit(2);
};
if (!/^0x[0-9a-fA-F]{40}$/.test(REGISTER)) fail("REGISTER must be the deployed contract's 0x address.");
if (!/^[0-9a-f]{40}$/.test(COMMIT)) fail("COMMIT must be the 40-character commit the notices were pushed in.");
if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(REPO)) fail("REPO must be <owner>/<name> on GitHub (or set the git remote origin, or NEXT_PUBLIC_REPO_URL).");
const problem = keyProblem(process.env.DEMO_ORGANIZER_KEY);
if (!DRY && problem) fail(`DEMO_ORGANIZER_KEY: ${problem}.`);
const PREFIX = noticesBase(REPO, COMMIT);
const why = baseProblem(PREFIX) || nameProblem(DEMO_EVENT_NAME) || termsProblem(DEMO_TERMS_JSON).problem || priceProblem(DEMO_PRICE) || capacityProblem(BigInt(DEMO_CAPACITY));
if (why) fail(`The demo festival would be refused: ${why}.`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the notices the validators will read must be at that commit -----------------------------------
if (!DRY) {
  for (const n of NOTICES) {
    const here = readFileSync(new URL(`../../notices/${n.file}`, import.meta.url), "utf8");
    let there = "";
    try {
      const r = await fetch(PREFIX + n.file);
      there = r.ok ? await r.text() : "";
    } catch {
      there = "";
    }
    if (there !== here) fail(`${PREFIX + n.file}\ndoes not serve notices/${n.file} as it is in this checkout. Push the repository and pass that commit as COMMIT.`);
  }
  console.log(`the ${NOTICES.length} notices are at ${PREFIX}; set NOTICES_COMMIT = "${COMMIT}" in lib/config.ts`);
}

const start = () => Math.floor(Date.now() / 1000) + DEMO_LEAD;
const openArgs = () => [DEMO_EVENT_NAME, DEMO_TERMS_JSON, PREFIX, DEMO_PRICE.toString(), DEMO_CAPACITY, start()];
console.log(`${DRY ? "DRY RUN: " : ""}${DEMO_EVENT_NAME} to ${REGISTER}`);
if (DRY) {
  console.log(`open_event(${openArgs().map((a) => JSON.stringify(a)).join(", ")})`);
  console.log(`deposit() with ${DEMO_CREDIT_TOP_UP} atto, when the key holds less than ${DEMO_CREDIT_LOW} atto of review credit`);
  process.exit(0);
}

async function rpc(method, params) {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const body = await res.json();
      if (body.error) {
        await sleep(res.status === 429 || body.error.code === -32029 ? 20_000 : 5000);
        continue;
      }
      return body.result;
    } catch {
      await sleep(4000);
    }
  }
  throw new Error(`${method} did not answer`);
}

/** Follows a transaction to a final status; returns the contract's JSON return and the vote tally. */
async function follow(hash) {
  for (let i = 0; i < 300; i++) {
    await sleep(4000);
    const tx = await rpc("eth_getTransactionByHash", [hash]);
    const status = String(tx?.status ?? "");
    if (status === "FINALIZED" || status === "CANCELED" || status === "UNDETERMINED") {
      const lr = tx.consensus_data?.leader_receipt;
      const one = Array.isArray(lr) ? lr[0] : lr;
      let text = "";
      try {
        text = Buffer.from(one?.result ?? "", "base64").toString("utf8");
      } catch {
        text = "";
      }
      const at = text.indexOf("{");
      let json = null;
      try {
        json = at >= 0 ? JSON.parse(text.slice(at, text.lastIndexOf("}") + 1)) : null;
      } catch {
        json = null;
      }
      const votes = Object.values(tx.consensus_data?.votes ?? {});
      return { status, json, agree: votes.filter((v) => v === "agree").length, of: votes.length, exec: one?.execution_result ?? "", text };
    }
  }
  return { status: "TIMEOUT", json: null, agree: 0, of: 0, exec: "", text: "" };
}

async function read(client, functionName, fnArgs) {
  for (let i = 0; i < 8; i++) {
    try {
      const raw = await client.readContract({ address: REGISTER, functionName, args: fnArgs });
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      await sleep(5000);
    }
  }
  throw new Error(`could not read ${functionName}() from Studio`);
}

async function send(client, functionName, args, value = 0n) {
  for (let tries = 1; ; tries++) {
    try {
      const hash = await client.writeContract({ address: REGISTER, functionName, args, value });
      return { ...(await follow(hash)), hash };
    } catch (e) {
      if (tries >= 3) fail(`${functionName} not sent (${String(e?.shortMessage || e?.message || e).slice(0, 80)})`);
      await sleep(15_000);
    }
  }
}

const account = createAccount(cleanKey(process.env.DEMO_ORGANIZER_KEY));
const organizer = account.address.toLowerCase();
console.log(`demo organizer ${account.address}`);
const client = createClient({ chain: studio, account });

// The key signs from its own balance; Studio's faucet tops it up when it holds less than a GEN.
const have = BigInt((await rpc("eth_getBalance", [account.address, "latest"])) || "0x0");
if (have < 10n ** 18n) {
  await rpc("sim_fundAccount", { account_address: getAddress(account.address), amount: 20e18 });
  for (let i = 0; i < 20 && BigInt((await rpc("eth_getBalance", [account.address, "latest"])) || "0x0") <= have; i++) await sleep(3000);
}

const first = await read(client, "events_of", [organizer, 0, 20]);
const page = first.total > 20 ? await read(client, "events_of", [organizer, first.total - 20, 20]) : first;
const newest = (page.rows ?? []).filter((r) => r.name === DEMO_EVENT_NAME).sort((a, b) => Number(b.event.slice(1)) - Number(a.event.slice(1)))[0];
const state = demoStateOf(newest ? { id: newest.event, status: newest.status, startsAt: newest.starts_at, sold: newest.sold, capacity: newest.capacity } : null, Math.floor(Date.now() / 1000));
if (state === "open") {
  console.log(`SKIP  open_event: ${newest.event} is still on sale. The site's server finds it by the key's address.`);
} else {
  const r = await send(client, "open_event", openArgs());
  const id = r.json?.ok === true ? r.json.event : "";
  console.log(`${id ? "OK  " : "FAIL"}  open_event: ${id || r.status + " " + r.exec + " " + r.text.slice(0, 160)}  ${r.agree}/${r.of} agree  ${EXPLORER}/tx/${r.hash}`);
  if (!id) process.exit(1);
}

const credit = await read(client, "credit", [organizer]);
if (BigInt(credit.credit ?? "0") < DEMO_CREDIT_LOW) {
  const r = await send(client, "deposit", [], DEMO_CREDIT_TOP_UP);
  console.log(`${r.json?.ok ? "OK  " : "FAIL"}  deposit: review credit ${r.json?.credit ?? "?"} atto  ${EXPLORER}/tx/${r.hash}`);
} else console.log(`SKIP  deposit: the key holds ${credit.credit} atto of review credit`);
console.log("\nSet DEMO_ORGANIZER_KEY on the host and check GET /api/demo/status.");
