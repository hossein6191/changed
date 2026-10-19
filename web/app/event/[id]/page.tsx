"use client";

// Any event by its id: the same wall as the demo festival's. On a demo festival the demo organizer's
// announcements show too.

import { useParams, useRouter } from "next/navigation";

import { EventView } from "@/components/event-view";
import { StubLink } from "@/components/stub-button";
import { useDemoStatus } from "@/components/use-demo";
import { parseEventId } from "@/lib/rules";

export default function EventPage() {
  const params = useParams<{ id: string }>();
  const id = parseEventId(String(params?.id ?? ""));
  const { status } = useDemoStatus();
  const router = useRouter();
  if (!id)
    return (
      <div className="bill max-w-2xl p-5">
        <h1 className="text-[34px] uppercase">That is not an event id</h1>
        <p className="mt-2 text-ink-2">Events are E1, E2 and so on. The ledger lists every one.</p>
        <StubLink href="/ledger" tone="ink" className="mt-4">
          The ledger
        </StubLink>
      </div>
    );
  return <EventView key={id} id={id} demo={status} onReopened={(e) => router.push(`/event/${e}`)} />;
}
