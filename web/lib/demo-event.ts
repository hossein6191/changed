// The demo event and the demo organizer who runs it, so one visitor's wallet can try everything as a fan.
//
// The Harbour Lights Festival is opened by a throwaway Studio key the site's server holds
// (DEMO_ORGANIZER_KEY; tools/open-demo-event.mjs, or POST /api/demo/reopen), with its site prefix set to
// the notices/ folder of the public repository pinned to one commit on raw.githubusercontent.com, so
// every validator fetches the same bytes. Its tickets go on sale with a start six hours away, so the
// whole life of a ticket fits in a visit; once it starts, sells out or changes, the next visitor opens
// a fresh one. When a visitor presses one of the "What the organizer announces next" buttons, the demo
// organizer asks the network to read that FIXED notice page, from its own review credit. Nothing a
// visitor types ever passes through it. Every festival, venue, band and person here is fictional.
// Pure, so node runs it in tests/unit.

import { AFTER_START, ATTO, MAX_PREFIX, prefixProblem, termsJson, type EventStatus, type Finding, type Terms } from "./rules.ts";
import type { DemoEventState } from "./types.ts";

export const DEMO_EVENT_NAME = "Harbour Lights Festival";

/** The terms the demo event's tickets are sold on: the ones the notices talk about. */
export const DEMO_TERMS: Terms = {
  date: "14 June 2027",
  venue: "Saltmarsh Pier Arena",
  main_act: "The Lantern Tides",
  details: "Doors open at 18:00. Support act: Copper Gulls. One night only.",
};
export const DEMO_TERMS_JSON = termsJson(DEMO_TERMS);

/** 0.5 GEN a ticket, 500 tickets, on sale until six hours after it opens. */
export const DEMO_PRICE = ATTO / 2n;
export const DEMO_CAPACITY = 500;
export const DEMO_LEAD = 6 * 3600;

/** The review credit the demo organizer keeps for its notice buttons, and how much it adds when it runs low. */
export const DEMO_CREDIT_LOW = ATTO / 50n;
export const DEMO_CREDIT_TOP_UP = ATTO / 5n;

export type NoticeKey = "event" | "doors-later" | "new-support" | "new-date" | "new-venue" | "headliner" | "cancelled" | "postponed";

export type Notice = {
  key: NoticeKey;
  file: string;
  /** the button and the slip */
  title: string;
  /** what the page says, in one line */
  says: string;
  /** what the network should agree it is, against the demo terms */
  expect: Finding;
  /** why, in one line */
  why: string;
  /**
   * The contract's fingerprint of the page: the first 16 hex characters of the sha256 of its text with
   * the tags removed and the spacing collapsed (tests/unit/demo.test.mjs recomputes it from notices/,
   * and asks contracts/changed.py itself). On chain every validator fingerprints what it fetched.
   */
  fp: string;
};

/** Every page in notices/: the listing, two notices that leave the terms standing and five that do not. */
export const NOTICES: Notice[] = [
  { key: "event", file: "event.html", title: "The original listing", says: "14 June 2027, Saltmarsh Pier Arena, The Lantern Tides", expect: "minor", why: "it repeats the terms the tickets were sold on", fp: "c69e2baa9f49d3bc" },
  { key: "doors-later", file: "doors-later.html", title: "Doors open 30 minutes later", says: "doors at 18:30 instead of 18:00; nothing else changes", expect: "minor", why: "door times are a detail, not a material term", fp: "0ac37d5537e8f889" },
  { key: "new-support", file: "new-support.html", title: "A new support act", says: "Velvet Driftwood replaces Copper Gulls as the support act", expect: "minor", why: "the support act is a detail; the main act stays", fp: "cb4474cbde0ce2e8" },
  { key: "new-date", file: "new-date.html", title: "Moved to 21 June 2027", says: "a new date, same venue, same main act", expect: "material", why: "the date is a material term", fp: "c79ffa3206b27edc" },
  { key: "new-venue", file: "new-venue.html", title: "Moved to the Old Ropeworks hall", says: "a new venue, same date, same main act", expect: "material", why: "the venue is a material term", fp: "32343235c4527598" },
  { key: "headliner", file: "headliner.html", title: "A new main act", says: "The Lantern Tides withdraw; Northbound Static headline", expect: "material", why: "the main act is a material term", fp: "daf412a3e46827fb" },
  { key: "cancelled", file: "cancelled.html", title: "Cancelled", says: "the festival will not take place", expect: "material", why: "a cancelled show does not take place as described", fp: "5930ec4de3eab7dc" },
  { key: "postponed", file: "postponed.html", title: "Postponed", says: "not on 14 June 2027; a new date later", expect: "material", why: "a postponed show does not take place as described", fp: "5043c0bbc41bd58d" },
];

/** The six things the demo organizer announces when its buttons are pressed, the two minor ones first. */
export const BOT_NOTICE_KEYS = ["doors-later", "new-support", "new-date", "new-venue", "headliner", "cancelled"] as const;
export type BotNoticeKey = (typeof BOT_NOTICE_KEYS)[number];
export const BOT_NOTICES: Notice[] = BOT_NOTICE_KEYS.map((k) => NOTICES.find((n) => n.key === k)!);

export const isBotNoticeKey = (what: string): what is BotNoticeKey => (BOT_NOTICE_KEYS as readonly string[]).includes(what);
export const noticeOf = (key: string): Notice | null => NOTICES.find((n) => n.key === key) ?? null;

/** "owner/name" from a GitHub repository URL; "" when it is not one. */
export function repoOf(url: string): string {
  const m = /^https:\/\/github\.com\/([A-Za-z0-9-]+\/[A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(String(url ?? "").trim());
  return m ? m[1] : "";
}

/** The pinned folder every demo notice address starts with: the demo event's site prefix. */
export const noticesBase = (repo: string, commit: string): string => `https://raw.githubusercontent.com/${repo}/${commit}/notices/`;

/** The pinned address of one notice. */
export const noticeUrl = (repo: string, commit: string, file: string): string => noticesBase(repo, commit) + file;

/** The notice an address names, read from its last segment below a notices/ folder; null for any other address. */
export function noticeOfUrl(url: string): Notice | null {
  const m = /\/notices\/([a-z0-9-]+\.html)$/.exec(String(url ?? ""));
  if (!m) return null;
  return NOTICES.find((n) => n.file === m[1]) ?? null;
}

/** Why the pinned folder cannot be the demo event's site prefix; "" when it can. */
export const baseProblem = (base: string): string => (base.length > MAX_PREFIX ? `the pinned notices folder is ${base.length} characters, more than the contract's ${MAX_PREFIX}; a shorter repository name fits` : prefixProblem(base));

/** True when an event is a demo event: its organizer is the demo key's address and its name is the demo name. */
export function isDemoEvent(e: { organizer: string; name: string }, demoOrganizer: string): boolean {
  return !!demoOrganizer && e.organizer.toLowerCase() === demoOrganizer.toLowerCase() && e.name === DEMO_EVENT_NAME;
}

type DemoRow = { id: string; status: EventStatus; startsAt: number; sold: number; capacity: number };

/** Where the newest demo event stands: still open for sales and notices, or why the next one is due. */
export function demoStateOf(e: DemoRow | null, now: number): DemoEventState {
  if (!e) return "none";
  if (e.status !== "on") return "changed";
  if (now >= e.startsAt) return "started";
  if (e.sold >= e.capacity) return "sold_out";
  return "open";
}

/** Why the demo organizer will not open a fresh event now; "" when it will. */
export function reopenProblem(e: DemoRow | null, now: number): string {
  if (demoStateOf(e, now) !== "open") return "";
  return `the demo event ${e!.id} is still on sale; the next one opens once it starts, sells out or changes`;
}

export type ReadBefore = { id: string; url: string; finding: string };

/**
 * Why the demo organizer will not announce this notice now, in words a visitor can act on; "" when it
 * will. `key` is one of the six notice keys; `before` is what the event's reviews already read. The
 * server asks this of a fresh read before it signs, and so does the mock.
 */
export function demoNoticeProblem(e: (DemoRow & { reviewUntil?: number }) | null, demoEvent: string, key: string, before: ReadBefore[], now: number): string {
  if (!demoEvent) return "the demo event is not open on this contract yet";
  if (!isBotNoticeKey(key)) return "the demo organizer announces only what its buttons say";
  if (!e) return "there is no such event";
  if (e.id !== demoEvent) return `${e.id} is not the demo event; the demo organizer announces notices for ${demoEvent} only`;
  if (e.status !== "on") return `${e.id} has changed and its refunds are open; a changed event reads no more notices, and a fresh demo event opens with the button on its page`;
  if (now >= e.startsAt + AFTER_START) return `reviews of ${e.id} closed a day after its start; a fresh demo event opens with the button on its page`;
  const notice = noticeOf(key)!;
  const read = before.find((r) => r.url.endsWith("/notices/" + notice.file));
  if (read) return `${notice.file} was already read for ${e.id} as ${read.id}, ${read.finding}; that reading stands, and asking again would only be a repeat`;
  return "";
}

// ---- the scripted reader of mock mode -------------------------------------------------------------

/** The contract's own sentence when a page cannot be fetched. */
export const FETCH_FAILED = "[TRANSIENT] the page could not be fetched; nothing was stored, no fee was taken, and the review may be asked again";

const sameTerms = (t: { date: string; venue: string; main_act: string }) => t.date === DEMO_TERMS.date && t.venue === DEMO_TERMS.venue && t.main_act === DEMO_TERMS.main_act;

/**
 * What the in-memory contract of mock mode agrees on for a page, in place of the validators: a demo
 * notice against the demo terms as the demo expects it; against any other terms it is a page about a
 * different event and says nothing about this one (minor); any other address cannot be fetched and
 * stores nothing.
 */
export function scriptedReading(url: string, terms: { date: string; venue: string; main_act: string }): { finding: Finding; fp: string } | { error: string } {
  const n = noticeOfUrl(url);
  if (!n) return { error: FETCH_FAILED };
  return { finding: sameTerms(terms) ? n.expect : "minor", fp: n.fp };
}
