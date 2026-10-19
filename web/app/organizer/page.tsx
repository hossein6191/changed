"use client";

// The organizer's desk: open an event on your own terms (every field with one-click suggestions, every
// value checked the way the contract will check it before anything is signed), and the events this
// wallet opened, each with what its escrow holds, and its cancel while it is still before the start.

import * as React from "react";
import Link from "next/link";

import { EventPoster } from "@/components/poster";
import { Placeholder, ReadError } from "@/components/read-state";
import { StubButton, StubLink } from "@/components/stub-button";
import { Suggest } from "@/components/suggest";
import { TxStage } from "@/components/tx-stage";
import { useDemoStatus } from "@/components/use-demo";
import { useMe } from "@/components/use-me";
import { useNow } from "@/components/use-now";
import { useAfterTx, useRead } from "@/components/use-read";
import { useTx } from "@/components/use-tx";
import { WaitBill, waitOf } from "@/components/wait-bill";
import { WalletGate } from "@/components/wallet-gate";
import { calls, isMock, openedEvent, readEventsOfWindow } from "@/lib/chain";
import { cx } from "@/lib/cx";
import { durationLabel, gen, genText, tryAtto } from "@/lib/format";
import { eventGuide, sendingGuide, signGuide, type Guide } from "@/lib/guide";
import {
  MAX_DETAILS,
  MAX_LEAD,
  MAX_TERM,
  MIN_LEAD,
  MIN_TERM,
  capacityProblem,
  nameProblem,
  plain,
  prefixProblem,
  priceProblem,
  sentence,
  termsJson,
  termsProblem,
  textProblem,
} from "@/lib/rules";
import { ACT_CHIPS, CAPACITY_CHIPS, DATE_CHIPS, DETAILS_CHIPS, EXAMPLE_PREFIXES, NAME_CHIPS, PRICE_CHIPS, START_CHIPS, TERMS_CHIPS, VENUE_CHIPS, type Chip } from "@/lib/suggestions";
import type { Call, EventRow } from "@/lib/types";

type Doing = { call: Call; label: string; sign: Guide; sending: Guide };

const noSubscribe = () => () => {};

export default function OrganizerPage() {
  const me = useMe();
  const now = useNow();
  const { status: demo } = useDemoStatus();
  const mine = useRead(() => readEventsOfWindow(me.address, 2), [me.address], { enabled: !!me.address });
  useAfterTx(mine.refresh);
  const [doing, setDoing] = React.useState<Doing | null>(null);
  const [opened, setOpened] = React.useState("");
  const tx = useTx((s) => setOpened(openedEvent(s)));
  const busy = tx.sending || (!!tx.hash && !tx.final);

  const [name, setName] = React.useState(NAME_CHIPS[0]);
  const [date, setDate] = React.useState(TERMS_CHIPS[2].terms.date);
  const [venue, setVenue] = React.useState(TERMS_CHIPS[2].terms.venue);
  const [act, setAct] = React.useState(TERMS_CHIPS[2].terms.main_act);
  const [details, setDetails] = React.useState(TERMS_CHIPS[2].terms.details);
  const [prefix, setPrefix] = React.useState(EXAMPLE_PREFIXES[0].value);
  const [price, setPrice] = React.useState(genText(PRICE_CHIPS[1].value));
  const [capacity, setCapacity] = React.useState(String(CAPACITY_CHIPS[2].value));
  const [lead, setLead] = React.useState(START_CHIPS[3].value);

  // Prefixes whose pages the validators can really fetch: the pinned demo folder, and this site's copies.
  const origin = React.useSyncExternalStore(
    noSubscribe,
    () => window.location.origin,
    () => "",
  );
  const prefixChips: Chip<string>[] = [
    ...(demo?.prefix ? [{ label: "The pinned demo notices", value: demo.prefix, tag: "fetchable" }] : []),
    ...(origin && !prefixProblem(origin + "/notices/") ? [{ label: "This site's copies", value: origin + "/notices/", tag: "fetchable" }] : []),
    ...EXAMPLE_PREFIXES,
  ];

  const terms = { date: plain(date), venue: plain(venue), main_act: plain(act), details: plain(details) };
  const json = termsJson(terms);
  const priceAtto = tryAtto(price);
  const seats = /^\d{1,4}$/.test(capacity.trim()) ? BigInt(capacity.trim()) : -1n;
  const problems = {
    name: nameProblem(plain(name)),
    date: textProblem(terms.date, MIN_TERM, MAX_TERM, "the date term"),
    venue: textProblem(terms.venue, MIN_TERM, MAX_TERM, "the venue term"),
    act: textProblem(terms.main_act, MIN_TERM, MAX_TERM, "the main_act term"),
    details: textProblem(terms.details, 0, MAX_DETAILS, "the details"),
    terms: termsProblem(json).problem,
    prefix: prefixProblem(plain(prefix)),
    price: priceAtto === null ? "Enter an amount like 0.5 or 12" : priceProblem(priceAtto),
    capacity: seats < 0n ? "Enter a whole number of tickets" : capacityProblem(seats),
    lead: lead < MIN_LEAD || lead > MAX_LEAD ? "the start is at least an hour and at most 400 days ahead" : "",
  };
  const firstProblem = Object.values(problems).find(Boolean) ?? "";

  const open = () => {
    if (firstProblem || priceAtto === null || now <= 0) return;
    const starts = now + lead;
    const n = plain(name);
    setOpened("");
    const d: Doing = {
      call: calls.openEvent(n, json, plain(prefix), priceAtto, Number(seats), starts),
      label: `Opening ${n}`,
      sign: signGuide({ fn: "open_event", label: `opening ${n}: ${gen(priceAtto)} a ticket, ${seats} tickets, starting ${durationLabel(lead)} from now`, mock: isMock }),
      sending: sendingGuide({ fn: "open_event", label: `Opening ${n}`, event: n, role: "organizer", mock: isMock }),
    };
    setDoing(d);
    void tx.start(d.call);
  };

  const cancel = (e: EventRow) => {
    setOpened("");
    const d: Doing = {
      call: calls.cancel(e.id),
      label: `Cancelling ${e.id}`,
      sign: signGuide({ fn: "cancel", label: `cancelling ${e.id}; every holder can then take their money back`, mock: isMock }),
      sending: sendingGuide({ fn: "cancel", label: `Cancelling ${e.id}`, event: e.id, role: "organizer", mock: isMock }),
    };
    setDoing(d);
    void tx.start(d.call);
  };

  return (
    <div>
      <header className="mb-7 max-w-3xl">
        <p className="kicker text-red-deep">The organizer&apos;s desk</p>
        <h1 className="mt-1 text-[clamp(34px,7vw,56px)] uppercase">Put up a poster</h1>
        <p className="mt-3 text-[16.5px] text-ink-2">
          The date, the venue and the main act are what your tickets promise; the details are not. Name the folder of your own site where you will post your notices: only pages below it
          are read. Everything here is fixed for good once it is open.
        </p>
      </header>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <form
          className="bill p-4 sm:p-6"
          onSubmit={(ev) => {
            ev.preventDefault();
            open();
          }}
        >
          <Field id="name" label="Event name" value={name} onChange={setName} problem={problems.name}>
            <Suggest label="Event names" chips={NAME_CHIPS.map((c) => ({ label: c, value: c }))} onPick={setName} isOn={(v) => v === name} />
          </Field>
          <div className="mt-5 border-t-[3px] border-ink pt-4">
            <p className="kicker text-red-deep">What the tickets promise</p>
            <Suggest
              label="Whole sets of terms"
              chips={TERMS_CHIPS.map((t) => ({ label: t.label, value: t.terms, tag: t.label === TERMS_CHIPS[0].label ? "the notices' festival" : undefined }))}
              onPick={(t) => {
                setDate(t.date);
                setVenue(t.venue);
                setAct(t.main_act);
                setDetails(t.details);
              }}
              isOn={(t) => t.date === date && t.venue === venue && t.main_act === act}
            />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field id="date" label="Date" value={date} onChange={setDate} problem={problems.date}>
              <Suggest label="Dates" chips={DATE_CHIPS.map((c) => ({ label: c, value: c }))} onPick={setDate} isOn={(v) => v === date} />
            </Field>
            <Field id="venue" label="Venue" value={venue} onChange={setVenue} problem={problems.venue}>
              <Suggest label="Venues" chips={VENUE_CHIPS.map((c) => ({ label: c, value: c }))} onPick={setVenue} isOn={(v) => v === venue} />
            </Field>
          </div>
          <div className="mt-4">
            <Field id="act" label="Main act" value={act} onChange={setAct} problem={problems.act}>
              <Suggest label="Main acts" chips={ACT_CHIPS.map((c) => ({ label: c, value: c }))} onPick={setAct} isOn={(v) => v === act} />
            </Field>
          </div>
          <div className="mt-4">
            <Field id="details" label="Other details, not material" value={details} onChange={setDetails} problem={problems.details}>
              <Suggest label="Details" chips={DETAILS_CHIPS} onPick={setDetails} isOn={(v) => v === details} />
            </Field>
          </div>
          <div className="mt-5 border-t-[3px] border-ink pt-4">
            <Field id="prefix" label="Your notices folder" value={prefix} onChange={setPrefix} problem={problems.prefix} mono>
              <Suggest label="Notices folders" chips={prefixChips} onPick={setPrefix} isOn={(v) => v === prefix} />
            </Field>
            <p className="mt-1.5 text-[13px] text-ink-3">A review reads one page below this folder. The example sites are not real, so a review of them stores nothing.</p>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field id="price" label="Ticket price, in GEN" value={price} onChange={setPrice} problem={problems.price} mono>
              <Suggest label="Prices" chips={PRICE_CHIPS} onPick={(v) => setPrice(genText(v))} isOn={(v) => priceAtto === v} />
            </Field>
            <Field id="capacity" label="Tickets" value={capacity} onChange={setCapacity} problem={problems.capacity} mono>
              <Suggest label="Capacities" chips={CAPACITY_CHIPS} onPick={(v) => setCapacity(String(v))} isOn={(v) => capacity.trim() === String(v)} />
            </Field>
          </div>
          <div className="mt-4">
            <p className="label">Starts</p>
            <Suggest label="Start" chips={START_CHIPS} onPick={setLead} isOn={(v) => v === lead} className="mt-0" />
            <p className={cx("mt-1.5 text-[13.5px]", problems.lead ? "text-red-deep" : "text-ink-3")}>
              {problems.lead ? sentence(problems.lead) : `${durationLabel(lead)} after you sign. Tickets sell until then; notices are read until a day after; settles open a day after.`}
            </p>
          </div>
          <div className="mt-6">
            <WalletGate what="to open an event">
              <StubButton type="submit" disabled={busy || !!firstProblem}>
                Open the event
              </StubButton>
              {firstProblem && <p className="mt-2 text-[13.5px] text-red-deep">{sentence(firstProblem)}</p>}
            </WalletGate>
          </div>
        </form>

        <div className="flex min-w-0 flex-col gap-5">
          {doing ? (
            <TxStage tx={tx} sign={doing.sign} sending={doing.sending} label={doing.label} />
          ) : (
            <WaitBill
              wait={waitOf({
                id: "organizer-idle",
                tone: "waiting",
                waitsFor: "you",
                kicker: "Before you sign",
                now: "Opening an event sends no GEN",
                time: "About 30 seconds once you sign.",
                need: "Fill the poster on the left, or keep the suggestions, then open it.",
                leave: "You can close this page; nothing has been sent.",
                canLeave: true,
                money: "Nothing moves until somebody buys a ticket; every price then waits in escrow until the event or a refund.",
              })}
            />
          )}
          {opened && tx.final && (
            <div className="bill border-t-[7px] border-t-red p-4">
              <p className="display text-[22px] uppercase">{opened} is up</p>
              <p className="mt-1 text-ink-2">Its poster, its tickets and every notice read against it are on its own page.</p>
              <StubLink href={`/event/${opened}`} className="mt-3">
                Go to {opened}
              </StubLink>
            </div>
          )}
        </div>
      </div>

      <section aria-labelledby="yours-title" className="mt-14">
        <h2 id="yours-title" className="text-[clamp(28px,5.5vw,40px)] uppercase">
          Your events
        </h2>
        <WalletGate what="to see your events">
          {mine.loading && <Placeholder className="mt-4" lines={3} />}
          {mine.error && <ReadError className="mt-4" detail={mine.error} onRetry={mine.retry} />}
          {mine.data && mine.data.rows.length === 0 && <p className="mt-4 border-2 border-dashed border-ink px-4 py-3 text-ink-2">This wallet has not opened an event yet.</p>}
          <ul className="mt-5 grid gap-8 md:grid-cols-2">
            {(mine.data?.rows ?? []).map((e) => {
              const g = now > 0 ? eventGuide({ role: "organizer", now, id: e.id, status: e.status, changedBy: e.changedBy, startsAt: e.startsAt, sold: e.sold, capacity: e.capacity, priceAtto: e.priceAtto, heldAtto: e.heldAtto, mine: { valid: 0, refunded: 0, settled: 0 }, mock: isMock }) : null;
              return (
                <li key={e.id} className="flex flex-col gap-3">
                  <Link href={`/event/${e.id}`} className="block no-underline">
                    <EventPoster event={e} now={now} me={me.address} flat />
                  </Link>
                  {g && <p className="text-[14.5px]"><strong>{g.now}.</strong> <span className="text-ink-2">{g.money}</span></p>}
                  <div className="flex flex-wrap gap-2">
                    <StubLink href={`/event/${e.id}`} size="sm" tone="ink">
                      Open {e.id}
                    </StubLink>
                    {e.status === "on" && now > 0 && now < e.startsAt && (
                      <CancelButton id={e.id} busy={busy} onCancel={() => cancel(e)} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </WalletGate>
      </section>
    </div>
  );
}

function CancelButton({ id, busy, onCancel }: { id: string; busy: boolean; onCancel: () => void }) {
  const [sure, setSure] = React.useState(false);
  if (!sure)
    return (
      <StubButton size="sm" tone="paper" disabled={busy} onClick={() => setSure(true)}>
        Cancel {id}…
      </StubButton>
    );
  return (
    <>
      <StubButton size="sm" disabled={busy} onClick={onCancel}>
        Yes, cancel and open every refund
      </StubButton>
      <StubButton size="sm" tone="paper" onClick={() => setSure(false)}>
        Keep it on
      </StubButton>
    </>
  );
}

function Field({ id, label, value, onChange, problem, mono, children }: { id: string; label: string; value: string; onChange: (v: string) => void; problem: string; mono?: boolean; children?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input id={id} className={cx("field", mono && "mono")} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!problem} aria-describedby={problem ? `${id}-problem` : undefined} spellCheck={false} />
      {children}
      {problem && (
        <p id={`${id}-problem`} className="mt-1.5 text-[13.5px] text-red-deep">
          {sentence(problem)}
        </p>
      )}
    </div>
  );
}
