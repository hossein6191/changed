"use client";

// One write, from the wallet prompt to the final line, in one place: while the wallet asks, the sign
// bill; while the transaction goes through, the page's own waiting bill (lib/guide.ts) above the
// ticket rail with its explorer link; once it is final, the rail's last line; and a wallet error in
// words a person can act on. Every page that sends anything renders its writes through this.

import * as React from "react";

import { TxRail } from "@/components/tx-rail";
import type { TxRun } from "@/components/use-tx";
import { WaitBill, waitOf } from "@/components/wait-bill";
import type { Guide } from "@/lib/guide";
import type { TxStatus } from "@/lib/types";

export function TxStage({
  tx,
  sign,
  sending,
  label,
  judged,
  onStatus,
  className,
}: {
  tx: TxRun;
  /** the wallet-prompt guide for this call */
  sign: Guide;
  /** the guide while it goes through */
  sending: Guide;
  /** what the rail calls it */
  label: string;
  judged?: boolean;
  onStatus?: (s: TxStatus) => void;
  className?: string;
}) {
  if (tx.sending)
    return (
      <div className={className}>
        <WaitBill wait={waitOf(sign)} />
      </div>
    );
  if (tx.error)
    return (
      <p role="alert" className={`border-2 border-red-deep bg-red-wash px-3 py-2 text-sm text-red-deep ${className ?? ""}`}>
        {tx.error}
      </p>
    );
  if (!tx.hash) return null;
  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      {!tx.final && <WaitBill wait={waitOf(sending, { since: tx.at || undefined })} />}
      <TxRail hash={tx.hash} label={label} judged={judged} onDone={tx.onDone} onStatus={onStatus} />
    </div>
  );
}
