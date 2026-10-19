// Site settings. One place for the contract address, the name, the tagline, the repository and the
// commit the demo notices are pinned to.
//
// DEMO_CONTRACT is the deployed copy the site reads when NEXT_PUBLIC_CONTRACT is unset. It is filled
// in once the contract is deployed; while both are empty every page says the contract is not
// deployed yet, and the whole site still works with NEXT_PUBLIC_MOCK=1.
export const DEMO_CONTRACT: string = "";

/**
 * The commit of the public repository whose notices/ the demo event reads, as raw.githubusercontent.com
 * serves them: every validator fetches the same bytes. Filled in once the repository is pushed;
 * NEXT_PUBLIC_NOTICES_COMMIT overrides it. While both are empty the demo organizer cannot open its event.
 */
export const NOTICES_COMMIT: string = "";

export const SITE_NAME = "Changed";
export const SITE_TAGLINE = "If the show changes, the money comes back.";
export const SITE_LINE =
  "Event tickets whose terms survive a change notice: the validators read the organizer's own notice on the live web, and if the date, the venue or the main act changed, every ticket holder takes their money back from escrow.";

/**
 * The public source repository. No account name is written into the repository: NEXT_PUBLIC_REPO_URL
 * names it, and on Vercel the repository the site was built from names it by itself (its system
 * variables NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER and _SLUG). The footer's Source link is hidden while
 * neither names one, and the demo organizer stays away, since it needs the repository to build its
 * pinned notice addresses.
 */
const builtFrom =
  process.env.NEXT_PUBLIC_VERCEL_GIT_PROVIDER === "github" && process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER && process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG
    ? `https://github.com/${process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER}/${process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG}`
    : "";
export const REPO_URL: string = process.env.NEXT_PUBLIC_REPO_URL || builtFrom || "";

/** The demo event's id when the site's server cannot name it (no key); NEXT_PUBLIC_DEMO_EVENT overrides. */
export const DEMO_EVENT_ID: string = "";

/** The contract in use: the deploy's environment first, then the committed address. */
export const contractAddress = (): string => process.env.NEXT_PUBLIC_CONTRACT || DEMO_CONTRACT || "";

/** The commit the demo notices are pinned to: 40 lowercase hex characters, or "". */
export const noticesCommit = (): string => {
  const c = (process.env.NEXT_PUBLIC_NOTICES_COMMIT || NOTICES_COMMIT || "").trim();
  return /^[0-9a-f]{40}$/.test(c) ? c : "";
};

/** The demo event's id when the site's server cannot name it. */
export const demoEventFallback = (): string => process.env.NEXT_PUBLIC_DEMO_EVENT || DEMO_EVENT_ID || "";
