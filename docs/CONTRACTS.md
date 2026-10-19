# Contracts

One file, `contracts/changed.py`. It is the only thing in this repository that
asks the network anything.

## contracts/changed.py

### Purpose

Ticket escrow for an event whose material terms (the date, the venue, the
main act) are fixed when it opens. The ticket money is held until the event is
over. Anyone with review credit may ask the network to read a notice on the
organizer's own website; if the network agrees the notice moves a material
term, postpones or cancels the event, every holder can take its money back. Otherwise the
money goes to the organizer a day after the start.

### Consensus

One kind of round, `review(event, url)`: one `gl.vm.run_nondet_unsafe(leader_fn,
validator_fn)` block with all its work inside the leader closure. The
validator closure is `return _agrees(leaders_res, leader_fn)`: it refuses a
leader that raised or returned anything but a dict, runs the leader's work
itself inside `try/except` (its own failure is a disagreement), and compares
the whole value by exact equality.

Inputs: the TERMS text, built from the stored event (`Event: <name>`, `Date:`,
`Venue:`, `Main act:`, `Other details, not material:`, one line each), and the
page address. The leader closure:

1. One request, `got = gl.nondet.web.get(url)`; a failure raises
   `[TRANSIENT]`, and so does any status outside 200 to 299. The body judged
   is `got.body`, the body of the answer whose status was read. There is no
   second request (`render` is never called), so a rate limit or an error page
   met by a later request cannot be judged as a notice.
2. `_decoded`: the first `MAX_RAW_BYTES` = 128,000 bytes read as UTF-8, a bad
   byte as the replacement character. `_visible`: over the first
   `MAX_RAW_PAGE` = 32,000 characters, every tag becomes a space and the text
   after a script or style tag is dropped. `_page_text`: whitespace collapsed,
   the first `MAX_PAGE_TEXT` = 6,000 kept. A page that reads as nothing raises
   `[TRANSIENT]`.
3. Four `gl.nondet.exec_prompt` calls: `_changed_task` with the TERMS block
   first and with the PAGE block first, then `_holds_task` in the same two
   orders. A failed call raises `[LLM_ERROR]`.
4. `_read_word` reads each answer into `yes`, `no`, `unclear` or `""` (the
   `"answer"` field of a JSON object, a JSON boolean, or a short bare word;
   anything else is `""`). `_combine` gives `material` only for CHANGED yes,
   yes and HOLDS no, no; `minor` only for CHANGED no, no and HOLDS yes, yes;
   `unclear` for the other 254 combinations.
5. Returns `{"finding": <word>, "fp": <first 16 hex of sha256 of the judged
   page>}`.

`_clean_value` reads the agreed value back into the closed set; a value
without a well-formed fingerprint is `unclear`.

Each prompt is: a header saying which terms are material, the untrusted
declaration, a line saying the blocks' order carries no meaning, the two
blocks, the reading rule, the definition of "takes place as the TERMS describe
it" (that date, that venue, that main act; a postponement or a cancellation
does not), the question, what yes and no mean, and the answer shape. Each
question asks one thing: CHANGED, "Does the PAGE say that the event will not
take place as the TERMS describe it?", and HOLDS, its exact negation, "Going
by the PAGE, will the event still take place as the TERMS describe it?". Every block body is `_fence(text)[:cap]`, between `<<<LABEL tag>>>` and
`<<<END LABEL tag>>>` where the tag is the first 16 hex of the body's own
sha256; a label outside `TERMS` and `PAGE` prints as `BLOCK`. The TERMS cap is
the longest terms text the door lets in, so nothing an organizer wrote is ever
cut. The longest prompt is under 10,000 characters.

### State

| field | what it holds |
|---|---|
| `event_rows` | `Event`: organizer, name, date, venue, main_act, details, site_prefix, price, capacity, starts_at, opened_at, status (`on` or `changed`), changed_by (`""`, `review`, `organizer`), changed_at, change_review, sold, held, and the public record: n_refunded, refunded, n_settled, settled, n_reviews, n_material, n_minor, n_unclear, n_repeats, fees_won |
| `ticket_rows` | `Ticket`: event_id, holder, n (its number within the event), price, bought_at, status (`valid`, `refunded`, `settled`), closed_at |
| `review_rows` | `Review`: event_id, reviewer, url, finding, fp, fee_to (`reviewer` or `organizer`), holder (whether the reviewer had bought a ticket to the event), repeat_of (the earlier review of the same text, whose finding this one carries; `""` for a first reading), at |
| `seen` | `"<event>|<fp>"` -> the review that first read that text: each text once per event, under any address |
| `free_unclear` | `"<event>|<address>"` -> the one unclear reading of that event that cost that holder nothing |
| `bought` | `"<event>|<address>"` -> how many tickets that address bought to that event |
| `balances` | `<address>` -> review credit |
| `index`, `counts` | numbered lists: `organizer:<address>` (events), `holder:<address>` (tickets), `event:<id>` (tickets), `reviews:<id>` (reviews), each appended in O(1) and read a page at a time |
| totals | `held_total`, `sales_total`, `refunded_total`, `to_organizers`, `credit_total`, `deposited_total`, `credit_out`, `fees_total`, `returned`, `n_refused`, and the counters behind `stats()` |

Storage dataclasses hold scalars only. Every instant is seconds on the message
clock, `gl.message_raw["datetime"]`, read with an integer-only calendar.

### Methods

| method | kind | does |
|---|---|---|
| `open_event(name, terms_json, site_prefix, price, capacity, starts_at)` | write, open | a new event `E<n>`, the sender its organizer |
| `cancel(event)` | write, organizer | before the start, while on: the event becomes changed |
| `buy(event)` | payable | exactly the price, before the start, while on and not sold out, never the organizer: a new ticket `T<n>`, the price into escrow |
| `refund(ticket)` | write, holder | a changed event, until `starts_at + 7 days`: the price back to the holder |
| `settle(ticket)` | write, open | from `starts_at + 1 day` (an event that never changed) or `starts_at + 7 days` (a changed one): the price to the organizer |
| `deposit()` | payable, open | adds the value to the sender's credit |
| `withdraw()` | write, open | pays all of the sender's credit back |
| `review(event, url)` | write, open | one consensus round; material changes the event; a text already read for the event is a repeat, whose earlier finding stands and whose fee goes to the organizer; otherwise the fee follows the money table |
| `event`, `events`, `events_of`, `ticket`, `tickets_of`, `event_tickets`, `reviews_of`, `credit`, `stats`, `rules` | views | ids, small numbers or one address in; pages of at most 20 out |

Every payout leaves through `_close_ticket` (a ticket's price, to its holder or
to the organizer), `review` (one fee to the organizer), `withdraw` (the
sender's own credit) or `_refuse` (a refused payable call's value). Each is
O(1). `buy` and `deposit` never raise and never reach the model: every refusal
goes through `_refuse`, which sends the value back. The event's status moves
only through `_change`, called by `review` on a material finding and by
`cancel`.

### Loops

Every loop is bounded by a named constant, and a static test lists each one:
the three term keys (`TERM_KEYS`, after the caller JSON is measured against
`MAX_TERMS_JSON` and its keys counted), the URL signs (`URL_SIGNS`), the
fingerprint's characters (`FP_CHARS`), the pieces of a fetched page between
its tags (`MAX_RAW_PAGE`: the page is cut before it is split), and every list
page (`PAGE`, in
`_page`, `events`, `events_of`, `tickets_of`, `event_tickets` and
`reviews_of`). There is no `while`.

### Errors

| class | when | stored |
|---|---|---|
| `[EXPECTED]` | a rule of this contract, raised by a write that took no value | nothing |
| `[TRANSIENT]` | the page could not be fetched, answered anything but a 2xx, or read as nothing | nothing; no fee |
| `[LLM_ERROR]` | a model call failed | nothing; no fee |
| `{"ok": false}` | a refused `buy` or `deposit`; everything sent goes back | the refusal is counted |

### Limits

Price 0.05 to 50 GEN; capacity 1 to 500; the start 1 hour to 400 days after
opening. Review fee 0.01 GEN of credit. Reviews until a day after the start;
refunds until seven days after it. Name 3 to 80 characters, each term 3 to
120, details up to 300, terms JSON up to 1,200, all printable ASCII on one
line. Site prefix `https`, at most 120 characters, ending in `/`; a reviewed
address at most 200, below the prefix. The first 128,000 bytes of a page's
body are decoded, the tags of the first 32,000 characters removed, the rest
collapsed and the first 6,000 of that judged. The page must read the same for
every validator at the moment of the review; text is read, images and scripts
are not. See the README for the full list.
