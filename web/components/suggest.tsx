"use client";

// A row of one-click suggestions under a field: press one and the field is filled with it. A chip may
// carry a small tag of what the network should make of it.

import { cx } from "@/lib/cx";

export function Suggest<T>({
  label,
  chips,
  onPick,
  isOn,
  className,
}: {
  label: string;
  chips: { label: string; value: T; tag?: string }[];
  onPick: (value: T) => void;
  isOn?: (value: T) => boolean;
  className?: string;
}) {
  return (
    <div className={cx("mt-2 flex flex-wrap items-center gap-1.5", className)} role="group" aria-label={label}>
      {chips.map((c, i) => {
        const on = isOn?.(c.value) ?? false;
        return (
          <button key={i + ":" + c.label} type="button" aria-pressed={isOn ? on : undefined} onClick={() => onPick(c.value)} className="chip">
            <span className="min-w-0">{c.label}</span>
            {c.tag && <span className="mono bg-paper-2 px-1.5 text-[11.5px] font-normal text-ink-2">{c.tag}</span>}
          </button>
        );
      })}
    </div>
  );
}
