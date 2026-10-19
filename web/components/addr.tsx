// An address as the site prints it: short, in the typewriter face, linked to the explorer, with the
// whole of it in the title. "(you)" when it is the connected account.

import { addressUrl } from "@/lib/chain";
import { short } from "@/lib/format";
import { cx } from "@/lib/cx";

export function Addr({ address, me, className }: { address: string; me?: string; className?: string }) {
  if (!address) return <span className={cx("text-ink-3", className)}>nobody</span>;
  const mine = !!me && me.toLowerCase() === address.toLowerCase();
  return (
    <a href={addressUrl(address)} target="_blank" rel="noreferrer" title={address} className={cx("mono link text-[14px]", className)}>
      {short(address)}
      {mine && <span className="ml-1 font-sans text-xs font-bold text-red-deep">(you)</span>}
    </a>
  );
}
