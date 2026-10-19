import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The demo festival",
  description: "The Harbour Lights Festival on sale: buy a ticket into escrow, have the organizer announce a change, watch the network read it, and take your money back.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
