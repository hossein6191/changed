"use client";

// Reading a page yourself: any page below the event's site prefix, paid from your own review credit.
// The credit box (what you hold, a deposit with one-click amounts, take it all back) and the address
// field with a chip for every page in the demo notices folder, each tagged with what it should read
// as. The form checks the address the way the contract will, before anything is signed.

import * as React from "react";

import { Suggest } from "@/components/suggest";
import { StubButton } from "@/components/stub-button";
import { WalletGate } from "@/components/wallet-gate";
import { cx } from "@/lib/cx";
import { gen, genText, tryAtto } from "@/lib/format";
import { REVIEW_FEE, plain, reviewUrlProblem, sentence } from "@/lib/rules";
import { DEPOSIT_CHIPS, noticeChips } from "@/lib/suggestions";
import type { Credit, EventRow } from "@/lib/types";

export function ReviewDesk({
  event: e,
  credit,
  creditError,
  open,
  busy,
  onReview,
  onDeposit,
  onWithdraw,
}: {
  event: EventRow;
  credit: Credit | null;
  creditError: string;
  /** the event still reads notices */
  open: boolean;
  busy: boolean;
  onReview: (url: string) => void;
  onDeposit: (atto: bigint) => void;
  onWithdraw: (atto: bigint) => void;
}) {
  const [url, setUrl] = React.useState(e.sitePrefix);
  const [amount, setAmount] = React.useState(genText(5n * REVIEW_FEE));
  const chips = noticeChips(e.sitePrefix, { date: e.date, venue: e.venue, main_act: e.mainAct });
  const address = plain(url);
  const urlProblem = address === e.sitePrefix ? "" : reviewUrlProblem(address, e.sitePrefix, e.id);
  const held = credit ? BigInt(credit.creditAtto) : 0n;
  const enough = held >= REVIEW_FEE;
  const value = tryAtto(amount);

  return (
    <section aria-labelledby="read-title" className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <div className="bill p-4 sm:p-6">
        <p className="kicker text-red-deep">Your own reading</p>
        <h2 id="read-title" className="mt-1 text-[clamp(26px,5.5vw,36px)] uppercase">
          Ask the network to read a page
        </h2>
        <p className="mt-2 text-[15px] text-ink-2">
          Any page below <span className="mono break-all text-ink">{e.sitePrefix}</span>. It takes {gen(REVIEW_FEE)} of your review credit: the fee stays yours when the page shows a material
          change, and on your first unclear reading of an event while you hold a ticket; otherwise it goes to the organizer. A page that cannot be read takes nothing.
        </p>
        <form
          className="mt-4"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (!urlProblem && address !== e.sitePrefix) onReview(address);
          }}
        >
          <label htmlFor="review-url" className="label">
            Page address
          </label>
          <input
            id="review-url"
            className="field mono text-[14px]"
            value={url}
            onChange={(ev) => setUrl(ev.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            inputMode="url"
            aria-invalid={!!urlProblem}
            aria-describedby="review-url-help"
          />
          <Suggest label="Pages in the notices folder" chips={chips} onPick={setUrl} isOn={(v) => v === url} />
          <p id="review-url-help" className={cx("mt-2 text-[13.5px]", urlProblem ? "text-red-deep" : "text-ink-3")}>
            {urlProblem ? sentence(urlProblem) : address === e.sitePrefix ? "Pick a page with a chip, or finish the address." : "The address is one the contract will read."}
          </p>
          <div className="mt-4">
            <WalletGate what="to ask for a reading">
              {!open ? (
                <p className="text-sm text-ink-2">This event no longer reads notices: it changed, or a day has passed since its start.</p>
              ) : !enough ? (
                <p className="text-sm text-ink-2">A reading takes {gen(REVIEW_FEE)} of credit and you hold {gen(held)}. Add credit in the box beside this one first.</p>
              ) : (
                <StubButton type="submit" tone="red" disabled={busy || !!urlProblem || address === e.sitePrefix}>
                  Read this page · {gen(REVIEW_FEE)}
                </StubButton>
              )}
            </WalletGate>
          </div>
        </form>
      </div>

      <div className="stub self-start" style={{ ["--stub-w" as string]: "84px" }}>
        <div className="min-w-0 p-4">
          <p className="kicker text-ink-3">Review credit</p>
          <p className="display mt-1 text-[30px] leading-none">{credit ? gen(credit.creditAtto) : creditError ? "?" : "…"}</p>
          <p className="mt-1 text-[13.5px] text-ink-2">
            {credit ? `Pays for ${credit.reviews} ${credit.reviews === 1 ? "reading" : "readings"}. It is held by the contract and yours to take back at any time.` : creditError || "Reading your credit…"}
          </p>
          <form
            className="mt-3"
            onSubmit={(ev) => {
              ev.preventDefault();
              if (value && value > 0n) onDeposit(value);
            }}
          >
            <label htmlFor="deposit" className="label">
              Add credit, in GEN
            </label>
            <input id="deposit" className="field mono" value={amount} onChange={(ev) => setAmount(ev.target.value)} inputMode="decimal" aria-invalid={!value || value <= 0n} />
            <Suggest label="Credit amounts" chips={DEPOSIT_CHIPS} onPick={(v) => setAmount(genText(v))} isOn={(v) => value === v} />
            <div className="mt-3 flex flex-wrap gap-2">
              <WalletGate need={value && value > 0n ? value : 0n} what="to add credit">
                <StubButton type="submit" size="sm" tone="ink" disabled={busy || !value || value <= 0n}>
                  Add {value && value > 0n ? gen(value) : "credit"}
                </StubButton>
                {held > 0n && (
                  <StubButton size="sm" tone="paper" disabled={busy} onClick={() => onWithdraw(held)}>
                    Take all {gen(held)} back
                  </StubButton>
                )}
              </WalletGate>
            </div>
          </form>
        </div>
        <div className="stub-part">
          <span className="kicker text-[10.5px]">Fee</span>
          <span className="display text-[20px] leading-none">0.01</span>
          <span className="mono text-[11px]">GEN</span>
        </div>
      </div>
    </section>
  );
}
