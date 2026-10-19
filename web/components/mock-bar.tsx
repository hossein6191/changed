"use client";

// Mock mode only. There is no wallet and no chain: the visitor acts as one of the demo accounts of the
// in-memory contract, and this strip says so on every page, lets them change account, gives test GEN,
// moves the clock on so a start, a settle window or the end of the refunds can be seen, and can make
// the next reading split the way validators whose answers disagree would, so unclear can be seen.

import { useLocal } from "@/components/use-local";
import { PERSONAS, advanceClock, mockAddress, mockBalanceText, mockClockOffset, mockSplitNext, setMockPersona, setMockSplitNext } from "@/lib/chain-mock";
import { faucet } from "@/lib/chain";
import { gen, span } from "@/lib/format";

const small = "h-8 border-2 border-ink bg-sheet px-2 text-xs font-bold hover:bg-mustard-wash active:translate-y-px";

export function MockBar() {
  const address = useLocal(mockAddress, PERSONAS[0].address);
  const balance = useLocal(() => mockBalanceText(mockAddress()), "0");
  const offset = useLocal(mockClockOffset, 0);
  const split = useLocal(mockSplitNext, false);
  return (
    <div className="border-b-2 border-dashed border-ink bg-mustard">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-2 px-4 py-2 text-xs xl:flex-row xl:items-center xl:justify-between">
        <p>
          <strong className="font-bold">Demo build.</strong> An in-memory copy of the contract. No page is fetched and no model is asked here: the eight demo notices are read as
          the demo expects, where on chain every validator reads for itself. A reload starts again.
        </p>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <label htmlFor="mock-persona" className="shrink-0 font-bold">
            Acting as
          </label>
          <select id="mock-persona" value={address} onChange={(e) => setMockPersona(e.target.value)} className="h-8 max-w-full min-w-0 border-2 border-ink bg-sheet px-1.5 text-xs">
            {PERSONAS.map((p) => (
              <option key={p.address} value={p.address}>
                {p.name}: {p.note}
              </option>
            ))}
          </select>
          <span className="mono font-bold whitespace-nowrap">{gen(balance)}</span>
          <button type="button" onClick={() => void faucet(address)} className={small}>
            +10 GEN
          </button>
          <button type="button" onClick={() => advanceClock(3600)} className={small}>
            Clock +1 h
          </button>
          <button type="button" onClick={() => advanceClock(6 * 3600)} className={small}>
            +6 h
          </button>
          <button type="button" onClick={() => advanceClock(86400)} className={small}>
            +1 day
          </button>
          <button type="button" onClick={() => advanceClock(7 * 86400)} className={small}>
            +7 days
          </button>
          <button type="button" aria-pressed={split} onClick={() => setMockSplitNext(!split)} className={small + (split ? " bg-ink text-sheet hover:bg-ink" : "")}>
            {split ? "Next reading splits: on" : "Make the next reading split"}
          </button>
          {offset > 0 && <span className="text-ink-2">clock moved on {span(offset)}</span>}
        </div>
      </div>
    </div>
  );
}
