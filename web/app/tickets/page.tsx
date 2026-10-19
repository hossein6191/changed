"use client";

// My tickets: every ticket the connected wallet bought, newest first, as stubs: what each is waiting
// for and where its price is, with the refund or the settle that is open right now; and the review
// credit this wallet holds, to take back.

import * as React from "react";

import { Placeholder, ReadError } from "@/components/read-state";
import { StubButton, StubLink } from "@/components/stub-button";
import { TicketStub } from "@/components/ticket-stub";
import { TxStage } from "@/components/tx-stage";
import { useMe } from "@/components/use-me";
import { useNow } from "@/components/use-now";
import { useAfterTx, useRead } from "@/components/use-read";
import { useTx } from "@/components/use-tx";
import { WalletGate } from "@/components/wallet-gate";
import { calls, isMock, readCredit, readTicketsOfWindow } from "@/lib/chain";
import { gen } from "@/lib/format";
import { sendingGuide, signGuide, type Guide } from "@/lib/guide";
import { AFTER_START, REFUND_WINDOW } from "@/lib/rules";
import type { Call, Ticket } from "@/lib/types";

type Doing = { call: Call; label: string; sign: Guide; sending: Guide };

export default function TicketsPage() {
  const me = useMe();
  const now = useNow();
  const list = useRead(() => readTicketsOfWindow(me.address, 3), [me.address], { enabled: !!me.address });
  const credit = useRead(() => readCredit(me.address), [me.address], { enabled: !!me.address });
  const refreshList = list.refresh;
  const refreshCredit = credit.refresh;
  const refresh = React.useCallback(async () => {
    await refreshList();
    await refreshCredit();
  }, [refreshList, refreshCredit]);
  useAfterTx(refresh);
  const [doing, setDoing] = React.useState<Doing | null>(null);
  const tx = useTx();
  const busy = tx.sending || (!!tx.hash && !tx.final);

  const send = async (d: Doing) => {
    setDoing(d);
    await tx.start(d.call);
  };
  const act = (t: Ticket, fn: "refund" | "settle") =>
    void send({
      call: fn === "refund" ? calls.refund(t.id) : calls.settle(t.id),
      label: `${fn === "refund" ? "Refunding" : "Settling"} ${t.id}`,
      sign: signGuide({ fn, label: `${fn === "refund" ? "the refund of" : "settling"} ${t.id}`, priceAtto: t.priceAtto, mock: isMock }),
      sending: sendingGuide({ fn, label: `${fn === "refund" ? "Refunding" : "Settling"} ${t.id}`, event: t.event, role: "holder", priceAtto: t.priceAtto, mock: isMock }),
    });

  const rows = list.data?.rows ?? [];
  const open = rows.filter((t) => t.status === "valid" && t.eventStatus === "changed" && now < t.startsAt + REFUND_WINDOW);
  const waiting = rows.filter((t) => t.status === "valid" && !open.includes(t));
  const closed = rows.filter((t) => t.status !== "valid");
  const held = credit.data ? BigInt(credit.data.creditAtto) : 0n;

  const actionFor = (t: Ticket) => {
    if (t.status !== "valid" || now <= 0) return undefined;
    if (t.eventStatus === "changed" && now < t.startsAt + REFUND_WINDOW)
      return (
        <StubButton size="sm" disabled={busy} onClick={() => act(t, "refund")}>
          Refund {t.id} · {gen(t.priceAtto)}
        </StubButton>
      );
    if ((t.eventStatus === "on" && now >= t.startsAt + AFTER_START) || (t.eventStatus === "changed" && now >= t.startsAt + REFUND_WINDOW))
      return (
        <StubButton size="sm" tone="ink" disabled={busy} onClick={() => act(t, "settle")}>
          Settle {t.id} to the organizer
        </StubButton>
      );
    return undefined;
  };

  return (
    <div>
      <header className="mb-7 max-w-3xl">
        <p className="kicker text-red-deep">My tickets</p>
        <h1 className="mt-1 text-[clamp(34px,7vw,56px)] uppercase">Every stub in your pocket</h1>
        <p className="mt-3 text-[16.5px] text-ink-2">Each price sits in escrow until its event or a refund. A refund or a settle pays one ticket per call.</p>
      </header>
      <WalletGate what="to see your tickets">
        {doing && <TxStage className="mb-6 max-w-2xl" tx={tx} sign={doing.sign} sending={doing.sending} label={doing.label} />}
        {list.loading && <Placeholder lines={4} />}
        {list.error && <ReadError detail={list.error} onRetry={list.retry} />}
        {list.data && rows.length === 0 && (
          <div className="bill max-w-2xl p-5">
            <p className="display text-[24px] uppercase">No tickets yet</p>
            <p className="mt-2 text-ink-2">Buy one to the demo festival: 0.5 GEN, held in escrow until the show or a refund.</p>
            <StubLink href="/event" className="mt-4">
              The demo festival
            </StubLink>
          </div>
        )}
        {[
          { title: "Refunds open", list: open, note: "A material change was found or the organizer cancelled: take each price back." },
          { title: "Waiting for the show", list: waiting, note: "Held in escrow. Nothing is needed unless the organizer posts a change." },
          { title: "Paid out", list: closed, note: "Refunded to you or settled to the organizer." },
        ]
          .filter((g) => g.list.length > 0)
          .map((g) => (
            <section key={g.title} className="mb-10" aria-label={g.title}>
              <h2 className="text-[26px] uppercase">
                {g.title} <span className="mono text-[16px] text-ink-3">({g.list.length})</span>
              </h2>
              <p className="mt-1 text-ink-2">{g.note}</p>
              <ul className="mt-4 grid gap-4 md:grid-cols-2">
                {g.list.map((t) => (
                  <li key={t.id}>
                    <TicketStub ticket={t} now={now} action={actionFor(t)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        {list.data?.partial && <p className="text-sm text-ink-3">Only your newest {rows.length} tickets are shown.</p>}

        <section className="bill mt-6 max-w-2xl p-5" aria-labelledby="credit-title">
          <h2 id="credit-title" className="text-[24px] uppercase">
            Review credit
          </h2>
          {credit.error ? (
            <ReadError className="mt-3" detail={credit.error} onRetry={credit.retry} />
          ) : (
            <>
              <p className="mt-2 text-ink-2">
                {credit.data ? (
                  <>
                    You hold <strong className="mono text-ink">{gen(held)}</strong>, enough for {credit.data.reviews} {credit.data.reviews === 1 ? "reading" : "readings"}. It is held by the
                    contract and yours to take back at any time; credit is added on an event&apos;s page.
                  </>
                ) : (
                  "Reading your credit…"
                )}
              </p>
              {held > 0n && (
                <StubButton
                  className="mt-3"
                  size="sm"
                  tone="paper"
                  disabled={busy}
                  onClick={() =>
                    void send({
                      call: calls.withdraw(),
                      label: `Taking ${gen(held)} of credit back`,
                      sign: signGuide({ fn: "withdraw", label: `taking all ${gen(held)} of your review credit back`, valueAtto: held.toString(), mock: isMock }),
                      sending: sendingGuide({ fn: "withdraw", label: "Taking your credit back", event: "your credit", role: "holder", valueAtto: held.toString(), mock: isMock }),
                    })
                  }
                >
                  Take all {gen(held)} back
                </StubButton>
              )}
            </>
          )}
        </section>
      </WalletGate>
    </div>
  );
}
