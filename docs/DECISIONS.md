# Decisions

Why each rule of `contracts/changed.py` is the way it is, and what is verified
and what is not.

## 1. The organizer's own words are the evidence

**The page read is the organizer's, below a prefix the organizer chose when it
opened the event.** A buyer who claims the event changed has an interest; so
does an organizer who says it did not. A notice the organizer published under
its own address is the one statement neither side can disown, and the prefix
is fixed with the terms, so it cannot be moved later. The address must be
strictly below the prefix, uses only letters, digits and `- . _ ~ /`, and has
no empty, `.` or `..` segment, so a path cannot climb out of the directory it
names. The prefix itself must end with `/` so it names a directory, not the
start of any word.

This is also the main limit: the organizer controls what the site says. A
change it never publishes is not caught. The contract enforces what the
organizer announces, which is the case that matters, because a change is
almost always announced: the buyers have to be told where and when to come.

## 2. Two framings, both orders, one block, one condition each

**CHANGED asks whether the page says the event will not take place as the
terms describe it; HOLDS asks, as its exact negation, whether going by the
page it still will.** Each is asked with the terms first and with the page
first, inside one consensus block. `material` needs CHANGED yes twice and
HOLDS no twice; `minor` needs the mirror; anything else is `unclear`.

Each question asks one thing. An earlier wording asked "is the date, venue or
main act now different, or is the event cancelled?" and "do all three stand,
with the event still going ahead?": two conditions in each, which a page can
meet one of and not the other. The most common real notice, "postponed; a new
date will be announced", names no different date and cancels nothing, so
models split on it and the tickets would have settled to the organizer. Now a
single definition, given before the question in every asking, says what
"takes place as the TERMS describe it" means (that date, that venue, that main
act; a cancellation, a postponement or a new date, venue or main act does not;
door times and support acts do not count), and both questions ask about that
one thing from opposite sides. `notices/postponed.html` is the postponement,
and it reads as material.

- A model that leans towards whichever block comes first answers differently
  in the two orders, and the difference is the stored value `unclear`, not a
  tolerance.
- A model that says yes to everything answers yes to both framings, which
  contradict each other, and lands on `unclear`.
- The material terms are named in the definition and the non-material ones
  are named as not counting, so "doors at 18:30" and "a new support act" have
  an answer in the words of the prompt.
- Each question states what yes and no mean, so the model does not have to
  guess which way a cancellation counts.

Each validator re-derives the whole value and compares it by exact equality.
There is no "close enough": a validator that read a different page or got a
different finding disagrees.

## 3. The page is fetched once, fingerprinted, cut and capped

**The text judged is the body of the one answer whose status was read.** An
earlier version checked the status with one request and read the text with a
second (`render`), which returns no status. Validators on Studio share an
egress address, so all of them can meet the same rate limit on the second
request, agree on its "429: Too Many Requests" text, find it minor, and spend
the page for good. Now there is one `get`: anything but a 2xx raises
`[TRANSIENT]`, and the body of that same answer is what is judged. A redirect
is refused too, because its body is a stub that would read as minor.

**The stored value carries the first 16 hex characters of the sha256 of the
exact text that was judged.** Validators fetch the page separately; if it
changed between fetches, or differs per visitor, the fingerprints differ and
the round does not settle. The first 128,000 bytes of the body are decoded,
the tags of the first 32,000 characters are removed (with the text after a
script or style tag), and the whitespace is collapsed, so the work never grows
with a page somebody chose, and the first 6,000 characters are judged. Tags
are removed, not fenced, so the model reads what a visitor reads, and a
canonical link or a tracking attribute that names the address does not make
one text look like two. The page is fetched, not run: words that only a
script writes are not read.

## 4. A failure is never a finding

**A failed fetch, an error status, an empty page and a failed model call each
raise, and a validator never agrees with a leader that raised.** Nothing is
written, no fee is taken, and the review may be asked again. Every refusal of
a review (unknown event, bad address, outside the prefix, event already
changed, window closed, not enough credit) comes before the fetch, and nothing
is written before the round, so a round that does not settle leaves no trace.

## 5. Each text once, and unclear is not a free re-roll

**Each text is read once per event, keyed on what the page says, not on its
address.** A reviewer who could ask about the same words until the answer
suited it would turn consensus into a lottery. The rule used to be keyed on
the address, and that failed both ways. A server that serves one notice under
several spellings (a trailing slash, a copy) gave a holder a free new roll at
each spelling. And an address, once read, could never be read again: an
organizer could read its own pages ahead of the sale, cheaply, and then
announce a new date by editing one of them in place, which nobody could ask
about any more.

Now the agreed fingerprint is the key. A review whose fingerprint was already
read for the event is a **repeat**: its round still runs, but the earlier
reading stands, nothing changes, and the 0.01 GEN fee goes to the organizer
whoever asked. A page edited since it was read has another fingerprint and
gets a fresh reading. Asking about a page to see whether it changed therefore
costs the fee when it has not, and is a real reading when it has.

A `minor` finding pays the fee to the organizer, which is what an organizer is
owed for being asked about a notice that changed nothing. An `unclear` finding
pays it to the organizer too, unless the reviewer holds a ticket to that event
and has not had a free unclear reading of it before: a holder asking about its
own ticket is not fishing, but a second unclear reading costs it the fee, so a
page whose words differ per address (one that prints its own address, say)
cannot be rolled for free either. A `material` finding costs nothing, because
the reviewer was right.

## 6. The money is already there, and leaves one ticket at a time

**Ticket money is held in escrow from the sale to the end.** A refund that
depends on the organizer sending money back is a request, not a refund. Here
the price never leaves the contract until one of two things happens to that
ticket: its holder takes it back (`refund`, once the event changed, until seven
days after the start), or it goes to the organizer (`settle`, from a day after
the start if the event never changed, or seven days after the start for a
changed event's ticket nobody refunded). Each is one ticket per call, O(1),
through one exit, `_close_ticket`. A material finding or a cancel only flips
the event's status; it pays nobody, so it costs the same whether the event
sold one ticket or five hundred.

Reviews close exactly when settling opens, a day after the start, so the money
never goes to the organizer while a notice could still open the refunds. The
review credit is separate from the escrow and only ever the sender's own: a
fee comes out of it only when a review settles.

`buy` and `deposit` are the payable calls. Neither raises after taking value:
every refusal returns what was sent in the same transaction and answers
`{"ok": false, ...}`.

## 7. Every party has a way out

- A buyer refused for the amount buys with the price; one refused because the
  event is sold out, changed or started gets its value back at once.
- A reviewer without credit deposits; one refused for an address outside the
  prefix points at a page below it; one told that a text was already read
  asks again once the organizer publishes something new, or points at another
  notice.
- A holder refused a refund because nothing changed can ask for a notice to be
  read; once a material finding or a cancel lands, the refund is its own call.
- Money nobody claimed does not stay: a changed event's unrefunded ticket goes
  to the organizer after seven days, and anyone may send that call.
- An organizer whose event never changed is paid by `settle`, which anyone,
  including the organizer, may send.
- Credit can always be taken back with `withdraw`.

## 8. Capacity is the organizer's number

**Only a buyer who pays the full price fills a seat.** There is no cap a
stranger can fill for free: no list of reviewers, no queue, no reservation
without payment. Lists are kept as numbered slots appended in O(1) and read in
pages of at most 20.

## What is verified, and what is not

Verified offline: every rule and refusal above; each finding and where the fee
goes, for a holder, a non-holder and the organizer, and for a ticket held to a
different event; every notice in `notices/` coming to its finding with a
scripted reader, and each restating the terms it keeps; the four askings in
both orders with every combination of answers; the prompt boundary (fencing,
tags, caps, labels, the untrusted declaration before the blocks, the
definition between the reading and the question, no amount, address, id or
clock in any prompt, the longest prompt under 10,000 characters); a failed
fetch, any status outside 2xx (101, 199, 300, 301, 404, 429, 500, 503), an
empty page, a body of tags only and a failed model call each storing nothing
and taking no fee; the body judged being the one whose status was read, with
the contract never making a second request (a world whose second request
answers "429" still judges the notice); the same text under another address
and the same address read twice each being a repeat whose earlier finding
stands, even when the new round found material; a page edited in place being
read afresh after the organizer read its own pages ahead; a holder's free
unclear reading spent once per event; validators whose pages differ
disagreeing, and a single differing validator outvoted; a leaning leader not
agreed with; the byte cut, the tag removal and the raw cut before the spacing
is collapsed; refunds
and settles at every window boundary, each paying one ticket; the books
(escrow, credit, fees, refunds, settles, returned values) after every step of
sixteen seeded random journeys that must reach every status, every finding,
a repeat, both fee routes and both outcomes of a holder's unclear reading, and
then close at zero; static rules over the parsed source
(sender gates, the payable doors, loops, the prompt boundary, the closure, the
comparison, no float, JSON hooks, scalar storage, transfers and status moves
through their exits; one request and no `render`); and 239 mutants, none
surviving.

Not verified offline: how real models on Studio read the demo notices. The
scripted reader in the tests is a stand-in. The on-chain run is the evidence
for that, and its record goes in the README once it has run.
