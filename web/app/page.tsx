// The wall's front: the promise in one minute, how the money moves, the three ways a notice can read,
// and where to start.

import { FindingBand } from "@/components/notice-slip";
import { StubLink } from "@/components/stub-button";
import { cx } from "@/lib/cx";

const STEPS = [
  { n: "1", word: "Buy", text: "You pay exactly the ticket price. It is held by the contract, in escrow, not paid to the organizer." },
  { n: "2", word: "Notice", text: "If the show changes, the organizer has to say so. It posts a notice on its own website, below the address it named when it opened the event." },
  { n: "3", word: "Read", text: "Anyone asks GenLayer's validators to read that page. Each one fetches it itself and checks it against the date, the venue and the main act on your ticket." },
  { n: "4", word: "Pay", text: "A new date, venue or main act, or a cancellation: every refund opens. A later door time or a new support act: your ticket stands." },
];

const MONEY = [
  { what: "Your ticket price", where: "in escrow until the event or a refund" },
  { what: "A material change, or a cancellation", where: "back to you, one ticket per call, until 7 days after the start" },
  { what: "Nothing changed", where: "to the organizer, from a day after the start" },
  { what: "Changed, and never refunded", where: "to the organizer, after those 7 days" },
  { what: "A reading that finds a material change", where: "its 0.01 GEN fee stays with whoever asked" },
  { what: "Minor, unclear, or the same text again", where: "the 0.01 GEN fee goes to the organizer" },
  { what: "A holder's first unclear reading of an event", where: "free" },
];

const KINDS = [
  { finding: "minor" as const, page: "Doors open 30 minutes later", text: "A door time is a detail. The festival still happens on 14 June, at Saltmarsh Pier Arena, with The Lantern Tides. Nothing moves." },
  { finding: "material" as const, page: "Moved to 21 June 2027", text: "The date on your ticket is gone. The event becomes changed and every holder can take the price back from escrow." },
  { finding: "unclear" as const, page: "A notice worded vaguely", text: "The validators ask two questions in both orders; if their answers do not all agree, nothing changes. A clearer notice can still be read." },
];

export default function Home() {
  return (
    <div>
      <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="poster">
          <p className="band px-5 py-2 text-[16px] sm:text-[18px]">Tickets with a promise</p>
          <div className="px-5 pt-6 pb-7 sm:px-8">
            <h1 className="text-[clamp(40px,9vw,78px)] leading-[0.94] uppercase">
              If the show changes, the money <span className="text-red">comes back.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-ink-2">
              Your ticket&apos;s price waits in escrow, not in the organizer&apos;s account. When the organizer posts a notice on its own site, anyone can ask GenLayer&apos;s validators
              to read it against the date, the venue and the main act on your ticket. A new date, a new venue, a new headliner or a cancellation opens every refund. A later door
              time does not.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <StubLink href="/event">Try the demo festival</StubLink>
              <StubLink href="/how" tone="paper">
                How it works
              </StubLink>
            </div>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[440px] pt-2 pb-10" aria-hidden="true">
          <div className="stub stub-mustard rotate-[3deg]">
            <div className="min-w-0 px-4 py-4">
              <p className="kicker text-[11px]">Admit one · E4</p>
              <p className="display mt-1 text-[26px] leading-none uppercase">Harbour Lights Festival</p>
              <p className="mono mt-2 text-[13px]">14 June 2027 · Saltmarsh Pier Arena</p>
              <p className="mono text-[13px]">The Lantern Tides · 0.5 GEN</p>
            </div>
            <div className="stub-part">
              <span className="kicker text-[10.5px]">No.</span>
              <span className="display text-[32px] leading-none">117</span>
            </div>
          </div>
          <div className="slip slip-tilt-a relative -mt-6 ml-6 w-[88%] p-4">
            <p className="display text-[24px] leading-none tracking-[0.08em] uppercase">Notice</p>
            <div className="double-rule mt-2" />
            <p className="mt-3 text-[15px] font-semibold">Moved to 21 June 2027</p>
            <FindingBand finding="material" className="mt-2" />
            <p className="mono mt-2 text-[12.5px]">fingerprint c79ffa3206b27edc</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="minute-title" className="mt-16">
        <p className="kicker text-red-deep">The promise in one minute</p>
        <h2 id="minute-title" className="mt-1 text-[clamp(30px,6vw,46px)] uppercase">
          Four steps, one escrow
        </h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.n} className={cx("stub", i === 3 && "stub-red")} style={{ ["--stub-w" as string]: "64px" }}>
              <div className="min-w-0 p-4">
                <p className="display text-[26px] leading-none uppercase">{s.word}</p>
                <p className="mt-2 text-[15px] leading-snug">{s.text}</p>
              </div>
              <div className="stub-part">
                <span className="kicker text-[10px]">Step</span>
                <span className="display text-[30px] leading-none">{s.n}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="money-title" className="mt-16 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="bill p-5 sm:p-7">
          <p className="kicker text-red-deep">How the money moves</p>
          <h2 id="money-title" className="mt-1 text-[clamp(28px,5.5vw,40px)] uppercase">
            The price list
          </h2>
          <ul className="mt-5 flex flex-col gap-3 text-[15px]">
            {MONEY.map((m) => (
              <li key={m.what} className="leader flex-wrap sm:flex-nowrap">
                <span className="font-semibold">{m.what}</span>
                <span className="mono text-right text-[14px] text-ink-2">{m.where}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-[14px] text-ink-2">
            Refunds and settles pay one ticket per call, so nothing waits on a long list. A refused purchase sends back everything sent, in the same transaction. The contract holds
            exactly the prices of the valid tickets and the review credit, nothing else.
          </p>
        </div>

        <div>
          <p className="kicker text-red-deep">Three ways a notice reads</p>
          <h2 className="mt-1 text-[clamp(28px,5.5vw,40px)] uppercase">Pasted up, read once</h2>
          <ul className="mt-5 flex flex-col gap-5">
            {KINDS.map((k, i) => (
              <li key={k.finding} className={cx("slip p-4", i % 2 ? "slip-tilt-b" : "slip-tilt-a")}>
                <p className="text-[15px] font-semibold">{k.page}</p>
                <FindingBand finding={k.finding} className="mt-2" />
                <p className="mt-2 text-[14.5px] text-ink-2">{k.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="start-title" className="mt-16">
        <h2 id="start-title" className="text-[clamp(28px,5.5vw,40px)] uppercase">
          Start here
        </h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="bill flex flex-col p-5">
            <p className="display text-[22px] uppercase">Be a fan</p>
            <p className="mt-2 flex-1 text-[15px] text-ink-2">Buy a 0.5 GEN ticket to the demo festival, have the organizer announce a change, and take your money back.</p>
            <StubLink href="/event" className="mt-4">
              The demo festival
            </StubLink>
          </div>
          <div className="bill flex flex-col p-5">
            <p className="display text-[22px] uppercase">Be an organizer</p>
            <p className="mt-2 flex-1 text-[15px] text-ink-2">Open an event on your own terms, with a folder of your site for notices, and see the escrow fill and settle.</p>
            <StubLink href="/organizer" tone="ink" className="mt-4">
              The organizer&apos;s desk
            </StubLink>
          </div>
          <div className="bill flex flex-col p-5">
            <p className="display text-[22px] uppercase">Read the rules</p>
            <p className="mt-2 flex-1 text-[15px] text-ink-2">The two questions word for word, why this needs GenLayer, the limits, and the contract&apos;s own rules, read live.</p>
            <StubLink href="/how" tone="paper" className="mt-4">
              How it works
            </StubLink>
          </div>
        </div>
      </section>
    </div>
  );
}
