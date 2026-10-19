"use client";

// Whether the demo organizer can act right now, which event it runs, where that event stands, and
// exactly why not (null while asking). `refresh` asks the server again, after a fresh event was opened.

import * as React from "react";

import { readDemoStatus } from "@/lib/chain";
import type { DemoStatus } from "@/lib/types";

export function useDemoStatus(): { status: DemoStatus | null; refresh: () => Promise<void> } {
  const [status, setStatus] = React.useState<DemoStatus | null>(null);
  const live = React.useRef(true);
  React.useEffect(() => {
    live.current = true;
    void readDemoStatus().then((s) => {
      if (live.current) setStatus(s);
    });
    return () => {
      live.current = false;
    };
  }, []);
  const refresh = React.useCallback(async () => {
    const s = await readDemoStatus({ fresh: true });
    if (live.current) setStatus(s);
  }, []);
  return { status, refresh };
}
