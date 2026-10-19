"use client";

// One event's wall: the poster; one waiting bill that says what is happening, how long, what is needed
// from you, whether you can leave and where the money is, with the button that is open right now; your
// tickets as stubs with their refund or settle; on the demo festival, what the organizer announces
// next; a form to have any page below the prefix read with your own credit; every reading pasted up as
// a NOTICE slip with its fingerprint; and, for the organizer or once the settle window is open, the
// tickets that can be settled. Every transaction shows its explorer link from the first second.

import * as React from "react";
import Link from "next/link";

import { NoticeBoard } from "@/components/notice-board";
import { NoticeSlip } from "@/components/notice-slip";
import { EventPoster } from "@/components/poster";
import { Placeholder, ReadError, readEach } from "@/components/read-state";
import { ReviewDesk } from "@/components/review-desk";
import { StubButton, StubLink } from "@/components/stub-button";
import { TicketStub } from "@/components/ticket-stub";
import { TxStage } from "@/components/tx-stage";
import { useMe } from "@/components/use-me";
import { useNow } from "@/components/use-now";
import { useAfterTx, useRead } from "@/components/use-read";
import { useTx } from "@/components/use-tx";
import { WaitBill, waitOf } from "@/components/wait-bill";
import { WalletGate } from "@/components/wallet-gate";
import { calls, isMock, openedEvent, readCredit, readEvent, readEventTicketsWindow, readReviewsWindow, readTicketsOfWindow, requestDemoNotice, requestDemoReopen, reviewOutcome } from "@/lib/chain";
import { demoStateOf, isDemoEvent, type Notice } from "@/lib/demo-event";
import { gen, pageName } from "@/lib/format";
import { demoGuide, eventGuide, readingGuide, sendingGuide, signGuide, type Guide, type LastReading, type Role } from "@/lib/guide";
import type { Call, DemoStatus, Ticket } from "@/lib/types";

/** What the one transaction of this page is doing, for its waiting bill. */
type Doing = { call: Call; label: string; sign: Guide; sending: Guide; judged: boolean; by: "you" | "demo" };

type DemoAsk = { state: "asking" | "failed" | "reopening"; what: string; reason?: string };

export function EventView({ id, demo, onReopened }: { id: string; demo: DemoStatus | null; onReopened?: (event: string) => void }) {
  const me = useMe();
  const now = useNow();
  const ev = useRead(() => readEvent(id), [id]);
  const reviews = useRead(() => readReviewsWindow(id, 2), [id]);
  const mineRead = useRead(() => readTicketsOfWindow(me.address, 2), [me.address], { enabled: !!me.address });
  const creditRead = useRead(() => readCredit(me.address), [me.address], { enabled: !!me.address });
  const e = ev.data;
  const settleOpen = !!e && now > 0 && now >= e.settleFrom;
  const isOrganizer = !!e && !!me.address && e.organizer === me.address;
  const allRead = useRead(() => readEventTicketsWindow(id, 2), [id, settleOpen, isOrganizer], { enabled: !!e && (settleOpen || isOrganizer) });

  const refreshAll = React.useCallback(async () => {
    await readEach([ev.refresh, reviews.refresh, mineRead.refresh, creditRead.refresh, allRead.refresh], (f) => f(), 2);
  }, [ev.refresh, reviews.refresh, mineRead.refresh, creditRead.refresh, allRead.refresh]);
  useAfterTx(refreshAll);

  const [doing, setDoing] = React.useState<Doing | null>(null);
  const [ask, setAsk] = React.useState<DemoAsk | null>(null);
  const [last, setLast] = React.useState<LastReading | null>(null);
  const [fresh, setFresh] = React.useState("");
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  const doingRef = React.useRef<Doing | null>(null);
  React.useEffect(() => {
    doingRef.current = doing;
  });

  const tx = useTx((s, _hash, call) => {
    if (call.fn === "review") {
      const out = reviewOutcome(s);
      if (out) {
        setLast({ review: out.review, finding: out.finding, repeatOf: out.repeatOf, feeTo: out.feeTo, mine: doingRef.current?.by === "you" });
        setFresh(out.review);
      }
    }
    if (call.fn === "open_event") {
      const opened = openedEvent(s);
      if (opened) onReopened?.(opened);
    }
  });

  const busy = tx.sending || (!!tx.hash && !tx.final) || ask?.state === "asking" || ask?.state === "reopening";

  if (ev.loading)
    return (
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="poster p-6">
          <Placeholder lines={7} />
        </div>
        <Placeholder lines={5} />
      </div>
    );
  if (ev.error) return <ReadError detail={ev.error} onRetry={ev.retry} />;
  if (!e)
    return (
      <div className="bill max-w-2xl p-5">
        <h1 className="text-[34px] uppercase">No event {id}</h1>
        <p className="mt-2 text-ink-2">This contract holds no event by that id. Events are E1, E2 and so on; the ledger lists every one.</p>
        <StubLink href="/ledger" tone="ink" className="mt-4">
          The ledger
        </StubLink>
      </div>
    );

  const myTickets: Ticket[] = (mineRead.data?.rows ?? []).filter((t) => t.event === id);
  const mine = {
    valid: myTickets.filter((t) => t.status === "valid").length,
    refunded: myTickets.filter((t) => t.status === "refunded").length,
    settled: myTickets.filter((t) => t.status === "settled").length,
  };
  const role: Role = isOrganizer ? "organizer" : myTickets.length > 0 ? "holder" : "visitor";
  const readsNotices = e.status === "on" && now > 0 && now < e.startsAt + 86400;
  const refundOpen = e.status === "changed" && now > 0 && now < e.refundUntil;
  const selling = e.status === "on" && now > 0 && now < e.startsAt && e.sold < e.capacity;
  const isDemo = !!demo && isDemoEvent(e, demo.organizer);
  const currentDemo = isDemo && demo!.event === id;
  const demoState = demoStateOf({ id, status: e.status, startsAt: e.startsAt, sold: e.sold, capacity: e.capacity }, now);
  const canReopen = currentDemo && demo!.online && now > 0 && demoState !== "open";
  const txLive = !!doing && (tx.sending || (!!tx.hash && !tx.final));
  const reviewRows = reviews.data?.rows ?? [];
  const settleable = (allRead.data?.rows ?? []).filter((t) => t.status === "valid");

  const send = async (d: Doing) => {
    setAsk(null);
    setDoing(d);
    await tx.start(d.call);
  };

  const buy = () =>
    void send({
      call: calls.buy(id, BigInt(e.priceAtto)),
      label: `Buying a ticket to ${id} for ${gen(e.priceAtto)}`,
      sign: signGuide({ fn: "buy", label: `a ticket to ${e.name} (${id}) for ${gen(e.priceAtto)}`, priceAtto: e.priceAtto, mock: isMock }),
      sending: sendingGuide({ fn: "buy", label: `Buying a ticket to ${id}`, event: id, role, priceAtto: e.priceAtto, mock: isMock }),
      judged: false,
      by: "you",
    });

  const refund = (t: Ticket) =>
    void send({
      call: calls.refund(t.id),
      label: `Refunding ${t.id}`,
      sign: signGuide({ fn: "refund", label: `the refund of ${t.id}`, priceAtto: t.priceAtto, mock: isMock }),
      sending: sendingGuide({ fn: "refund", label: `Refunding ${t.id}`, event: id, role, priceAtto: t.priceAtto, mock: isMock }),
      judged: false,
      by: "you",
    });

  const settle = (t: Ticket) =>
    void send({
      call: calls.settle(t.id),
      label: `Settling ${t.id} to the organizer`,
      sign: signGuide({ fn: "settle", label: `settling ${t.id} to the organizer`, priceAtto: t.priceAtto, mock: isMock }),
      sending: sendingGuide({ fn: "settle", label: `Settling ${t.id}`, event: id, role, priceAtto: t.priceAtto, mock: isMock }),
      judged: false,
      by: "you",
    });

  const cancel = () => {
    setConfirmCancel(false);
    void send({
      call: calls.cancel(id),
      label: `Cancelling ${id}`,
      sign: signGuide({ fn: "cancel", label: `cancelling ${id}; every holder can then take their money back`, mock: isMock }),
      sending: sendingGuide({ fn: "cancel", label: `Cancelling ${id}`, event: id, role, mock: isMock }),
      judged: false,
      by: "you",
    });
  };

  const review = (url: string) =>
    void send({
      call: calls.review(id, url),
      label: `Asking the network to read ${pageName(url) || url}`,
      sign: signGuide({ fn: "review", label: `a reading of ${pageName(url) || url} against ${id}'s terms`, mock: isMock }),
      sending: readingGuide({ event: id, page: pageName(url) || url, role, by: "you", mock: isMock }),
      judged: true,
      by: "you",
    });

  const deposit = (value: bigint) =>
    void send({
      call: calls.deposit(value),
      label: `Adding ${gen(value)} of review credit`,
      sign: signGuide({ fn: "deposit", label: `adding ${gen(value)} of review credit`, valueAtto: value.toString(), mock: isMock }),
      sending: sendingGuide({ fn: "deposit", label: `Adding ${gen(value)} of credit`, event: id, role, valueAtto: value.toString(), mock: isMock }),
      judged: false,
      by: "you",
    });

  const withdraw = (held: bigint) =>
    void send({
      call: calls.withdraw(),
      label: `Taking ${gen(held)} of credit back`,
      sign: signGuide({ fn: "withdraw", label: `taking all ${gen(held)} of your review credit back`, valueAtto: held.toString(), mock: isMock }),
      sending: sendingGuide({ fn: "withdraw", label: "Taking your credit back", event: id, role, valueAtto: held.toString(), mock: isMock }),
      judged: false,
      by: "you",
    });

  const announce = async (n: Notice) => {
    tx.reset();
    setDoing(null);
    const what = `read ${n.file}`;
    setAsk({ state: "asking", what });
    const answer = await requestDemoNotice(id, n.key);
    if (!answer.ok) {
      setAsk({ state: "failed", what, reason: answer.reason });
      return;
    }
    setAsk(null);
    const call = calls.review(id, e.sitePrefix + n.file);
    setDoing({
      call,
      label: `The demo organizer asks the network to read ${n.file}`,
      sign: signGuide({ fn: "review", label: n.file }),
      sending: readingGuide({ event: id, page: n.file, role, by: "demo", mock: isMock }),
      judged: true,
      by: "demo",
    });
    tx.track(answer.hash, call);
  };

  const reopen = async () => {
    tx.reset();
    setDoing(null);
    const what = "open a fresh demo festival";
    setAsk({ state: "reopening", what });
    const answer = await requestDemoReopen();
    if (!answer.ok) {
      setAsk({ state: "failed", what, reason: answer.reason });
      return;
    }
    setAsk(null);
    const call: Call = { fn: "open_event", args: [] };
    setDoing({
      call,
      label: "The demo organizer opens a fresh Harbour Lights Festival",
      sign: signGuide({ fn: "open_event", label: "a fresh demo festival" }),
      sending: sendingGuide({ fn: "open_event", label: "Opening a fresh demo festival", event: "the next demo festival", role: "visitor", mock: isMock }),
      judged: false,
      by: "demo",
    });
    tx.track(answer.hash, call);
  };

  // The one button the event's state calls for, on its waiting bill.
  const firstValid = myTickets.find((t) => t.status === "valid");
  let action: React.ReactNode = null;
  if (selling && !isOrganizer)
    action = (
      <WalletGate need={BigInt(e.priceAtto)} what="to buy a ticket">
        <StubButton disabled={busy} onClick={buy}>
          {mine.valid > 0 ? "Buy another ticket" : "Buy a ticket"} · {gen(e.priceAtto)}
        </StubButton>
      </WalletGate>
    );
  else if (refundOpen && firstValid)
    action = (
      <StubButton disabled={busy} onClick={() => refund(firstValid)}>
        Refund {firstValid.id} · {gen(firstValid.priceAtto)}
      </StubButton>
    );
  else if (settleOpen && settleable.length > 0)
    action = (
      <StubButton tone="ink" disabled={busy} onClick={() => settle(settleable[0])}>
        Settle {settleable[0].id} to the organizer
      </StubButton>
    );

  const guide = now > 0 ? eventGuide({ role, now, id, status: e.status, changedBy: e.changedBy, startsAt: e.startsAt, sold: e.sold, capacity: e.capacity, priceAtto: e.priceAtto, heldAtto: e.heldAtto, mine, last, mock: isMock }) : null;

  return (
    <div>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <EventPoster event={e} now={now} me={me.address} />

        <div className="flex min-w-0 flex-col gap-5">
          {ask ? (
            <WaitBill
              wait={waitOf(demoGuide({ ...ask, event: id, mock: isMock }), {
                action: ask.state === "failed" ? (
                  <StubButton size="sm" tone="paper" onClick={() => setAsk(null)}>
                    Back to the event
                  </StubButton>
                ) : undefined,
              })}
            />
          ) : doing && (tx.sending || tx.error || tx.hash) ? (
            <TxStage tx={tx} sign={doing.sign} sending={doing.sending} label={doing.label} judged={doing.judged} />
          ) : null}
          {!ask && !txLive && guide && <WaitBill wait={waitOf(guide, { action })} />}

          {canReopen && (
            <div className="bill border-t-[7px] border-t-mustard p-4">
              <p className="display text-[20px] leading-tight uppercase">
                This demo festival has {demoState === "changed" ? "changed" : demoState === "sold_out" ? "sold out" : "started"}
              </p>
              <p className="mt-1 text-[14.5px] text-ink-2">
                Its refunds and settles stay where they are. To try the whole story again, the demo organizer opens a fresh one on sale for six hours, in one transaction.
              </p>
              <StubButton className="mt-3" tone="mustard" disabled={busy} onClick={() => void reopen()}>
                Open the next demo festival
              </StubButton>
            </div>
          )}
          {isDemo && !currentDemo && demo?.event && (
            <p className="border-2 border-ink bg-mustard-wash px-3 py-2 text-sm">
              This is an earlier demo festival. The one on sale now is{" "}
              <Link className="link font-semibold" href="/event">
                {demo.event}
              </Link>
              .
            </p>
          )}

          {myTickets.length > 0 && (
            <section aria-labelledby="mine-title">
              <h2 id="mine-title" className="text-[24px] uppercase">
                Your {myTickets.length === 1 ? "ticket" : "tickets"}
              </h2>
              <ul className="mt-3 flex flex-col gap-3">
                {myTickets.map((t) => (
                  <li key={t.id}>
                    <TicketStub
                      ticket={t}
                      now={now}
                      link={false}
                      action={
                        t.status === "valid" && refundOpen ? (
                          <StubButton size="sm" disabled={busy} onClick={() => refund(t)}>
                            Refund {t.id}
                          </StubButton>
                        ) : t.status === "valid" && settleOpen ? (
                          <StubButton size="sm" tone="ink" disabled={busy} onClick={() => settle(t)}>
                            Settle {t.id}
                          </StubButton>
                        ) : undefined
                      }
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {mineRead.error && <ReadError detail={mineRead.error} onRetry={mineRead.retry} />}

          {isOrganizer && e.status === "on" && now > 0 && now < e.startsAt && (
            <section className="bill p-4" aria-labelledby="desk-title">
              <h2 id="desk-title" className="text-[22px] uppercase">
                Your organizer&apos;s desk
              </h2>
              <p className="mt-1 text-[14.5px] text-ink-2">
                You opened {id}. Calling it off before the start opens every refund at once; the money stays in escrow until each holder takes theirs back.
              </p>
              {!confirmCancel ? (
                <StubButton className="mt-3" tone="paper" size="sm" disabled={busy} onClick={() => setConfirmCancel(true)}>
                  Cancel {id}…
                </StubButton>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <StubButton size="sm" disabled={busy} onClick={cancel}>
                    Yes, cancel and open every refund
                  </StubButton>
                  <StubButton size="sm" tone="paper" onClick={() => setConfirmCancel(false)}>
                    Keep it on
                  </StubButton>
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {currentDemo && demo && <NoticeBoard demo={demo} prefix={e.sitePrefix} reviews={reviewRows} open={readsNotices} busy={busy} onAnnounce={(n) => void announce(n)} />}

      <ReviewDesk event={e} credit={creditRead.data} creditError={creditRead.error} open={readsNotices} busy={busy} onReview={review} onDeposit={deposit} onWithdraw={withdraw} />

      <section aria-labelledby="slips-title" className="mt-12">
        <h2 id="slips-title" className="text-[clamp(26px,5.5vw,36px)] uppercase">
          Posted notices
        </h2>
        <p className="mt-1 text-ink-2">
          Every reading of {id}, newest first. The fingerprint is the start of the sha256 of the text every validator read; the same text is read once per event.
        </p>
        {reviews.loading && <Placeholder className="mt-4" lines={3} />}
        {reviews.error && <ReadError className="mt-4" detail={reviews.error} onRetry={reviews.retry} />}
        {reviews.data && reviewRows.length === 0 && <p className="mt-4 border-2 border-dashed border-ink px-4 py-3 text-ink-2">No notice has been read for {id} yet.</p>}
        {reviewRows.length > 0 && (
          <ul className="mt-5 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {reviewRows.map((r, i) => (
              <li key={r.id}>
                <NoticeSlip review={r} me={me.address} fresh={r.id === fresh} tilt={i % 2 === 0 ? "a" : "b"} />
              </li>
            ))}
          </ul>
        )}
        {reviews.data?.partial && <p className="mt-3 text-sm text-ink-3">The oldest readings are left out; this list shows the newest {reviewRows.length}.</p>}
      </section>

      {(settleOpen || isOrganizer) && (
        <section aria-labelledby="all-title" className="mt-12">
          <h2 id="all-title" className="text-[clamp(24px,5vw,32px)] uppercase">
            {settleOpen ? "Tickets that settle to the organizer" : "Every ticket sold"}
          </h2>
          <p className="mt-1 text-ink-2">
            {settleOpen
              ? e.status === "on"
                ? "Nothing changed and a day has passed since the start: anyone may settle a ticket, one per call, and its price goes to the organizer."
                : "The refund window has closed: a ticket nobody refunded settles to the organizer, one per call, by anyone."
              : "Every price is held in escrow until the event or a refund."}
          </p>
          {allRead.loading && <Placeholder className="mt-4" lines={2} />}
          {allRead.error && <ReadError className="mt-4" detail={allRead.error} onRetry={allRead.retry} />}
          {allRead.data && (
            <ul className="mt-4 grid gap-3 md:grid-cols-2">
              {(settleOpen ? settleable : allRead.data.rows).map((t) => (
                <li key={t.id}>
                  <TicketStub
                    ticket={t}
                    now={now}
                    link={false}
                    action={
                      settleOpen && t.status === "valid" ? (
                        <WalletGate what="to settle a ticket">
                          <StubButton size="sm" tone="ink" disabled={busy} onClick={() => settle(t)}>
                            Settle {t.id}
                          </StubButton>
                        </WalletGate>
                      ) : undefined
                    }
                  />
                </li>
              ))}
              {settleOpen && settleable.length === 0 && <li className="text-ink-2">Every ticket of {id} is paid out.</li>}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
