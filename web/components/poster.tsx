// An event as a big wheat-pasted gig poster: the status printed on a band across the top, the name and
// the main act in letterpress, the date and the venue, the details marked not material, and along the
// foot the price, the tickets, the start and what the contract holds in escrow. A changed event gets a
// red overprint across it, the way a poster on the wall gets a CANCELLED or a NEW DATE strip.

import { Addr } from "@/components/addr";
import { gen, relative, when } from "@/lib/format";
import { cx } from "@/lib/cx";
import type { EventRow } from "@/lib/types";

export function statusWord(e: EventRow): string {
  if (e.status === "changed") return e.changedBy === "organizer" ? "Cancelled · refunds open" : "Changed · refunds open";
  switch (e.phase) {
    case "selling":
      return "On sale now";
    case "sold_out":
      return "Sold out";
    case "started":
      return "Tonight · notices still read";
    case "settling":
      return "Played as described";
    default:
      return "On sale";
  }
}

export function EventPoster({ event: e, now, me, flat, className }: { event: EventRow; now: number; me?: string; flat?: boolean; className?: string }) {
  const changed = e.status === "changed";
  const closed = changed && now > 0 && now >= e.refundUntil && e.refundUntil > 0;
  return (
    <article className={cx("poster overflow-hidden", flat && "poster-flat", className)} aria-label={`${e.name}, ${e.id}`}>
      <div className={cx("band flex items-center justify-between gap-3 px-4 py-2 text-[15px] sm:text-[17px]", changed ? "" : "bg-ink")}>
        <span className="min-w-0 truncate">{closed ? "Refunds closed" : statusWord(e)}</span>
        <span className="mono shrink-0 text-[13px] font-bold">{e.id}</span>
      </div>

      <div className="relative px-4 pt-5 pb-4 sm:px-7 sm:pt-7">
        <p className="kicker text-ink-3">One night only · tickets held in escrow</p>
        <h2 className="mt-2 text-[clamp(34px,8.5vw,66px)] leading-[0.95] break-words uppercase">{e.name}</h2>
        <p className="mt-4 kicker text-ink-3">Main act</p>
        <p className="display text-[clamp(26px,6.4vw,46px)] leading-[1] break-words text-red uppercase">{e.mainAct}</p>
        {changed && (
          <div className="-mx-6 my-5 -rotate-[2.5deg] sm:-mx-9">
            <p className="band py-1.5 text-center text-[clamp(24px,6vw,40px)] shadow-[0_5px_0_rgba(20,20,20,0.85)]">{e.changedBy === "organizer" ? "Cancelled · refunds open" : "Changed · refunds open"}</p>
          </div>
        )}

        <div className="mt-5 grid gap-x-6 gap-y-3 border-y-[3px] border-ink py-3 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="kicker text-ink-3">Date</p>
            <p className="display text-[22px] leading-tight break-words sm:text-[26px]">{e.date}</p>
          </div>
          <div className="min-w-0">
            <p className="kicker text-ink-3">Venue</p>
            <p className="display text-[22px] leading-tight break-words sm:text-[26px]">{e.venue}</p>
          </div>
        </div>
        <p className="mt-3 text-[14.5px] text-ink-2">
          <span className="mono text-[12px] font-bold tracking-[0.1em] text-ink-3 uppercase">Not material · </span>
          {e.details || "no other details"}
        </p>

      </div>

      <dl className="grid grid-cols-2 border-t-[3px] border-ink bg-paper-2/60 sm:grid-cols-4">
        <Cell label="Price">{gen(e.priceAtto)}</Cell>
        <Cell label="Tickets">
          {e.sold} of {e.capacity}
        </Cell>
        <Cell label="Starts">
          <span className="block">{when(e.startsAt)}</span>
          {now > 0 && <span className="mono block text-[12.5px] text-ink-2">{relative(e.startsAt, now)}</span>}
        </Cell>
        <Cell label="In escrow">{gen(e.heldAtto)}</Cell>
      </dl>
      <div className="flex flex-col gap-1 border-t-[1.5px] border-dashed border-ink px-4 py-2.5 text-[13px] text-ink-2 sm:px-7">
        <p className="min-w-0">
          Organizer <Addr address={e.organizer} me={me} />
        </p>
        <p className="min-w-0">
          Notices are read from <span className="mono break-all text-ink">{e.sitePrefix}</span>
        </p>
      </div>
    </article>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 border-ink px-4 py-2.5 odd:border-r-[1.5px] sm:border-r-[1.5px] sm:last:border-r-0 sm:px-5">
      <dt className="kicker text-[11px] text-ink-3">{label}</dt>
      <dd className="display mt-0.5 text-[17px] leading-tight break-words">{children}</dd>
    </div>
  );
}
