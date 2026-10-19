// The Changed mark: a poster-red ticket stub with its notches and a dashed tear line, its top right
// corner bent back to show the mustard underside. One drawing, used by the header (components/logo.tsx),
// the browser icon (app/icon.svg), the app icon and the share card.

export const INK = "#141414";
export const RED = "#E63946";
export const MUSTARD = "#E9C46A";
export const PAPER = "#F4F0E6";

/** The mark as SVG markup on a 32-unit grid. `tile` draws it on a newsprint rounded square. */
export function markSvg({ size = 32, tile = false }: { size?: number; tile?: boolean } = {}): string {
  const back = tile ? `<rect x="0" y="0" width="32" height="32" rx="7" fill="${PAPER}"/>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">` +
    back +
    // the stub: notched at both ends, its top right corner cut where it bends
    `<path d="M3 8H24L29 13V14A2 2 0 0 0 29 18V24H3V18A2 2 0 0 0 3 14Z" fill="${RED}"/>` +
    // the bent corner, its underside showing
    `<path d="M24 8V13H29Z" fill="${MUSTARD}"/>` +
    `<path d="M24 8V13H29" fill="none" stroke="${INK}" stroke-width="0.9" stroke-linejoin="round"/>` +
    // the tear line and the stub's punch hole
    `<path d="M11 9.6V22.4" stroke="${PAPER}" stroke-width="1.3" stroke-dasharray="1.6 1.5"/>` +
    `<circle cx="7" cy="16" r="1.6" fill="${PAPER}"/>` +
    // two lines of type on the ticket
    `<rect x="14" y="14.2" width="8" height="1.7" fill="${PAPER}"/>` +
    `<rect x="14" y="18" width="11.5" height="1.7" fill="${PAPER}"/>` +
    `</svg>`
  );
}

/** The mark as a data URI, for next/og images. */
export const markDataUri = (opts: { size?: number; tile?: boolean } = {}): string => "data:image/svg+xml;base64," + Buffer.from(markSvg(opts)).toString("base64");
