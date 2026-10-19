"use client";

// What stands between a visitor and a signature: a wallet, the Studio chain, and enough test GEN.
// Each missing piece is offered as the one button to press; once all three are there, the action
// itself shows. In mock mode there is no wallet and the gate is open.

import * as React from "react";

import { IconDrop, IconWallet } from "@/components/icons";
import { StubButton } from "@/components/stub-button";
import { useWallet } from "@/components/wallet";
import { isMock } from "@/lib/chain";
import { gen } from "@/lib/format";

export function WalletGate({ need = 0n, children, what = "to sign" }: { need?: bigint; children: React.ReactNode; what?: string }) {
  const w = useWallet();
  const [funding, setFunding] = React.useState(false);
  if (isMock) return <>{children}</>;
  if (!w.address)
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-ink-2">Connect a wallet {what}. Rabby and MetaMask both work; the site adds the Studio test network for you.</p>
        <StubButton icon={<IconWallet size={16} />} disabled={w.connecting} onClick={() => void w.connect()}>
          {w.connecting ? "Connecting…" : "Connect a wallet"}
        </StubButton>
        {w.error && <p className="text-sm text-red-deep">{w.error}</p>}
      </div>
    );
  if (!w.onStudio)
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-ink-2">Your wallet is on another network. This site signs only on GenLayer Studio (chain 61999).</p>
        <StubButton onClick={() => void w.switchToStudio()}>Switch to Studio</StubButton>
      </div>
    );
  if (need > 0n && w.balanceAtto < need)
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-ink-2">
          This needs <span className="mono">{gen(need)}</span> and the wallet holds <span className="mono">{gen(w.balanceAtto)}</span>. Studio&apos;s faucet gives 10 test GEN, free,
          in about half a minute.
        </p>
        <StubButton
          icon={<IconDrop size={16} />}
          disabled={funding}
          onClick={async () => {
            setFunding(true);
            try {
              await w.getTestGen();
            } catch {
              /* the error is in w.error */
            } finally {
              setFunding(false);
            }
          }}
        >
          {funding ? "Waiting for the faucet…" : "Get 10 test GEN"}
        </StubButton>
        {w.error && <p className="text-sm text-red-deep">{w.error}</p>}
      </div>
    );
  return <>{children}</>;
}
