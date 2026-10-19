// One-click suggestions for every field a visitor types into, so nothing on the site needs typing.
// Every value here is inside the contract's limits; tests/unit/suggestions.test.mjs checks each one
// against lib/rules.ts. The notice chips carry what the network should make of each page against the
// demo festival's terms, so a visitor can try every finding on purpose. All names are fictional.

import { DEMO_TERMS, NOTICES } from "./demo-event.ts";
import { REVIEW_FEE, type Finding, type Terms } from "./rules.ts";

const GEN = 10n ** 18n;

export type Chip<T> = { label: string; value: T; tag?: string };

/** Event names an organizer can pick (none of them is the demo festival's name). */
export const NAME_CHIPS: string[] = ["Kestrel Bay Folk Night", "Copper Lane Jazz Night", "Lantern Square Comedy Club", "Northfield Brass Band Gala", "Driftwood Poetry Evening"];

export const DATE_CHIPS: string[] = ["14 June 2027", "21 October 2026", "2 November 2026", "Saturday 5 December 2026"];

export const VENUE_CHIPS: string[] = ["Saltmarsh Pier Arena", "Kestrel Bay Boathouse", "The Copper Lane Rooms", "Old Ropeworks hall"];

export const ACT_CHIPS: string[] = ["The Lantern Tides", "Maple & Ash Quartet", "The Tidewater Choir", "Northbound Static"];

export const DETAILS_CHIPS: Chip<string>[] = [
  { label: "Doors 18:00, support Copper Gulls", value: "Doors open at 18:00. Support act: Copper Gulls. One night only." },
  { label: "Doors 19:30, seated", value: "Doors 19:30. Seated." },
  { label: "Standing, support Fen Lanterns", value: "Doors 18:00. Standing. Support: Fen Lanterns." },
  { label: "None", value: "" },
];

/** Whole sets of terms: the demo festival's (the pinned notices talk about it), and two more. */
export const TERMS_CHIPS: { label: string; note: string; terms: Terms }[] = [
  { label: "The festival in the notices", note: "the demo notices are about exactly these terms", terms: DEMO_TERMS },
  { label: "A jazz night", note: "the notices are about another event: every one reads as minor", terms: { date: "2 November 2026", venue: "The Copper Lane Rooms", main_act: "Maple & Ash Quartet", details: "Doors 19:30. Seated." } },
  { label: "A folk night", note: "the notices are about another event: every one reads as minor", terms: { date: "21 October 2026", venue: "Kestrel Bay Boathouse", main_act: "The Tidewater Choir", details: "Doors 18:00. Standing. Support: Fen Lanterns." } },
];

/** Site prefixes that are not anybody's real site: the contract takes them, but a review of a page below them cannot be read. */
export const EXAMPLE_PREFIXES: Chip<string>[] = [
  { label: "kestrelbay.example", value: "https://kestrelbay.example/2026/notices/", tag: "for show: not fetchable" },
  { label: "copperlane.example", value: "https://copperlane.example/jazz/notices/", tag: "for show: not fetchable" },
];

export const PRICE_CHIPS: Chip<bigint>[] = [
  { label: "0.05 GEN", value: GEN / 20n },
  { label: "0.5 GEN", value: GEN / 2n },
  { label: "1 GEN", value: GEN },
  { label: "5 GEN", value: 5n * GEN },
];

export const CAPACITY_CHIPS: Chip<number>[] = [
  { label: "2", value: 2 },
  { label: "40", value: 40 },
  { label: "120", value: 120 },
  { label: "500", value: 500 },
];

/** How far ahead the start is, in seconds after the moment the form is sent. */
export const START_CHIPS: Chip<number>[] = [
  { label: "In 2 hours", value: 2 * 3600 },
  { label: "In 6 hours", value: 6 * 3600 },
  { label: "Tomorrow", value: 86400 },
  { label: "In a week", value: 7 * 86400 },
  { label: "In 30 days", value: 30 * 86400 },
];

export const DEPOSIT_CHIPS: Chip<bigint>[] = [
  { label: "0.01 GEN", value: REVIEW_FEE, tag: "1 review" },
  { label: "0.05 GEN", value: 5n * REVIEW_FEE, tag: "5 reviews" },
  { label: "0.1 GEN", value: 10n * REVIEW_FEE, tag: "10 reviews" },
];

export type NoticeChip = Chip<string> & { expect: Finding | "another event" };

/**
 * The notice pages below an event's site prefix, by the names the demo folder uses: what each should
 * read as against the demo festival's terms, or "another event" against any other terms.
 */
export function noticeChips(prefix: string, terms: { date: string; venue: string; main_act: string }): NoticeChip[] {
  const same = terms.date === DEMO_TERMS.date && terms.venue === DEMO_TERMS.venue && terms.main_act === DEMO_TERMS.main_act;
  return NOTICES.map((n) => ({ label: n.title, value: prefix + n.file, expect: same ? n.expect : "another event", tag: same ? n.expect : "minor: another event" }));
}
