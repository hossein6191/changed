import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ledger",
  description: "Every event on the contract, newest first, and the books: what is in escrow, what went back to holders, what went to organizers, and the review credit.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
