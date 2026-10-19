// The mark (a red ticket stub with its corner bent back) and the wordmark, as the header prints them.
// The drawing is lib/mark.ts, the same one the browser icon, the app icon and the share card use.

import { MUSTARD, INK, PAPER, RED } from "@/lib/mark";

export function Mark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <path d="M3 8H24L29 13V14A2 2 0 0 0 29 18V24H3V18A2 2 0 0 0 3 14Z" fill={RED} />
      <path d="M24 8V13H29Z" fill={MUSTARD} />
      <path d="M24 8V13H29" fill="none" stroke={INK} strokeWidth="0.9" strokeLinejoin="round" />
      <path d="M11 9.6V22.4" stroke={PAPER} strokeWidth="1.3" strokeDasharray="1.6 1.5" />
      <circle cx="7" cy="16" r="1.6" fill={PAPER} />
      <rect x="14" y="14.2" width="8" height="1.7" fill={PAPER} />
      <rect x="14" y="18" width="11.5" height="1.7" fill={PAPER} />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <Mark />
      <span className="display text-[27px] leading-none tracking-[0.02em] text-ink uppercase">Changed</span>
    </span>
  );
}
