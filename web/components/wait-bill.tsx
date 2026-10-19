"use client";

// The waiting handbill: a small printed bill posted where the action happens. What is happening right
// now and who it waits for, then four ruled lines (how long, what is needed from you, whether you can
// leave, where the money is), a ticket-office counter, and the next button when there is one. The
// words come from lib/guide.ts, the same for every in-between state of the site. A page shows one at
// a time; the bill scrolls itself into view when a busy state first appears (a calm state never moves
// the page). Five tones: busy (a transaction or the demo organizer at work), waiting (for the show,
// for the holders), ready (something can be done now), alert (unclear, or refunds closing) and done.

import * as React from "react";

import { IconAlert, IconCheck, IconExternal, IconTicket } from "@/components/icons";
import { useWallNow } from "@/components/use-now";
import { cx } from "@/lib/cx";
import type { Guide, GuideTone } from "@/lib/guide";

/** The four lines under the title, from a guide. */
export type WaitLines = { time: string; need: string; leave: string; canLeave: boolean; money: string };

export type Wait = {
  /** a stable name for the state, e.g. "reading"; written on the bill for tests and tools */
  id: string;
  tone: GuideTone;
  kicker?: string;
  title: string;
  body?: React.ReactNode;
  lines?: WaitLines;
  /** browser-clock seconds when the wait began: an elapsed counter runs from it */
  since?: number;
  /** seconds left on the contract's clock: a countdown in place of the elapsed counter */
  left?: number;
  leftLabel?: string;
  link?: { href: string; label: string };
  action?: React.ReactNode;
  /** anything shown between the title and the lines */
  scene?: React.ReactNode;
};

/** A guide from lib/guide.ts as a bill, with what only the page has: the button, the link, the counter's start. */
export function waitOf(g: Guide, extra: Pick<Wait, "action" | "link" | "since" | "scene"> = {}): Wait {
  return {
    id: g.id,
    tone: g.tone,
    kicker: g.kicker,
    title: g.now,
    body: g.note || undefined,
    lines: { time: g.time, need: g.need, leave: g.leave, canLeave: g.canLeave, money: g.money },
    left: g.left !== undefined && g.left > 0 ? g.left : undefined,
    leftLabel: g.leftLabel,
    ...extra,
  };
}

/** "0:42", "12:05", "1:02:09"; longer than a day, "2 d 3 h". */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  if (d > 0) {
    const h = Math.floor((s % 86400) / 3600);
    return h ? `${d} d ${h} h` : `${d} d`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

const TOP: Record<GuideTone, string> = {
  busy: "border-t-mustard",
  waiting: "border-t-ink",
  ready: "border-t-red",
  alert: "border-t-mustard",
  done: "border-t-ink-3",
};

export function WaitBill({ wait, className }: { wait: Wait; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const wall = useWallNow();

  React.useEffect(() => {
    const el = ref.current;
    if (wait.tone !== "busy" || !el || typeof el.scrollIntoView !== "function") return;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [wait.id, wait.tone]);

  const tone = wait.tone;
  const counter =
    wait.left !== undefined
      ? { text: clockText(wait.left), label: wait.leftLabel ?? "left" }
      : wait.since && wall
        ? { text: clockText(wall - wait.since), label: "elapsed" }
        : null;
  const lines = wait.lines;

  return (
    <div ref={ref} data-wait={wait.id} className={cx("bill scroll-mt-4 scroll-mb-4 border-t-[7px]", TOP[tone], className)}>
      <div className="px-4 pt-3 pb-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0" role="status" aria-live="polite" aria-atomic="true">
            <p className={cx("kicker flex items-center gap-1.5", tone === "ready" ? "text-red-deep" : tone === "alert" || tone === "busy" ? "text-mustard-deep" : "text-ink-3")}>
              {tone === "done" ? <IconCheck size={15} /> : tone === "alert" ? <IconAlert size={15} /> : <IconTicket size={15} />}
              {wait.kicker}
            </p>
            <p className="display mt-1.5 text-[20px] leading-[1.15] text-ink sm:text-[22px]">{wait.title}</p>
          </div>
          {counter && (
            <div className="counter shrink-0 px-2.5 py-1.5 text-right">
              <p className="text-[22px] leading-none tabular-nums">{counter.text}</p>
              <p className="mt-0.5 text-[10px] tracking-[0.12em] text-sheet/75 uppercase">{counter.label}</p>
            </div>
          )}
        </div>
        {wait.scene && <div className="mt-3">{wait.scene}</div>}
        {wait.body && <div className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{wait.body}</div>}
        {lines && (
          <dl className="mt-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 text-[14.5px] leading-[1.45]">
            <Line label="How long">{lines.time}</Line>
            <Line label="From you" strong>
              {lines.need}
            </Line>
            <Line label="Leave?" warn={!lines.canLeave}>
              {lines.leave}
            </Line>
            <Line label="Money">{lines.money}</Line>
          </dl>
        )}
        {(wait.action || wait.link) && (
          <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2">
            {wait.action}
            {wait.link && (
              <a href={wait.link.href} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1 text-[13.5px] text-ink-2">
                {wait.link.label}
                <IconExternal size={12} />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Line({ label, children, strong, warn }: { label: string; children: React.ReactNode; strong?: boolean; warn?: boolean }) {
  return (
    <>
      <dt className="mono border-t-[1.5px] border-dotted border-ink-3 pt-1.5 pb-1 text-[12px] font-bold tracking-[0.1em] whitespace-nowrap text-ink-3 uppercase">{label}</dt>
      <dd className={cx("min-w-0 border-t-[1.5px] border-dotted border-ink-3 pt-1.5 pb-1", strong ? "font-semibold text-ink" : warn ? "font-semibold text-red-deep" : "text-ink-2")}>{children}</dd>
    </>
  );
}
