"use client";

// How it works: the two questions word for word, as the contract asks them; how the four answers make
// one finding; why the job needs GenLayer; where every atto goes; the limits, stated plainly; and the
// contract's own rules(), read live.

import * as React from "react";

import { FindingBand } from "@/components/notice-slip";
import { Placeholder, ReadError } from "@/components/read-state";
import { useRead } from "@/components/use-read";
import { readRules } from "@/lib/chain";
import { gen } from "@/lib/format";
import { DESCRIBED, MAX_PAGE_TEXT, MEANING_CHANGED, MEANING_HOLDS, QUESTION_CHANGED, QUESTION_HOLDS, READING, REVIEW_FEE } from "@/lib/rules";

const ASKINGS = [
  { n: 1, order: "TERMS, then PAGE", q: "CHANGED" },
  { n: 2, order: "PAGE, then TERMS", q: "CHANGED" },
  { n: 3, order: "TERMS, then PAGE", q: "HOLDS" },
  { n: 4, order: "PAGE, then TERMS", q: "HOLDS" },
];

const MONEY = [
  ["buy", "You pay exactly the price; it is held by the contract in escrow. A refused purchase (wrong amount, sold out, started, changed, or you are the organizer) returns everything sent in the same transaction."],
  ["review", `${gen(REVIEW_FEE)} of the asker's review credit. Material: it stays with the asker. Minor, a repeat, or unclear: it goes to the organizer, except a holder's first unclear reading of an event, which is free. A page that cannot be read takes nothing.`],
  ["refund", "Once a reading finds a material change or the organizer cancels: the holder takes the ticket's price back, one ticket per call, until seven days after the start."],
  ["settle", "Anyone, one ticket per call: a day after the start when the event never changed, or seven days after the start for a changed event's ticket nobody refunded. The price goes to the organizer."],
  ["cancel", "The organizer, before the start: the event becomes changed and every refund opens. Nothing is paid by the cancel itself."],
  ["deposit / withdraw", "Review credit in, and all of it back out, at any time. The contract holds exactly the valid tickets' prices and the credit."],
];

const LIMITS = [
  "The organizer controls its own site: a change it never publishes under its prefix is not caught, and the contract reads what the organizer says, not what happens on the night.",
  "Only pages below the organizer's prefix are read; that is what makes the page the organizer's own words.",
  "A page must read the same for every validator at that moment. Static pages settle; pages that change per visit or sit behind a login store nothing.",
  "Text is read; images and scripts are not. A notice that is only a poster image is not judged.",
  `The first ${MAX_PAGE_TEXT.toLocaleString("en-GB")} characters of the page are judged: a notice should say what changed near the top.`,
  "Only a 2xx answer is a notice. A redirect, a rate limit or an error stores nothing and takes no fee.",
  "Each text is read once per event: asking about the same text again, under any address, costs the fee and changes nothing. A page edited since is read afresh.",
  "Seconds are the chain's. Somebody has to send each refund or settle; nothing moves on its own.",
  "Texts are printable ASCII on one line; names 3 to 80 characters, terms 3 to 120, details up to 300; prices 0.05 to 50 GEN; 1 to 500 tickets; a start from an hour to 400 days ahead.",
];

export default function HowPage() {
  const rules = useRead(() => readRules(), []);
  return (
    <div className="max-w-[980px]">
      <header className="mb-8">
        <p className="kicker text-red-deep">How it works</p>
        <h1 className="mt-1 text-[clamp(34px,7vw,56px)] uppercase">The fine print, in large type</h1>
        <p className="mt-3 text-[16.5px] text-ink-2">
          Every validator fetches the organizer&apos;s page itself, removes its tags, collapses its spacing, fingerprints the text and asks its own model two questions about it, each in
          both orders. The contract stores one value, the finding and the fingerprint, only if every validator&apos;s value is the same, exactly.
        </p>
      </header>

      <section aria-labelledby="q-title" className="bill p-5 sm:p-7">
        <h2 id="q-title" className="text-[clamp(26px,5vw,34px)] uppercase">
          The two questions, word for word
        </h2>
        <p className="mt-3 kicker text-ink-3">What &ldquo;as described&rdquo; means</p>
        <blockquote className="mt-1 border-l-[5px] border-red pl-4 text-[16px]">{DESCRIBED}</blockquote>
        <p className="mt-5 kicker text-ink-3">CHANGED</p>
        <blockquote className="mt-1 border-l-[5px] border-ink pl-4 text-[16px]">
          <p className="font-semibold">{QUESTION_CHANGED}</p>
          <p className="mt-1 text-ink-2">{MEANING_CHANGED}</p>
        </blockquote>
        <p className="mt-5 kicker text-ink-3">HOLDS, its exact negation</p>
        <blockquote className="mt-1 border-l-[5px] border-ink pl-4 text-[16px]">
          <p className="font-semibold">{QUESTION_HOLDS}</p>
          <p className="mt-1 text-ink-2">{MEANING_HOLDS}</p>
        </blockquote>
        <p className="mt-5 kicker text-ink-3">How the page is read</p>
        <blockquote className="mt-1 border-l-[5px] border-mustard pl-4 text-[15px] text-ink-2">{READING}</blockquote>
        <p className="mt-4 text-[14.5px] text-ink-2">
          Both blocks are fenced (every &lt; and &gt; replaced, never deleted), set between delimiter lines tagged with the start of their own sha256, and declared untrusted before they
          appear: anything in the terms or the page that talks to the model counts for nothing.
        </p>
      </section>

      <section aria-labelledby="combine-title" className="mt-10">
        <h2 id="combine-title" className="text-[clamp(26px,5vw,34px)] uppercase">
          Four askings, one finding
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] border-2 border-ink bg-sheet text-left text-[15px]">
            <thead className="bg-ink text-sheet">
              <tr>
                <th className="px-3 py-2 font-semibold">Asking</th>
                <th className="px-3 py-2 font-semibold">Blocks</th>
                <th className="px-3 py-2 font-semibold">Question</th>
                <th className="px-3 py-2 font-semibold">Material needs</th>
                <th className="px-3 py-2 font-semibold">Minor needs</th>
              </tr>
            </thead>
            <tbody>
              {ASKINGS.map((a) => (
                <tr key={a.n} className="border-t-[1.5px] border-dashed border-ink">
                  <td className="mono px-3 py-2">{a.n}</td>
                  <td className="px-3 py-2">{a.order}</td>
                  <td className="mono px-3 py-2">{a.q}</td>
                  <td className="mono px-3 py-2">{a.q === "CHANGED" ? "yes" : "no"}</td>
                  <td className="mono px-3 py-2">{a.q === "CHANGED" ? "no" : "yes"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div>
            <FindingBand finding="material" />
            <p className="mt-2 text-[14.5px] text-ink-2">All four answers point the same way: the event will not take place as described. Every refund opens.</p>
          </div>
          <div>
            <FindingBand finding="minor" />
            <p className="mt-2 text-[14.5px] text-ink-2">All four answers say it still takes place as described. Nothing changes.</p>
          </div>
          <div>
            <FindingBand finding="unclear" />
            <p className="mt-2 text-[14.5px] text-ink-2">Anything else: a split between orders or between framings is never a tolerance. Nothing changes.</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="why-title" className="mt-12 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="poster poster-flat p-5 sm:p-6">
          <h2 id="why-title" className="text-[clamp(26px,5vw,34px)] uppercase">
            Why it needs GenLayer
          </h2>
          <ul className="mt-3 flex flex-col gap-3 text-[15.5px]">
            <li>
              <strong>The evidence is on the live web.</strong> The organizer already publishes the change on its own site. Every validator fetches that page itself, so nobody relays
              it, summarises it or chooses what the contract sees.
            </li>
            <li>
              <strong>The judgment is about words.</strong> Is a later door time a change? Is &ldquo;postponed&rdquo; a new date? No price feed or flag answers that; a model reading
              the notice against the terms does, and the contract pins the questions.
            </li>
            <li>
              <strong>Agreement, not trust.</strong> One value (the finding and the page&apos;s fingerprint) is stored only when the validators reach exactly the same one, so a page that
              reads differently for different nodes, or a model that wavers, changes nothing.
            </li>
            <li>
              <strong>The money is already there.</strong> The prices wait in escrow in the same contract, so a material finding opens the refunds in the same transaction, without
              asking the organizer.
            </li>
          </ul>
        </div>
        <div className="bill p-5 sm:p-6">
          <h2 className="text-[clamp(26px,5vw,34px)] uppercase">Where the money goes</h2>
          <dl className="mt-3 flex flex-col gap-3 text-[15px]">
            {MONEY.map(([k, v]) => (
              <div key={k}>
                <dt className="mono font-bold">{k}</dt>
                <dd className="text-ink-2">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section aria-labelledby="limits-title" className="mt-12">
        <h2 id="limits-title" className="text-[clamp(26px,5vw,34px)] uppercase">
          The limits, stated plainly
        </h2>
        <ul className="mt-4 flex flex-col gap-2.5 text-[15.5px]">
          {LIMITS.map((l) => (
            <li key={l} className="border-l-[5px] border-ink bg-sheet px-3 py-2">
              {l}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="rules-title" className="mt-12">
        <h2 id="rules-title" className="text-[clamp(26px,5vw,34px)] uppercase">
          The contract&apos;s own rules, read live
        </h2>
        <p className="mt-1 text-ink-2">
          This is <span className="mono">rules()</span>, a view of the deployed contract, printed as it answers.
        </p>
        {rules.loading && <Placeholder className="mt-4" lines={6} />}
        {rules.error && <ReadError className="mt-4" detail={rules.error} onRetry={rules.retry} />}
        {rules.data && (
          <div className="bill mt-4 p-4 sm:p-5">
            <Tree value={rules.data} />
          </div>
        )}
      </section>
    </div>
  );
}

/** A JSON value as nested definition lists: keys in the typewriter face, strings as text. */
function Tree({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (Array.isArray(value))
    return value.every((v) => typeof v !== "object") && value.length <= 2 && value.every((v) => String(v).length < 24) ? (
      <span className="mono">{value.map(String).join(" to ")}</span>
    ) : (
      <ul className="flex list-disc flex-col gap-1 pl-5">
        {value.map((v, i) => (
          <li key={i}>
            <Tree value={v} depth={depth + 1} />
          </li>
        ))}
      </ul>
    );
  if (value && typeof value === "object")
    return (
      <dl className={depth ? "mt-1 flex flex-col gap-1.5 border-l-2 border-dotted border-ink-3 pl-3" : "flex flex-col gap-2.5"}>
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="mono text-[13.5px] font-bold">{k}</dt>
            <dd className="min-w-0 text-[14.5px] break-words text-ink-2">
              <Tree value={v} depth={depth + 1} />
            </dd>
          </div>
        ))}
      </dl>
    );
  return <span>{String(value)}</span>;
}
