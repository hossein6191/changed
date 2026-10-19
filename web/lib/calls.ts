// One builder per write method of the contract: the method's name, its arguments in the contract's
// order, and the value sent. Pure, so tests/unit/interface.test.mjs checks every builder against the
// signatures in contracts/changed.py with no browser and no network.

import type { Call } from "./types.ts";

const int = (n: number): number => Math.trunc(n);

export const calls = {
  /** open_event(name, terms_json, site_prefix, price, capacity, starts_at): anyone; the sender is the organizer. The price travels as digits. */
  openEvent: (name: string, termsJson: string, sitePrefix: string, priceAtto: bigint, capacity: number, startsAt: number): Call => ({
    fn: "open_event",
    args: [name, termsJson, sitePrefix, priceAtto.toString(), int(capacity), int(startsAt)],
  }),
  /** cancel(event_id): the organizer, before the start. Every holder may take its money back. */
  cancel: (event: string): Call => ({ fn: "cancel", args: [event] }),
  /** buy(event_id), payable: exactly the price. A refused purchase returns what was sent in the same transaction. */
  buy: (event: string, priceAtto: bigint): Call => ({ fn: "buy", args: [event], value: priceAtto }),
  /** refund(ticket_id): the holder, once the event changed, until seven days after its start. */
  refund: (ticket: string): Call => ({ fn: "refund", args: [ticket] }),
  /** settle(ticket_id): anyone, once the ticket can go nowhere but to the organizer. */
  settle: (ticket: string): Call => ({ fn: "settle", args: [ticket] }),
  /** deposit(), payable: the value sent becomes the sender's review credit. */
  deposit: (valueAtto: bigint): Call => ({ fn: "deposit", args: [], value: valueAtto }),
  /** withdraw(): the sender takes back all of its review credit. */
  withdraw: (): Call => ({ fn: "withdraw", args: [] }),
  /** review(event_id, url): anyone with credit; every validator fetches the page and reads it in the same call. */
  review: (event: string, url: string): Call => ({ fn: "review", args: [event, url] }),
};
