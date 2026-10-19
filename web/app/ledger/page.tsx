"use client";

// The ledger: the contract's books in one board (escrow, refunds, settles, credit, fees, the readings
// by finding) with the sums that must hold, and every event, newest first, as a row of the wall.

import * as React from "react";
import Link from "next/link";

import { Placeholder, ReadError } from "@/components/read-state";
import { useNow } from "@/components/use-now";
import { useAfterTx, useRead } from "@/components/use-read";
import { statusWord } from "@/components/poster";
import { readEventsWindow, readStats } from "@/lib/chain";
import { cx } from "@/lib/cx";
import { gen, relative } from "@/lib/format";

export default function LedgerPage() {
  const now = useNow();
  const stats = useRead(() => readStats(), []);
  const events = useRead(() => readEventsWindow(3), []);
  const refreshStats = stats.refresh;
  const refreshEvents = events.refresh;
  const refresh = React.useCallback(async () => {
    await refreshStats();
    await refreshEvents();
  }, [refreshStats, refreshEvents]);
  useAfterTx(refresh);
  const s = stats.data;
  const sumHeld = s ? BigInt(s.salesAtto) - BigInt(s.refundedAtto) - BigInt(s.toOrganizersAtto) : 0n;
  const sumCredit = s ? BigInt(s.depositedAtto) - BigInt(s.creditOutAtto) - BigInt(s.feesAtto) : 0n;
  return (
    <div>
      <header className="mb-7 max-w-3xl">
        <p className="kicker text-red-deep">The ledger</p>
        <h1 className="mt-1 text-[clamp(34px,7vw,56px)] uppercase">The box office books</h1>
        <p className="mt-3 text-[16.5px] text-ink-2">Read straight from the contract. The contract holds exactly the prices of the valid tickets and the review credit, nothing else.</p>
      </header>

      {stats.loading && <Placeholder lines={4} />}
      {stats.error && <ReadError detail={stats.error} onRetry={stats.retry} />}
      {s && (
        <section className="grid gap-6 lg:grid-cols-2" aria-label="The books">
          <div className="bill p-5">
            <h2 className="text-[24px] uppercase">Ticket money</h2>
            <ul className="mt-4 flex flex-col gap-2.5 text-[15px]">
              <Row label="Sold, in all">{gen(s.salesAtto)}</Row>
              <Row label="Back to holders">− {gen(s.refundedAtto)}</Row>
              <Row label="Settled to organizers">− {gen(s.toOrganizersAtto)}</Row>
              <Row label="In escrow now" strong>
                {gen(s.heldAtto)}
              </Row>
            </ul>
            <p className={cx("mono mt-3 text-[13px]", sumHeld === BigInt(s.heldAtto) ? "text-ink-3" : "text-red-deep")}>
              {sumHeld === BigInt(s.heldAtto) ? "sold − refunded − settled = in escrow ✓" : "the sums do not match"}
            </p>
          </div>
          <div className="bill p-5">
            <h2 className="text-[24px] uppercase">Review credit</h2>
            <ul className="mt-4 flex flex-col gap-2.5 text-[15px]">
              <Row label="Deposited">{gen(s.depositedAtto)}</Row>
              <Row label="Taken back">− {gen(s.creditOutAtto)}</Row>
              <Row label="Fees paid to organizers">− {gen(s.feesAtto)}</Row>
              <Row label="Credit held now" strong>
                {gen(s.creditAtto)}
              </Row>
            </ul>
            <p className={cx("mono mt-3 text-[13px]", sumCredit === BigInt(s.creditAtto) ? "text-ink-3" : "text-red-deep")}>
              {sumCredit === BigInt(s.creditAtto) ? "deposited − taken back − fees = held ✓" : "the sums do not match"}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-2">
            {[
              ["Events", s.events],
              ["Tickets", s.tickets],
              ["Changed by a reading", s.changedByReview],
              ["Cancelled", s.cancelled],
              ["Material", s.material],
              ["Minor", s.minor],
              ["Unclear", s.unclear],
              ["Repeats", s.repeats],
              ["Refunded tickets", s.refunded],
              ["Settled tickets", s.settled],
              ["Refused payments", s.refusedPayments],
              ["Sent straight back", gen(s.returnedAtto)],
            ].map(([label, value]) => (
              <div key={String(label)} className="min-w-0 border-2 border-ink bg-sheet px-3 py-2.5">
                <p className="kicker text-[10.5px] text-ink-3">{label}</p>
                <p className="display text-[22px] leading-tight break-words">{value}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="events-title" className="mt-12">
        <h2 id="events-title" className="text-[clamp(28px,5.5vw,40px)] uppercase">
          Every event
        </h2>
        {events.loading && <Placeholder className="mt-4" lines={4} />}
        {events.error && <ReadError className="mt-4" detail={events.error} onRetry={events.retry} />}
        {events.data && events.data.rows.length === 0 && <p className="mt-4 border-2 border-dashed border-ink px-4 py-3 text-ink-2">No event has been opened on this contract yet.</p>}
        <ul className="mt-5 flex flex-col gap-3">
          {(events.data?.rows ?? []).map((e) => (
            <li key={e.id}>
              <Link href={`/event/${e.id}`} className={cx("stub no-underline hover:bg-mustard-wash", e.status === "changed" && "stub-red hover:bg-red")}>
                <div className="grid min-w-0 gap-x-6 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                  <div className="min-w-0">
                    <p className="kicker text-[11px] opacity-80">{statusWord(e)}</p>
                    <p className="display text-[21px] leading-tight break-words uppercase">{e.name}</p>
                    <p className="mono text-[13px]">
                      {e.date} · {e.venue} · {e.mainAct}
                    </p>
                  </div>
                  <div className="mono text-[13px] sm:text-right">
                    <p>
                      {e.sold}/{e.capacity} sold · {gen(e.heldAtto)} in escrow
                    </p>
                    <p>
                      {e.record.reviews} readings: {e.record.material} material, {e.record.minor} minor, {e.record.unclear} unclear, {e.record.repeats} repeats
                    </p>
                    {now > 0 && <p>starts {relative(e.startsAt, now)}</p>}
                  </div>
                </div>
                <div className="stub-part">
                  <span className="display text-[24px] leading-none">{e.id}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        {events.data?.partial && <p className="mt-3 text-sm text-ink-3">The oldest events are left out; the newest {events.data.rows.length} are shown.</p>}
      </section>
    </div>
  );
}

function Row({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <li className="leader">
      <span className={strong ? "font-bold" : ""}>{label}</span>
      <span className={cx("mono", strong && "font-bold")}>{children}</span>
    </li>
  );
}
