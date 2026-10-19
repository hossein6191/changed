import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Organizer's desk",
  description: "Open an event on your own terms, with a folder of your site for notices, and follow its escrow, its cancel and its settles.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
