// The route's own browser title, from the URL alone: no chain read, and a made-up id never reaches the title.
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const m = /^E?([1-9]\d{0,8})$/i.exec(id);
  return {
    title: m ? `Event E${m[1]}` : "Event",
    description: "One event's poster: its terms, the tickets held in escrow, every notice read against it, and the refunds or settles that are open.",
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
