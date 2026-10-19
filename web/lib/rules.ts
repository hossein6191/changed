// The contract's rules, in TypeScript, with no imports: the limits, the questions, the words it stores,
// and the readers of the caller's arguments. The in-memory contract of mock mode (lib/chain-mock.ts)
// is built on these, the forms check against them before anything is signed, and tests/unit runs them
// from node with no browser, against contracts/changed.py itself.
//
// Every refusal sentence here is the contract's own, word for word, so a form, the mock and the chain
// all say the same thing about the same input.

export const ATTO = 10n ** 18n;
export const MIN_PRICE = ATTO / 20n;
export const MAX_PRICE = 50n * ATTO;
export const MIN_CAPACITY = 1;
export const MAX_CAPACITY = 500;
export const MIN_LEAD = 3600;
export const MAX_LEAD = 400 * 86400;
export const REVIEW_FEE = ATTO / 100n;
export const AFTER_START = 86400;
export const REFUND_WINDOW = 7 * 86400;
export const MIN_NAME = 3;
export const MAX_NAME = 80;
export const MIN_TERM = 3;
export const MAX_TERM = 120;
export const MAX_DETAILS = 300;
export const MAX_TERMS_JSON = 1200;
export const MAX_PREFIX = 120;
export const MAX_URL = 200;
export const MAX_RAW_PAGE = 32000;
export const MAX_RAW_BYTES = 4 * MAX_RAW_PAGE;
export const MAX_PAGE_TEXT = 6000;
export const FP_CHARS = 16;
export const PAGE = 20;
export const ID_CHARS = 16;
export const ADDRESS_CHARS = 42;

export const SCHEME = "https://";
export const URL_SIGNS = ["-", ".", "_", "~", "/"];

export const TERM_KEYS = ["date", "venue", "main_act"] as const;
export const DETAILS_KEY = "details";
export const TERMS_SHAPE = '{"date": "...", "venue": "...", "main_act": "..."} with an optional "details"';

// ---- the questions, in the contract's words ----------------------------------------------------------

export const READING =
  "The PAGE is the text of a web page with its tags removed and its spacing collapsed, and any angle bracket " +
  "left in it is shown as a round bracket; read it as a visitor would read the page, and judge only what the " +
  "PAGE itself says. A page about a different event says nothing about this one, and a date, venue or main act " +
  "the PAGE does not mention is not changed by it.";

export const DESCRIBED =
  "The event takes place as the TERMS describe it when it happens on the date, at the venue and with the main act " +
  "given in the TERMS. A change only to door times, support acts or other details leaves it as described. A " +
  "cancellation, a postponement, or a new date, venue or main act does not.";

export const QUESTION_CHANGED = "Does the PAGE say that the event will not take place as the TERMS describe it? Answer yes, no or unclear.";

export const MEANING_CHANGED =
  "Yes means the PAGE says the event will not take place as described: it is cancelled or postponed, or it moves " +
  "to another date or venue, or it has another main act. No means the PAGE does not say that.";

export const QUESTION_HOLDS = "Going by the PAGE, will the event still take place as the TERMS describe it? Answer yes, no or unclear.";

export const MEANING_HOLDS =
  "Yes means nothing in the PAGE stops the event taking place as described; a page that changes only other " +
  "details, or does not mention the date, the venue or the main act, leaves them standing. No means the PAGE says " +
  "it will not take place as described.";

// ---- the words the contract stores -------------------------------------------------------------------

export type Finding = "material" | "minor" | "unclear";
export type FeeTo = "reviewer" | "organizer";
export type EventStatus = "on" | "changed";
export type ChangedBy = "" | "review" | "organizer";
export type TicketStatus = "valid" | "refunded" | "settled";
export type Phase = "selling" | "sold_out" | "started" | "settling" | "refunds" | "refunds_closed" | "unknown";

export const FINDINGS: Finding[] = ["material", "minor", "unclear"];
export const FEE_TO: FeeTo[] = ["reviewer", "organizer"];
export const EVENT_STATUSES: EventStatus[] = ["on", "changed"];
export const TICKET_STATUSES: TicketStatus[] = ["valid", "refunded", "settled"];
export const PHASES: Phase[] = ["selling", "sold_out", "started", "settling", "refunds", "refunds_closed", "unknown"];

/** The contract's _event_row phase, from the row and a clock. */
export function phaseOf(e: { status: EventStatus; startsAt: number; sold: number; capacity: number }, now: number): Phase {
  const on = e.status === "on";
  if (now < 0) return "unknown";
  if (on && now < e.startsAt) return e.sold < e.capacity ? "selling" : "sold_out";
  if (on && now < e.startsAt + AFTER_START) return "started";
  if (on) return "settling";
  if (now < e.startsAt + REFUND_WINDOW) return "refunds";
  return "refunds_closed";
}

// ---- reading the caller, as the contract does -----------------------------------------------------

/** The characters Python's str.strip() treats as whitespace (str.isspace()). */
const PY_SPACE_CHARS = "\t\n\x0b\x0c\r\x1c\x1d\x1e\x1f \x85\xa0                　";

/** Python's str.strip(): JS trim() also takes U+FEFF and misses \x1c-\x1f and \x85. */
export function pyStrip(text: string): string {
  let a = 0;
  let b = text.length;
  while (a < b && PY_SPACE_CHARS.includes(text[a])) a++;
  while (b > a && PY_SPACE_CHARS.includes(text[b - 1])) b--;
  return text.slice(a, b);
}

const isAscii = (t: string) => /^[\x00-\x7f]*$/.test(t);
/** Python's len(): code points, where a JS string's length counts UTF-16 units. */
const pyLen = (t: string) => [...t].length;

/** The contract's _text_problem: "" when the text may be stored, else why not. Printable ASCII on one line. */
export function textProblem(text: string, least: number, most: number, what: string): string {
  const n = pyLen(text);
  if (n < least || n > most) return what + " is " + least + " to " + most + " characters; this one is " + n;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 32 || c > 126) return what + " is printable ASCII on one line";
  }
  return "";
}

/** A number written with a fraction, an exponent, NaN or Infinity anywhere outside a string: the contract's parser refuses it. */
function hasFloat(raw: string): boolean {
  let inString = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (/[-0-9]/.test(ch)) {
      const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(raw.slice(i));
      if (m && (m[1] || m[2])) return true;
      if (m) i += m[0].length - 1;
    }
  }
  return false;
}

export type Terms = { date: string; venue: string; main_act: string; details: string };

/** The contract's _terms_problem: why not, or "" and the four values as they will be stored. */
export function termsProblem(raw: string): { problem: string; terms: Terms | null } {
  if (pyLen(raw) > MAX_TERMS_JSON) return { problem: "the terms are at most " + MAX_TERMS_JSON + " characters of JSON", terms: null };
  let table: unknown;
  try {
    if (hasFloat(raw)) throw new Error("a number with a fraction or an exponent");
    table = JSON.parse(raw);
  } catch {
    return { problem: "the terms are a JSON object " + TERMS_SHAPE + ", with no number in it", terms: null };
  }
  if (!table || typeof table !== "object" || Array.isArray(table)) return { problem: "the terms are a JSON object " + TERMS_SHAPE, terms: null };
  const keys = Object.keys(table);
  const allowed: string[] = [...TERM_KEYS, DETAILS_KEY];
  if (keys.length > TERM_KEYS.length + 1 || !keys.every((k) => allowed.includes(k))) return { problem: "the terms hold date, venue, main_act and details only", terms: null };
  const t = table as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of TERM_KEYS) {
    const value = t[key];
    if (typeof value !== "string") return { problem: 'the terms give "' + key + '" as a string', terms: null };
    const problem = textProblem(pyStrip(value), MIN_TERM, MAX_TERM, "the " + key + " term");
    if (problem) return { problem, terms: null };
    out[key] = pyStrip(value);
  }
  const details = DETAILS_KEY in t ? t[DETAILS_KEY] : "";
  if (typeof details !== "string") return { problem: 'the terms give "details" as a string', terms: null };
  const problem = textProblem(pyStrip(details), 0, MAX_DETAILS, "the details");
  if (problem) return { problem, terms: null };
  out[DETAILS_KEY] = pyStrip(details);
  return { problem: "", terms: out as Terms };
}

/** The contract's _url_problem: https, a lowercase host with a dot, letters, digits and - . _ ~ / only, no empty, "." or ".." segment. */
export function urlProblem(url: string, most: number, what: string): string {
  const n = pyLen(url);
  if (n > most) return what + " is at most " + most + " characters; this one is " + n;
  if (!url.startsWith(SCHEME)) return what + " starts with " + SCHEME;
  const rest = url.slice(SCHEME.length);
  let bare = rest;
  for (const sign of URL_SIGNS) bare = bare.split(sign).join("");
  if (!isAscii(rest) || !(bare === "" || /^[A-Za-z0-9]+$/.test(bare))) return what + " uses only letters, digits and - . _ ~ / after " + SCHEME;
  const cut = rest.indexOf("/");
  const host = cut < 0 ? rest : rest.slice(0, cut);
  const path = cut < 0 ? "" : rest.slice(cut + 1);
  if (cut < 0 || !host.includes(".") || host !== host.toLowerCase() || host.startsWith(".") || host.endsWith("."))
    return what + " names a lowercase host such as tickets.example, then a path";
  const segs = "/" + path + "/";
  if (rest.includes("//") || segs.includes("/./") || segs.includes("/../")) return what + ' has no empty, "." or ".." segment';
  return "";
}

/** The contract's _prefix_problem: the site prefix names a whole directory of the organizer's site. */
export function prefixProblem(prefix: string): string {
  const problem = urlProblem(prefix, MAX_PREFIX, "the site prefix");
  if (problem) return problem;
  if (!prefix.endsWith("/")) return "the site prefix ends with /, so it names a whole directory of pages: " + prefix;
  return "";
}

/** The contract's _under: the address names a page below the prefix, not the prefix itself. */
export const under = (url: string, prefix: string): boolean => url.startsWith(prefix) && url.length > prefix.length;

/** review()'s checks of the address, in the contract's order, before anything is fetched: "" when it may be read. */
export function reviewUrlProblem(url: string, prefix: string, eventId: string): string {
  const u = pyStrip(url);
  const problem = urlProblem(u, MAX_URL, "the page address");
  if (problem) return problem;
  if (!under(u, prefix)) return "the page is not below " + eventId + "'s site prefix " + prefix + "; only the organizer's own notices are read";
  return "";
}

/** The contract's _number_arg: an int, or a string of at most 40 ASCII digits; -1 otherwise (a bool is refused by name). */
export function numberArg(raw: unknown): bigint {
  if (typeof raw === "boolean") return -1n;
  if (typeof raw === "bigint") return raw >= 0n ? raw : -1n;
  if (typeof raw === "number") return Number.isSafeInteger(raw) && raw >= 0 ? BigInt(raw) : -1n;
  if (typeof raw === "string") {
    const s = pyStrip(raw);
    return s.length <= 40 && /^[0-9]+$/.test(s) ? BigInt(s) : -1n;
  }
  return -1n;
}

/** open_event's check of the name, after the strip. */
export const nameProblem = (name: string): string => textProblem(pyStrip(name), MIN_NAME, MAX_NAME, "the name");

/** open_event's check of the price. */
export function priceProblem(price: bigint): string {
  if (price < MIN_PRICE || price > MAX_PRICE) return "the price is a whole number of atto from " + MIN_PRICE + " (0.05 GEN) to " + MAX_PRICE + " (50 GEN)";
  return "";
}

/** open_event's check of the capacity. */
export function capacityProblem(capacity: bigint): string {
  if (capacity < BigInt(MIN_CAPACITY) || capacity > BigInt(MAX_CAPACITY)) return "the capacity is " + MIN_CAPACITY + " to " + MAX_CAPACITY + " tickets";
  return "";
}

/** open_event's check of the start against the transaction's clock. */
export function startProblem(start: bigint, now: number): string {
  if (start < BigInt(now + MIN_LEAD) || start > BigInt(now + MAX_LEAD))
    return "the start is a unix time from " + MIN_LEAD + " to " + MAX_LEAD + " seconds after now (" + now + "); this one is " + start;
  return "";
}

// ---- what the site sends --------------------------------------------------------------------------

/** The terms as the site sends them: one JSON object, its keys in the contract's order. */
export const termsJson = (t: Terms): string => JSON.stringify({ date: t.date, venue: t.venue, main_act: t.main_act, details: t.details });

const TYPOGRAPHIC: [string, string][] = [
  ["‘", "'"],
  ["’", "'"],
  ["“", '"'],
  ["”", '"'],
  ["–", "-"],
  ["—", "-"],
  ["…", "..."],
  [" ", " "],
];

/**
 * A text as a form sends it: typographic quotes, dashes and the ellipsis made plain, and every run of
 * whitespace, line breaks included, turned into one space. The contract itself only strips the ends;
 * this is what keeps a pasted line on one line of printable ASCII.
 */
export function plain(text: string): string {
  let t = String(text ?? "");
  for (const [fancy, plainChar] of TYPOGRAPHIC) t = t.split(fancy).join(plainChar);
  return t
    .split(/[\s\x1c-\x1f\x85]+/)
    .filter(Boolean)
    .join(" ");
}

/** A contract sentence as a sentence: capital first letter, full stop at the end, the error tag dropped. */
export function sentence(text: string): string {
  const t = String(text ?? "")
    .replace(/^\s*\[(EXPECTED|TRANSIENT|LLM_ERROR)\]\s*/i, "")
    .trim();
  if (!t) return "";
  const s = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?)]$/.test(s) ? s : s + ".";
}

export type IdPrefix = "E" | "T" | "R";

/** "E3" from "E3", "e3" or "3" (for prefix "E"); "" for anything else. */
export function parseId(prefix: IdPrefix, raw: string): string {
  let text = "";
  try {
    text = decodeURIComponent(String(raw ?? "")).trim();
  } catch {
    return "";
  }
  const m = new RegExp(`^${prefix}?([1-9]\\d{0,8})$`, "i").exec(text);
  return m ? prefix + m[1] : "";
}
export const parseEventId = (raw: string) => parseId("E", raw);
export const parseTicketId = (raw: string) => parseId("T", raw);

/** The number inside an id: 3 for "E3"; 0 when there is none. */
export const idNumber = (id: string): number => Number(/^[ETR]([1-9]\d{0,8})$/.exec(id)?.[1] ?? 0);
