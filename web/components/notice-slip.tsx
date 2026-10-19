// One reading as a NOTICE slip pasted on the wall: the page it read, the printed band of what the
// network found (MATERIAL CHANGE - REFUNDS OPEN, MINOR - TICKETS STAND, or UNCLEAR), whether it only
// repeated an earlier reading, the fingerprint every validator agreed on, who asked, and where the
// review fee went.

import { Addr } from "@/components/addr";
import { cx } from "@/lib/cx";
import { noticeOfUrl } from "@/lib/demo-event";
import { pageName, when } from "@/lib/format";
import { feeLine } from "@/lib/guide";
import type { Finding } from "@/lib/rules";
import type { Review } from "@/lib/types";

export const FINDING_WORDS: Record<Finding, string> = {
  material: "Material change - refunds open",
  minor: "Minor - tickets stand",
  unclear: "Unclear",
};

export const FINDING_MEANING: Record<Finding, string> = {
  material: "The network agreed the page says the event will not take place as the tickets describe it. Every holder can take their money back.",
  minor: "The network agreed the event still takes place on the date, at the venue and with the main act on the tickets. Nothing changes.",
  unclear: "The four answers did not all agree, so nothing changes. A clearer notice can be read; the same text again is only a repeat.",
};

export function FindingBand({ finding, className }: { finding: Finding; className?: string }) {
  return <span className={cx("finding", `finding-${finding}`, className)}>{FINDING_WORDS[finding]}</span>;
}

export function NoticeSlip({ review: r, me, fresh, tilt, className }: { review: Review; me?: string; fresh?: boolean; tilt?: "a" | "b"; className?: string }) {
  const notice = noticeOfUrl(r.url);
  return (
    <article className={cx("slip", tilt === "a" && "slip-tilt-a", tilt === "b" && "slip-tilt-b", fresh && "slip-new", className)} data-review={r.id} data-finding={r.finding}>
      <div className="flex items-baseline justify-between gap-3 px-4 pt-3">
        <p className="display text-[26px] leading-none tracking-[0.08em] uppercase">Notice</p>
        <p className="mono text-[13px] font-bold">{r.id}</p>
      </div>
      <div className="double-rule mx-4 mt-2" aria-hidden="true" />
      <div className="px-4 pt-4">
        <p className="text-[15px] font-semibold">{notice ? notice.title : pageName(r.url) || "A page of the organizer's"}</p>
        <a href={r.url} target="_blank" rel="noreferrer" className="mono link mt-0.5 block text-[12.5px] break-all text-ink-2">
          {r.url}
        </a>
      </div>
      <div className="mt-3 px-4">
        <FindingBand finding={r.finding} />
        {r.repeatOf && <p className="mono mt-1.5 text-[12.5px] font-bold tracking-[0.08em] uppercase">Repeat of {r.repeatOf}: the earlier reading stands</p>}
      </div>
      <p className="px-4 pt-2.5 text-[14px] leading-snug text-ink-2">{r.repeatOf ? "This text was already read for the event; asking again changed nothing." : FINDING_MEANING[r.finding]}</p>
      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 border-t-[1.5px] border-dashed border-ink px-4 py-2.5 text-[13px]">
        <dt className="mono text-ink-3">Fingerprint</dt>
        <dd className="mono font-bold break-all">{r.fp || "none"}</dd>
        <dt className="mono text-ink-3">Asked by</dt>
        <dd className="min-w-0">
          <Addr address={r.reviewer} me={me} />
          {r.holder ? <span className="text-ink-3"> · holds a ticket</span> : null}
        </dd>
        <dt className="mono text-ink-3">Read</dt>
        <dd>{when(r.at)}</dd>
        <dt className="mono text-ink-3">Fee</dt>
        <dd className="text-ink-2">{feeLine(r)}</dd>
      </dl>
    </article>
  );
}
