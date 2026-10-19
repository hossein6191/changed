// One ticket as a perforated stub: the event, the price and the line that says what the ticket is
// waiting for and where its price is, and, past the dashed tear line, the stub with its number. A
// refunded ticket is printed in red, a settled one greyed, a valid one in mustard while its event's
// refunds are open.

import Link from "next/link";

import { cx } from "@/lib/cx";
import { gen, when } from "@/lib/format";
import { ticketLine } from "@/lib/guide";
import type { Ticket } from "@/lib/types";

const STATUS_WORD: Record<Ticket["status"], string> = { valid: "Valid", refunded: "Refunded", settled: "Settled" };

export function TicketStub({ ticket: t, now, action, link = true, className }: { ticket: Ticket; now: number; action?: React.ReactNode; link?: boolean; className?: string }) {
  const refundOpen = t.status === "valid" && t.eventStatus === "changed";
  return (
    <div className={cx("stub", t.status === "refunded" && "stub-red", t.status === "settled" && "stub-void", refundOpen && "stub-mustard", className)} data-ticket={t.id}>
      <div className="min-w-0 px-4 py-3">
        <p className="kicker text-[11.5px] opacity-80">
          Admit one · {t.event} · {STATUS_WORD[t.status]}
        </p>
        <p className="display mt-1 text-[21px] leading-tight break-words uppercase">
          {link ? (
            <Link href={`/event/${t.event}`} className="no-underline hover:underline">
              {t.eventName}
            </Link>
          ) : (
            t.eventName
          )}
        </p>
        <p className="mono mt-1 text-[13px]">
          {gen(t.priceAtto)} · bought {when(t.boughtAt)}
        </p>
        {now > 0 && <p className="mt-1.5 text-[14px] leading-snug">{ticketLine({ id: t.id, event: t.event, status: t.status, eventStatus: t.eventStatus, startsAt: t.startsAt, priceAtto: t.priceAtto, now })}</p>}
        {action && <div className="mt-2.5 flex flex-wrap gap-2">{action}</div>}
      </div>
      <div className="stub-part">
        <span className="kicker text-[10.5px]">No.</span>
        <span className="display text-[30px] leading-none">{t.n}</span>
        <span className="mono text-[12px] font-bold">{t.id}</span>
      </div>
    </div>
  );
}
