"use client";

// "What the organizer announces next": the demo organizer's six fixed notices for the demo festival,
// each a small bill with what the page says, the band the network should print on it, a link to read
// the page itself, and the button that has the demo organizer post it and ask the network to read it
// from its own credit. A notice already read for this event shows its reading instead of a button:
// the same text again would only be a repeat.

import { FindingBand } from "@/components/notice-slip";
import { StubButton } from "@/components/stub-button";
import { cx } from "@/lib/cx";
import { BOT_NOTICES, type Notice } from "@/lib/demo-event";
import type { DemoStatus, Review } from "@/lib/types";

export function NoticeBoard({
  demo,
  prefix,
  reviews,
  open,
  busy,
  onAnnounce,
}: {
  demo: DemoStatus;
  /** the demo event's site prefix: where the network reads each page */
  prefix: string;
  /** the event's readings so far */
  reviews: Review[];
  /** the event still reads notices */
  open: boolean;
  busy: boolean;
  onAnnounce: (n: Notice) => void;
}) {
  return (
    <section aria-labelledby="announce-title" className="mt-12">
      <p className="kicker text-red-deep">Played by the demo organizer</p>
      <h2 id="announce-title" className="mt-1 text-[clamp(28px,6vw,42px)] uppercase">
        What the organizer announces next
      </h2>
      <p className="mt-2 max-w-3xl text-ink-2">
        Each button has the demo organizer publish one of its notices and ask the network to read it, paying the 0.01 GEN review fee from its own credit, so you need no credit to watch
        a reading. Buy a ticket first to see your own money move. Every page is a fixed file pinned to one commit; nothing you type goes with it.
      </p>
      {!demo.online && (
        <p role="status" className="mt-3 border-2 border-ink bg-mustard-wash px-3 py-2 text-sm">
          The demo organizer is away: {demo.reason || "the site's server did not say why"}. You can still read any of these pages yourself, below, with your own credit.
        </p>
      )}
      <ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {BOT_NOTICES.map((n, i) => {
          const read = reviews.find((r) => r.url.endsWith("/notices/" + n.file) && !r.repeatOf);
          return (
            <li key={n.key} className={cx("bill flex flex-col p-4", i % 2 === 0 ? "-rotate-[0.4deg]" : "rotate-[0.35deg]")}>
              <p className="display text-[20px] leading-tight uppercase">{n.title}</p>
              <p className="mt-1 text-[14.5px] text-ink-2">{n.says}.</p>
              <p className="mt-3 kicker text-[11px] text-ink-3">The network should print</p>
              <FindingBand finding={n.expect} className="mt-1 text-[15px]" />
              <p className="mt-1.5 text-[13.5px] text-ink-2">Because {n.why}.</p>
              <p className="mt-2 text-[13px]">
                <a className="link" href={`/notices/${n.file}`} target="_blank" rel="noreferrer">
                  Read the page
                </a>
                <span className="text-ink-3"> · </span>
                <a className="link mono break-all text-ink-2" href={prefix + n.file} target="_blank" rel="noreferrer">
                  the pinned copy
                </a>
              </p>
              <div className="mt-auto pt-3">
                {read ? (
                  <p className="mono text-[13px] font-bold">
                    Read as {read.id}: {read.finding}. That reading stands.
                  </p>
                ) : (
                  <StubButton size="sm" tone={n.expect === "material" ? "red" : "ink"} disabled={busy || !open || !demo.online} onClick={() => onAnnounce(n)}>
                    Announce it
                  </StubButton>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
