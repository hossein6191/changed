"use client";

// The wall around every page: the masthead with the mark, the five places to go and the wallet,
// ruled off with a thick and a thin line; the demo strip in mock mode; the wrong-chain banner; and the
// footer printed in ink. Under 900 px the places fold into a menu, so the masthead fits a 375 px phone
// with no sideways scroll.

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Wordmark } from "@/components/logo";
import { MockBar } from "@/components/mock-bar";
import { WalletButton, WrongChainBanner } from "@/components/wallet";
import { EXPLORER_URL, contractInUse, isMock } from "@/lib/chain";
import { REPO_URL } from "@/lib/config";
import { cx } from "@/lib/cx";

const PLACES = [
  { href: "/event", label: "Demo festival" },
  { href: "/tickets", label: "My tickets" },
  { href: "/organizer", label: "Organizer" },
  { href: "/ledger", label: "Ledger" },
  { href: "/how", label: "How it works" },
];

const isHere = (path: string, href: string) => path === href || (href === "/event" && path.startsWith("/event/"));

export function AppFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname() || "/";
  const [open, setOpen] = React.useState(false);
  const [lastPath, setLastPath] = React.useState(path);
  if (lastPath !== path) {
    setLastPath(path);
    setOpen(false);
  }
  const contract = contractInUse();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-paper/95">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-3 px-4 pt-3 pb-2.5">
          <Link href="/" className="min-w-0 shrink-0 no-underline" aria-label="Changed, home">
            <Wordmark />
          </Link>
          <nav aria-label="Places" className="hidden min-w-0 items-center gap-1 min-[900px]:flex">
            {PLACES.map((p) => {
              const here = isHere(path, p.href);
              return (
                <Link
                  key={p.href}
                  href={p.href}
                  aria-current={here ? "page" : undefined}
                  className={cx(
                    "px-2.5 py-1.5 text-[14px] font-bold tracking-[0.06em] whitespace-nowrap uppercase no-underline",
                    here ? "bg-ink text-sheet" : "text-ink-2 hover:bg-mustard-wash hover:text-ink",
                  )}
                >
                  {p.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex min-w-0 items-center gap-2">
            {!isMock && <WalletButton />}
            <button
              type="button"
              className="h-9 border-2 border-ink bg-sheet px-3 text-[13px] font-bold tracking-[0.06em] uppercase min-[900px]:hidden"
              aria-expanded={open}
              aria-controls="place-menu"
              onClick={() => setOpen((o) => !o)}
            >
              {open ? "Close" : "Menu"}
            </button>
          </div>
        </div>
        <div className="double-rule mx-auto max-w-[1180px]" aria-hidden="true" />
        {open && (
          <nav id="place-menu" aria-label="Places" className="mt-2 border-y-2 border-ink bg-sheet min-[900px]:hidden">
            <ul className="mx-auto grid max-w-[1180px] grid-cols-2 gap-1.5 px-4 py-3">
              {PLACES.map((p) => {
                const here = isHere(path, p.href);
                return (
                  <li key={p.href}>
                    <Link
                      href={p.href}
                      aria-current={here ? "page" : undefined}
                      className={cx("block border-2 border-ink px-3 py-2 text-[14px] font-bold uppercase no-underline", here ? "bg-ink text-sheet" : "bg-sheet text-ink")}
                    >
                      {p.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </header>
      <div className="mt-2">
        {isMock && <MockBar />}
        <WrongChainBanner />
      </div>
      <main id="main" className="mx-auto w-full max-w-[1180px] flex-1 px-4 pt-7 pb-16">
        {children}
      </main>
      <footer className="bg-ink text-sheet">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-3 px-4 py-6 text-[13.5px] sm:flex-row sm:items-center sm:justify-between">
          <p>
            <span className="display text-[18px] tracking-[0.04em] uppercase">Changed</span> · an Intelligent Contract on GenLayer Studio. Every festival, venue, band and person on
            this site is fictional.
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            {contract && (
              <a className="link" href={`${EXPLORER_URL}/address/${contract}`} target="_blank" rel="noreferrer">
                {isMock ? "Demo contract" : "The contract"}
              </a>
            )}
            <a className="link" href="/notices/new-date.html">
              Demo notices
            </a>
            {REPO_URL && (
              <a className="link" href={REPO_URL} target="_blank" rel="noreferrer">
                Source
              </a>
            )}
          </p>
        </div>
      </footer>
    </div>
  );
}
