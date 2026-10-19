"use client";

// The demo festival: whichever Harbour Lights Festival the demo organizer has on sale now, with its
// "What the organizer announces next" buttons, so one visitor's wallet can try everything as a fan.
// When there is none yet (or the demo organizer is away), the page says exactly why, and offers the
// button that opens one when it can.

import * as React from "react";

import { EventView } from "@/components/event-view";
import { Placeholder } from "@/components/read-state";
import { StubButton } from "@/components/stub-button";
import { TxRail } from "@/components/tx-rail";
import { useDemoStatus } from "@/components/use-demo";
import { WaitBill, waitOf } from "@/components/wait-bill";
import { forgetDemoStatus, isMock, openedEvent, requestDemoReopen } from "@/lib/chain";
import { demoGuide } from "@/lib/guide";
import type { DemoStatus } from "@/lib/types";

export default function DemoEventPage() {
  const { status, refresh } = useDemoStatus();
  const [opened, setOpened] = React.useState("");
  const onReopened = React.useCallback(
    (event: string) => {
      setOpened(event);
      forgetDemoStatus();
      void refresh();
    },
    [refresh],
  );
  const demo: DemoStatus | null = status && opened ? { ...status, event: opened, eventState: "open" } : status;
  const id = demo?.event ?? "";
  return (
    <div>
      <header className="mb-7 max-w-3xl">
        <p className="kicker text-red-deep">The demo festival · played by the demo organizer</p>
        <h1 className="mt-1 text-[clamp(34px,7vw,56px)] uppercase">Buy a ticket. Watch the notices.</h1>
        <p className="mt-3 text-[16.5px] text-ink-2">
          A throwaway organizer runs the Harbour Lights Festival, on sale for six hours at a time, its notices pinned to one commit so every validator reads the same bytes. Buy a ticket
          with your own wallet, press one of its announcements, and see whether your money comes back.
        </p>
      </header>
      {!demo ? (
        <Placeholder lines={6} />
      ) : (
        <>
          {!demo.online && (
            <p role="status" className="mb-6 border-2 border-ink bg-mustard px-4 py-3 text-[15px]">
              <strong>The demo organizer is away:</strong> {demo.reason || "the site's server did not say why"}.
              {id ? " The event below can still be read, bought and reviewed with your own wallet and credit." : ""}
            </p>
          )}
          {id ? <EventView key={id} id={id} demo={demo} onReopened={onReopened} /> : demo.online ? <FirstOpen onOpened={onReopened} /> : null}
        </>
      )}
    </div>
  );
}

/** No demo festival yet: one button, and the transaction that opens it. */
function FirstOpen({ onOpened }: { onOpened: (event: string) => void }) {
  const [state, setState] = React.useState<{ kind: "idle" } | { kind: "asking" } | { kind: "failed"; reason: string } | { kind: "sent"; hash: string }>({ kind: "idle" });
  const open = async () => {
    setState({ kind: "asking" });
    const answer = await requestDemoReopen();
    setState(answer.ok ? { kind: "sent", hash: answer.hash } : { kind: "failed", reason: answer.reason });
  };
  if (state.kind === "asking" || state.kind === "failed")
    return (
      <WaitBill
        wait={waitOf(demoGuide({ state: state.kind === "asking" ? "reopening" : "failed", what: "open a fresh demo festival", event: "the demo festival", reason: state.kind === "failed" ? state.reason : undefined, mock: isMock }), {
          action:
            state.kind === "failed" ? (
              <StubButton size="sm" tone="paper" onClick={() => setState({ kind: "idle" })}>
                Back
              </StubButton>
            ) : undefined,
        })}
      />
    );
  if (state.kind === "sent")
    return (
      <TxRail
        hash={state.hash}
        label="The demo organizer opens the Harbour Lights Festival"
        onDone={(s) => {
          const e = openedEvent(s);
          if (e) onOpened(e);
        }}
      />
    );
  return (
    <div className="bill max-w-2xl border-t-[7px] border-t-mustard p-5">
      <p className="display text-[24px] uppercase">No demo festival is on sale yet</p>
      <p className="mt-2 text-ink-2">The demo organizer opens one in a single transaction, on sale for six hours. It costs you nothing.</p>
      <StubButton className="mt-4" tone="mustard" onClick={() => void open()}>
        Open the demo festival
      </StubButton>
    </div>
  );
}
