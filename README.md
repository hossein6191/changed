# Changed

Event tickets whose terms survive a change notice: validators read the
organizer's own notice on the live web, and if the date, the venue or the main
act changed, every ticket holder can take their money back from escrow.

## The problem

A ticket is bought for a night: a date, a place and the act on the poster.
When the organizer moves the show to another week, another hall or another
headliner, the buyer is often told that the ticket "remains valid" and that
refunds are at the organizer's discretion. The organizer has the money and
writes the notice, so the organizer also decides whether the notice is a
change worth a refund. A later door time or a new support act is not, and
nobody disputes that. A new date is, and that is exactly where the arguing
starts.

The facts are already public. The organizer publishes the change on its own
website, because it has to tell the buyers. What is missing is somebody
neutral who reads that notice against the terms the tickets were sold on and
decides, the same way for everyone, whether a material term moved, and money
that is still there when the answer is yes.

## What it is

An **organizer** opens an event with the terms its tickets are sold on:

- the **date**, the **venue** and the **main act**, which are material;
- a line of **details** that are not material: door times, support acts,
  anything else;
- a price (0.05 to 50 GEN), a capacity (1 to 500), a start time (at least an
  hour ahead), and the **prefix of its own website** under which it publishes
  its notices, such as `https://harbourlights.example/2027/notices/`.

A buyer **buys** a ticket with exactly the price. The money is held by the
contract, in escrow, not paid to the organizer.

Anyone with a little **review credit** may point at a page below the
organizer's prefix and ask the network to read it. Every validator fetches the
page itself, reads it against the stored terms, and the network agrees on one
of three findings:

- **material**: the page says the event will not take place as the terms
  describe it: it is cancelled or postponed, or it moves to another date or
  venue, or it has another main act. The event becomes **changed** in the same
  transaction, and every holder may take its ticket's price back from escrow,
  one ticket per call, until seven days after the start.
- **minor**: going by the page, the event still takes place on that date, at
  that venue and with that main act (a later door time, a new support act, the
  original listing). Nothing changes.
- **unclear**: anything else, including the two orders of the question
  disagreeing. Nothing changes.

The organizer may also **cancel** before the start, which opens the same
refunds. An event that never changed is paid to its organizer a day after the
start, one ticket per `settle` call, which anyone may send. A changed event's
tickets that nobody refunded within seven days of the start are paid to the
organizer the same way, so no money is ever stuck.

## How consensus is used

`review(event, url)` is one consensus block. The leader and every validator
each do all of this themselves:

1. Fetch the page **once**. A failed fetch, or any status outside 200 to 299,
   is a failed read: nothing is stored, no fee is taken, and the review may be
   asked again. The text judged is the body of that same answer, never a
   second request, so a rate limit or an error page met on the way can never
   be read as a notice.
2. Read the first 128,000 bytes of the body as UTF-8, remove every tag (and
   the text after a script or style tag), collapse the whitespace of the first
   32,000 characters, keep the first 6,000, and take the first 16 hex
   characters of their sha256 as the page's fingerprint.
3. Ask four askings over two fenced blocks, the stored **TERMS** (the event's
   name, date, venue, main act and the details marked not material) and the
   **PAGE**. Each asking carries one definition, so that each question asks
   one thing:

   > The event takes place as the TERMS describe it when it happens on the
   > date, at the venue and with the main act given in the TERMS. A change only
   > to door times, support acts or other details leaves it as described. A
   > cancellation, a postponement, or a new date, venue or main act does not.

   **CHANGED**, once with the terms first and once with the page first:

   > Does the PAGE say that the event will not take place as the TERMS describe
   > it? Answer yes, no or unclear.
   >
   > Yes means the PAGE says the event will not take place as described: it is
   > cancelled or postponed, or it moves to another date or venue, or it has
   > another main act. No means the PAGE does not say that.

   **HOLDS**, its exact negation, in the same two orders:

   > Going by the PAGE, will the event still take place as the TERMS describe
   > it? Answer yes, no or unclear.
   >
   > Yes means nothing in the PAGE stops the event taking place as described; a
   > page that changes only other details, or does not mention the date, the
   > venue or the main act, leaves them standing. No means the PAGE says it
   > will not take place as described.

4. Combine them:

   | finding | when |
   |---|---|
   | `material` | CHANGED yes in both orders and HOLDS no in both orders |
   | `minor` | CHANGED no in both orders and HOLDS yes in both orders |
   | `unclear` | anything else |

The stored value is `{"finding": "material" | "minor" | "unclear", "fp": "<16
hex>"}`, and each validator compares its own value with the leader's by exact
equality. Nothing is forgiven in the comparison: a validator whose page read
differently has a different fingerprint and disagrees; a validator whose own
model leaned one way in one order and the other way in the other lands on
`unclear` and disagrees with a leader that found `material`. Position bias
cannot hide, because both orders are asked inside the same block and any
disagreement between them is the value `unclear`. A model that says yes to
everything also lands on `unclear`, because CHANGED and HOLDS cannot both be
yes.

Every untrusted string (the terms the organizer wrote, and the whole page) is
fenced: `<` and `>` become `(` and `)` (replaced, never deleted), each block
sits between delimiter lines tagged with the start of its own sha256, and the
prompt says before the blocks that their contents are untrusted and never an
instruction. Only the terms and the page reach the model: no amount, no
address, no id and no clock. The longest prompt the contract can build is
under 10,000 characters.

Each **text** is read **once per event**, whatever it was found to be. When
the agreed fingerprint was already read for the event, under this address or
any other spelling of it, the review is a **repeat**: the earlier reading
stands, nothing changes, and the fee goes to the organizer whoever asked. A
page the organizer edits in place has another fingerprint, so it is read
afresh; announcing a change by editing a page that was already read does not
hide it. A reading that came back `unclear` is not a free second roll either:
the same text can only repeat it, a reviewer who holds no ticket pays the fee,
and a holder keeps its fee for its first unclear reading of an event only.

## Why the live web and validator agreement make it a GenLayer job

The question is about meaning, not bytes. "Doors now open at 18:30" and "the
festival moves to 21 June" are both notices from the same organizer on the same
site, and only one of them breaks the deal the buyer paid for. A deterministic
contract cannot tell them apart. A platform moderator can, but the moderator
works for the platform or the organizer, and the organizer has the money.

The notice is a page on the organizer's own website at the moment somebody
asks. A contract cannot fetch it, and an oracle run by either side would be
one side reading it for both. Here every validator fetches the page
independently, reads it with its own model in both orders, and the refunds
open on the value they agreed on, from money the contract already holds. The
buyer does not upload a screenshot and the organizer does not get to say the
change was minor: the organizer's own words are read by the network.

## Who may do what

| call | who | when |
|---|---|---|
| `open_event(name, terms_json, site_prefix, price, capacity, starts_at)` | anyone; the sender is the organizer | the terms, the price, the capacity and the start are fixed for good |
| `buy(event)`, payable | anyone but the organizer | with exactly the price, before the start, while the event is on and tickets are left |
| `deposit()`, payable / `withdraw()` | anyone | adds to, or takes back all of, its own review credit |
| `review(event, url)` | anyone with 0.01 GEN of credit | a page below the event's prefix, while the event is on and until a day after the start; each text once per event |
| `refund(ticket)` | the holder | once the event changed, until seven days after the start |
| `cancel(event)` | the organizer | before the start, while the event is on |
| `settle(ticket)` | anyone | a day after the start for an event that never changed; seven days after the start for a changed event's unrefunded ticket |

`terms_json` is `{"date": "...", "venue": "...", "main_act": "..."}` with an
optional `"details"`; the three terms are 3 to 120 characters, the details up
to 300, all printable ASCII on one line. JSON with a number in it is refused.

`cancel` and `refund` refuse by who the sender is. `buy` refuses the
organizer. `open_event`, `deposit`, `withdraw`, `review` and `settle` are open
on purpose, each for a reason the test suite states: opening touches nothing
but the new event, credit is only ever the sender's own, a review is paid from
the sender's own credit and reads only the organizer's own pages, and a settle
only ever pays a ticket's own price to that event's organizer once nobody else
can claim it. A write added later that checks no sender fails the suite until
somebody lists it with a reason. Addresses are compared without letter case.

`buy` and `deposit` are the payable calls. Neither asks the model, and neither
raises after taking value: a refusal sends everything back in the same
transaction and answers `{"ok": false, "reason": ..., "returned": ...}`. The
other writes take no value and refuse by raising `[EXPECTED] ...`. Every
refusal of a review comes before the page is fetched.

Views take a short id, a small number or one address, never a text and never a
time: `event(id)`, `events(offset, limit)`, `events_of(address, offset,
limit)`, `ticket(id)`, `tickets_of(address, offset, limit)`,
`event_tickets(event, offset, limit)`, `reviews_of(event, offset, limit)`,
`credit(address)`, `stats()` and `rules()`. Lists come in pages of at most 20.
`event(id)` also returns `now` (the chain's clock at the read), a `phase`
(`selling`, `sold_out`, `started`, `settling`, `refunds`, `refunds_closed`)
and the instants each window opens and closes. `rules()` publishes the four
askings word for word, the combine table, the money table and the limits.

## The money

| moment | what moves |
|---|---|
| `buy` | the holder pays exactly the price; the contract holds it in escrow |
| `deposit` / `withdraw` | the sender's own review credit, in and out |
| `review`, material | the 0.01 GEN fee stays in the reviewer's credit; every ticket's refund opens |
| `review`, minor | the fee goes to the organizer, in the same transaction |
| `review`, unclear | the fee goes to the organizer, unless the reviewer holds a ticket to this event and this is its first unclear reading of it, when it stays in its credit |
| `review`, a repeat of a text already read | the fee goes to the organizer, whoever asked; the earlier reading stands |
| `review` that could not read the page | nothing: no fee, nothing stored |
| `refund` | the ticket's price back to the holder, from escrow |
| `cancel` | nothing moves; every ticket's refund opens |
| `settle`, an event that never changed | the ticket's price to the organizer, from a day after the start |
| `settle`, a changed event | an unrefunded ticket's price to the organizer, from seven days after the start |
| a refused payable call | everything sent goes back to the sender, in the same transaction |

Every payout is one ticket or one fee, O(1), through one of two exits. The
contract always holds exactly the prices of the valid tickets plus all the
review credit. The offline suite checks that, and every other rule about where
the money is, after every step of sixteen seeded random journeys, then pays out
every remaining ticket and credit and checks that the books close at zero.

## The demonstration

The Harbour Lights Festival is a fictional one-night show:

| term | value |
|---|---|
| date | 14 June 2027 |
| venue | Saltmarsh Pier Arena |
| main act | The Lantern Tides |
| details, not material | Doors open at 18:00. Support act: Copper Gulls. One night only. |

`notices/` holds the organizer's pages, plain HTML that reads the same for
every validator. Each changes at most one thing and says so in plain words:

| page | what it says | finding |
|---|---|---|
| `event.html` | the original listing | minor |
| `doors-later.html` | doors open at 18:30 instead of 18:00; nothing else changes | minor |
| `new-support.html` | Velvet Driftwood replaces Copper Gulls as the support act | minor |
| `new-date.html` | the festival moves to 21 June 2027; same venue, same main act | material |
| `new-venue.html` | the festival moves to the Old Ropeworks hall; same date, same main act | material |
| `headliner.html` | The Lantern Tides withdraw; Northbound Static is the main act | material |
| `cancelled.html` | the festival is cancelled | material |
| `postponed.html` | the festival will not go ahead on 14 June 2027; a new date will be announced | material |

## The limits, stated plainly

- **The organizer controls its own site.** A change it never publishes under
  its prefix is not caught, and a notice it takes down before anybody asks is
  not read. The contract reads what the organizer says, not what happens on
  the night. Pages pinned to a commit cannot change once read.
- **Only pages below the organizer's prefix are read.** That is what makes the
  page the organizer's own words. A page about a different event under the
  same prefix should be read as saying nothing about this one, and the prompt
  says so, but an organizer who publishes notices for several events is
  better served by one prefix per event.
- **A page must read the same for every validator at that moment.** Each node
  fetches it separately and the fingerprint is compared. A page that changes
  between fetches, differs per visitor, or sits behind a login will not settle,
  and nothing is stored. Static pages settle.
- **Text is read; images and scripts are not.** The page is fetched, not run
  in a browser: a notice that exists only as a poster image, or whose words a
  script writes into the page, is not judged.
- **The first 6,000 characters are judged.** The whitespace of the page's
  first 32,000 characters is collapsed and the rest is cut. A notice should say
  what changed near the top.
- **Only a 2xx answer is a notice.** A page that answers anything else (a
  redirect, a rate limit, an error) stores nothing and takes no fee, whatever
  its text says. Point at the address a redirect leads to.
- **Each text is read once per event.** Asking about the same text again,
  under any address, costs the fee and changes nothing. A page whose visible
  words differ per address (one that prints its own address, say) is a
  different text at each one, and each is a reading of its own that has to
  win all four askings; a holder keeps its fee for one unclear reading per
  event, and pays for every later one.
- **The judgment is a reading of words.** An organizer who words a real change
  vaguely can push the finding to `unclear`; nothing then changes, and holders
  can point at a clearer notice if one appears.
- **Seconds are the chain's.** Every window uses the transaction's own time.
  Reviews and cancellation close as described; somebody has to send `refund`
  or `settle`; nothing moves on its own.
- **Texts are printable ASCII on one line.** Names 3 to 80 characters, terms 3
  to 120, details up to 300. The site prefix is `https`, at most 120
  characters, ends with `/`, has a lowercase host, and uses letters, digits and
  `- . _ ~ /` only; a reviewed address follows the same rule and is at most 200
  characters.

## The site

`web/` is the site (Next.js 16; on Vercel its Root Directory is `web`). It
looks like a gig poster wall: an event is a wheat-pasted poster, a ticket a
perforated stub, a reading a NOTICE slip printed MATERIAL CHANGE - REFUNDS
OPEN, MINOR - TICKETS STAND or UNCLEAR, with its fingerprint.

| page | what it does |
|---|---|
| `/` | the promise in one minute, how the money moves, where to start |
| `/event` | the demo festival on sale now: buy, the organizer's notice buttons, every reading, refunds |
| `/event/E3` | any event by its id, with the same wall |
| `/tickets` | the tickets the connected wallet holds, with the refund or settle that is open |
| `/organizer` | open an event (every field has one-click suggestions), cancel, follow the escrow |
| `/ledger` | the contract's books and every event, newest first |
| `/how` | the two questions word for word, why GenLayer, the money, the limits, `rules()` read live |

**One wallet tries everything as a fan.** A throwaway demo organizer, whose
key the site's server holds in `DEMO_ORGANIZER_KEY`, runs the Harbour Lights
Festival on sale for six hours at a time, its site prefix the `notices/`
folder of this repository pinned to one commit on raw.githubusercontent.com.
Under "What the organizer announces next" a visitor presses one of six fixed
notices (doors later, new support act, new date, new venue, new main act,
cancelled) and the demo organizer asks the network to read that page from its
own review credit, so the visitor needs no credit to watch a reading. Nothing
the visitor types is ever signed. When the demo festival starts, sells out or
changes, a button has the demo organizer open the next one. A visitor can also
read any page below the prefix with their own credit.

- `GET /api/demo/status` says whether the demo organizer can act, which event
  it runs and where that stands, or exactly why not.
- `POST /api/demo/notice {event, notice}` takes one of the six notice keys,
  only on the demo event, each text once.
- `POST /api/demo/reopen` opens a fresh demo festival once the last one is no
  longer on sale.
- `node tools/open-demo-event.mjs` (in `web/`, with `REGISTER`,
  `DEMO_ORGANIZER_KEY` and `COMMIT`; `DRY=1` prints the calls) checks every
  notice is at that commit, opens the first demo festival and adds its credit.
  `NOTICES_COMMIT` in `web/lib/config.ts` takes the same commit.

Every wait on the site says what is happening, how long it takes, whether
anything is needed from you, whether you can leave, and where the money is
(`web/lib/guide.ts`). `NEXT_PUBLIC_MOCK=1` runs the whole site on an in-memory
copy of the contract that follows it check for check, reads the eight notices
as scripted, and can make the next reading split to show unclear.

```
cd web
npm ci
npm run test:site        # calls against contracts/changed.py, mock flows, money, waiting copy, chips, hygiene
npm run typecheck && npm run lint && npm run build
npm run dev:mock         # the whole site on the in-memory contract, at localhost:3251
```

## What is in this repository

```
contracts/changed.py            the contract
notices/                        the organizer's demo notices: one listing and seven change notices
tests/test_pure.py              the offline suite, including the consensus round with a world per node
tests/MUTATIONS.md              every defence removed in turn, and the test that caught it
tests/on_chain/smoke.mjs        a throwaway-account run against Studio
tools/mutate.py                 the generator that writes MUTATIONS.md and refuses to if anything survives
docs/CONTRACTS.md               purpose, consensus, state, methods, loops, errors and limits
docs/DECISIONS.md               why each rule is the way it is, and what is verified and what is not
web/                            the site, its demo organizer and its own tests
```

## Running it

```
pip install -r requirements-dev.txt
pytest tests/ -q                              # no network, no Studio
genvm-lint check contracts/changed.py
python tools/mutate.py                        # rewrites tests/MUTATIONS.md; exits 1 if a mutant survives
```

On this repository as it stands, `pytest tests/ -q` gives **126 passed** in
about a second. `genvm-lint check` (genvm-linter 0.11.0) prints
`Lint passed (3 checks)` and reports 18 methods, 10 view and 8 write.
`python tools/mutate.py` removes or inverts **239 defences** one at a time,
and **none survives**.

The on-chain run uses four throwaway keys it generates itself (ORGANIZER,
FAN_A, FAN_B, STRANGER) and funds them from the Studio faucet. It never
touches anybody's own wallet. The validators read the notices from GitHub at
one commit, so push the repository first and pass that commit:

```
npm ci
COMMIT=<40-character sha> node tests/on_chain/smoke.mjs        # about thirty minutes
COMMIT=<sha> RESUME=1 node tests/on_chain/smoke.mjs            # continue from the saved state
```

`REPO=<owner>/<name>` names the GitHub repository when the git remote does
not. The script fetches the notices itself before it deploys anything and
stops if they are not at that commit. It opens the festival as E1 (three
tickets at 0.5 GEN, starting about three hours later) and E2 (two tickets);
two fans buy; a doors-later notice is found minor and its fee goes to the
organizer; a fan who holds a ticket asks about the same page again, is told
the first reading stands, and pays the fee to the organizer all the same; a
new-date notice is found material and both fans take their money back; on E2 a stranger's
new-support review is minor, the organizer cancels, and both fans take their
money back again. Along the way a stranger is refused a cancel, the organizer
is refused its own ticket, a short payment, a late purchase and a sold-out
purchase are each refused and returned in the same transaction, an address
outside the prefix is refused before anything is fetched, and early refunds
and early settles are refused. It then reads the deployed code back and
compares it with `contracts/changed.py` byte for byte, checks the views, takes
every credit back, and checks that the contract holds nothing and every account
ended where the money table says. It prints a PASS or FAIL line for every
check, `N passed, M failed`, and the contract address.

## Network

GenLayer Studio, chain 61999, RPC `https://studio.genlayer.com/api`, explorer
`https://explorer-studio.genlayer.com`. The contract pins the runner
`py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` in its first
line.

## Evidence

Run on 19 October 2026 on GenLayer Studio (chain 61999) by `tests/on_chain/smoke.mjs`, from generated accounts funded from the
Studio faucet, none of them anybody's wallet: **ORGANIZER** opens the events, **FAN_A** and **FAN_B** buy tickets, **STRANGER** tries what it may not. **42 passed, 0 failed**; transactions: 34 in 34 steps; sent a second time: none.
The whole log is `tests/on_chain/smoke-run.log`. Every validator read doors-later.html as minor (the tickets stood, the fee went to the organizer) and new-date.html as material, after which both fans took their 0.5 GEN back from escrow; the same text under a second request was a repeat, and a cancelled second event refunded both fans.

- `changed.py` deployed at [`0xF40908518f675871f39a2cb78C6bF2C9A199dFf9`](https://explorer-studio.genlayer.com/address/0xF40908518f675871f39a2cb78C6bF2C9A199dFf9)

- the code deployed at 0xF40908518f675871f39a2cb78C6bF2C9A199dFf9 is byte for byte contracts/changed.py: 67928 bytes, sha256 c878e5d513647bc0bbf7a95c693dcb118f52e2106701ac1e8f99967bcb6a0562

| step | by | transactions | votes |
|---|---|---|---|
| ORGANIZER opens E1, the Harbour Lights Festival: 14 June 2027, Saltmarsh Pier Arena, The Lantern Tides; 0.5 GEN, three tickets | ORGANIZER | [0x1dc40ca3…](https://explorer-studio.genlayer.com/tx/0x1dc40ca36f42466dea5254da06e436adf4eb97852a3df4024610718258ba2927), [0x030ee636…](https://explorer-studio.genlayer.com/tx/0x030ee636458b3639b39a122c0dbd50ad30043fe88746d2f7dc1ccbfefa163a4c) | 5 agree, 0 disagree, 0 idle |
| STRANGER may not cancel E1 | STRANGER | [0x93f8ce32…](https://explorer-studio.genlayer.com/tx/0x93f8ce321340095474d94671f0198c004ab797530b55833c874e80d9f4a862c2) | 5 agree, 0 disagree, 0 idle |
| FAN_A buys T1 to E1: 0.5 GEN held in escrow | FANA | [0x98655ab4…](https://explorer-studio.genlayer.com/tx/0x98655ab439918cd82e3f140ee8327f4ca771c9e7c5f50c975e9f57c94dcd9947) | 5 agree, 0 disagree, 0 idle |
| FAN_B buys T2 to E1: 0.5 GEN held in escrow | FANB | [0xe830a9f4…](https://explorer-studio.genlayer.com/tx/0xe830a9f4c6fc00dcf7a0a31f0d9ffec3b496b26665e95fa0eb89c7ae110b317a) | 5 agree, 0 disagree, 0 idle |
| ORGANIZER may not buy its own ticket, and the 0.5 GEN comes back in the same transaction | ORGANIZER | [0x3f45d19a…](https://explorer-studio.genlayer.com/tx/0x3f45d19a064fa84c38fdcfa3b4513f063588fdbb0d306d57c012dfecb9049d01) | 5 agree, 0 disagree, 0 idle |
| FAN_A sends 0.4 GEN for a 0.5 GEN ticket: refused, and the 0.4 GEN comes back | FANA | [0xecc5ced8…](https://explorer-studio.genlayer.com/tx/0xecc5ced850e2a0e6c35f658d93a4b9da520069839c1ebe059a51b7976df9d188) | 5 agree, 0 disagree, 0 idle |
| FAN_A may not refund T1 while nothing has changed | FANA | [0x4000c146…](https://explorer-studio.genlayer.com/tx/0x4000c14624b15784953d7337e04489e53bae620bb6cc5d57c8926e20eaceefb3) | 5 agree, 0 disagree, 0 idle |
| nobody may settle T1 to the organizer before a day after the start | STRANGER | [0xccef0fc7…](https://explorer-studio.genlayer.com/tx/0xccef0fc795c2dc968549766a6184d933f62c9bf0f81549a9ebaf5fe892073cb3) | 3 agree, 0 disagree, 2 idle |
| STRANGER asks for a review with no credit: refused before anything is fetched | STRANGER | [0xa8282fd4…](https://explorer-studio.genlayer.com/tx/0xa8282fd47b58253c6818fb06a42c33e046ad968d32e3e83201eb3678cebb5d79) | 3 agree, 0 disagree, 2 idle |
| FAN_A deposits 0.03 GEN of review credit | FANA | [0xe9b5a256…](https://explorer-studio.genlayer.com/tx/0xe9b5a256df23babdd349152c1665bcc477cf7daa7dcd8c558730bd74770c377d) | 3 agree, 0 disagree, 2 idle |
| FAN_B deposits 0.03 GEN of review credit | FANB | [0xdb7672e7…](https://explorer-studio.genlayer.com/tx/0xdb7672e7cb64f2637f63311a986f180eee7e735f7d5de41826b8e1d470c03fca) | 3 agree, 0 disagree, 2 idle |
| STRANGER deposits 0.02 GEN of review credit | STRANGER | [0x99fb1a00…](https://explorer-studio.genlayer.com/tx/0x99fb1a004eece8d6a1a20371c0e31054f95cdb20c96004cfa92137d6334861ea) | 5 agree, 0 disagree, 0 idle |
| FAN_A points at the repository's README, outside the organizer's prefix: refused before any fetch, no fee | FANA | [0x5df08191…](https://explorer-studio.genlayer.com/tx/0x5df08191a18468aecd7f5ff05bc75f41b97ffe3e3f43340707484acee8ffc7c4) | 4 agree, 0 disagree, 1 idle |
| every validator reads doors-later.html (doors at 18:30): minor, nothing changes, the 0.01 GEN fee goes to ORGANIZER | FANA | [0xe14302f5…](https://explorer-studio.genlayer.com/tx/0xe14302f548e1778a0a632165baeeaa8f29271d670634e7cc6c2d416524ddb496) | 3 agree, 0 disagree, 2 idle |
| FAN_B asks about doors-later.html again: the same text, so R1 stands and the fee goes to ORGANIZER although FAN_B holds a ticket | FANB | [0x130dbd1b…](https://explorer-studio.genlayer.com/tx/0x130dbd1b2559d75df4b137dbe35fe6921570e7b87166263c077d00efb1b87686) | 3 agree, 0 disagree, 2 idle |
| every validator reads new-date.html (moved to 21 June 2027): material, E1 changes and the fee stays with FAN_B | FANB | [0x250c972e…](https://explorer-studio.genlayer.com/tx/0x250c972e14ef953398aa0787c6997c8db4487cf3a23c7fd19b93d8b383a0c180) | 3 agree, 0 disagree, 2 idle |
| FAN_A takes the 0.5 GEN of T1 back from escrow | FANA | [0xbc96d9af…](https://explorer-studio.genlayer.com/tx/0xbc96d9af401bea466eec3d78ca85b4f5c6efe9af78ebf86697dcb88a6c392685) | 5 agree, 0 disagree, 0 idle |
| FAN_B takes the 0.5 GEN of T2 back from escrow | FANB | [0x2af3cef0…](https://explorer-studio.genlayer.com/tx/0x2af3cef07952a216f437c004d3f3b9424754423946deac2d38f4db339eddb99e) | 5 agree, 0 disagree, 0 idle |
| a second refund of T1 is refused | FANA | [0x16e3fb4d…](https://explorer-studio.genlayer.com/tx/0x16e3fb4d794f92ce2155f51dd3b18afcc7b2d7916b843123c9bf9d2c4ee4d7dd) | 3 agree, 0 disagree, 2 idle |
| E1 changed, so it sells nothing more, and the 0.5 GEN comes back | FANA | [0x0f287787…](https://explorer-studio.genlayer.com/tx/0x0f287787356a44d1b67163962233a645ef74c2d8cbe5230c91cdf456e5151675) | 5 agree, 0 disagree, 0 idle |
| ORGANIZER puts the festival on sale again as E2, with two tickets | ORGANIZER | [0xa3387e07…](https://explorer-studio.genlayer.com/tx/0xa3387e07078e32c2a581db3992facc21779f3a13b5b8c44612804a3f1068a50e) | 3 agree, 0 disagree, 2 idle |
| FAN_A buys T3 to E2 | FANA | [0x4267c4ae…](https://explorer-studio.genlayer.com/tx/0x4267c4ae4e0972de948598860ec9537306f6de19fe28ed568c0e13bc810ec2f3) | 3 agree, 0 disagree, 2 idle |
| FAN_B buys T4 to E2 | FANB | [0x6e25d620…](https://explorer-studio.genlayer.com/tx/0x6e25d6200712b2019be4493da9177eb8896c8eb616ec29f70f3340d95c5736a7) | 3 agree, 0 disagree, 2 idle |
| E2 is sold out: STRANGER is refused and the 0.5 GEN comes back | STRANGER | [0x0589f7e2…](https://explorer-studio.genlayer.com/tx/0x0589f7e23a4672bdca0ac015ab9ed866fd2da5d905172fe014b775d8e28dda51) | 3 agree, 0 disagree, 2 idle |
| STRANGER, holding no ticket, asks for new-support.html: minor, the fee goes to ORGANIZER | STRANGER | [0xfe175f58…](https://explorer-studio.genlayer.com/tx/0xfe175f58bd1cce08bac5c8fb0baae776f175d4305689a0be3dbd21bdd49f10b0) | 3 agree, 0 disagree, 2 idle |
| T3 cannot be settled to the organizer yet: that opens a day after E2 starts | STRANGER | [0xfdb07e8e…](https://explorer-studio.genlayer.com/tx/0xfdb07e8eac00b6780e6a50ca258d9fb2db0cfabadc10b11bbbf6cf7a2bcf8eb0) | 3 agree, 0 disagree, 2 idle |
| ORGANIZER cancels E2 before its start: every refund opens, nothing is paid to anyone yet | ORGANIZER | [0xfa3d0cb8…](https://explorer-studio.genlayer.com/tx/0xfa3d0cb807e40151400645120fc758a791ffedbb8b1ddbcb95c80e9d66295458) | 5 agree, 0 disagree, 0 idle |
| FAN_A takes the 0.5 GEN of T3 back | FANA | [0xc47644be…](https://explorer-studio.genlayer.com/tx/0xc47644be71873bb3d317811da5414707650ce4f0b59ae7347e129058ac48e45f) | 3 agree, 0 disagree, 2 idle |
| FAN_B takes the 0.5 GEN of T4 back | FANB | [0x74e1415b…](https://explorer-studio.genlayer.com/tx/0x74e1415b5f6d035af5e46333e8e30667cbe8b423e02a7dc06d0cadb5151d0b46) | 3 agree, 0 disagree, 2 idle |
| a refunded ticket (T4) can never be settled to the organizer | STRANGER | [0xf220dbb5…](https://explorer-studio.genlayer.com/tx/0xf220dbb5e10907a17779a5a9d1b3537f550110a8dbe9d433e87a721c97ccd09c) | 5 agree, 0 disagree, 0 idle |
| FAN_A takes its 0.02 GEN of credit back | FANA | [0x0613fa80…](https://explorer-studio.genlayer.com/tx/0x0613fa80a834055ff8a463b0bee670eea9806b0645a771a65255cf9d1113c344) | 5 agree, 0 disagree, 0 idle |
| FAN_B takes its 0.02 GEN of credit back | FANB | [0xce30d569…](https://explorer-studio.genlayer.com/tx/0xce30d569bacd081be4775e8af123cda12533c3a87c596d9eae156767f192b2d7) | 4 agree, 0 disagree, 1 idle |
| STRANGER takes its 0.01 GEN of credit back | STRANGER | [0xc4dacbad…](https://explorer-studio.genlayer.com/tx/0xc4dacbad5f7aa26423b042670f925ab9b4656b04bf862bbfe9678e0826b27c81) | 4 agree, 0 disagree, 1 idle |

## Licence

MIT; see `LICENSE`.
