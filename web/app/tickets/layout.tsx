import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My tickets",
  description: "Every ticket this wallet holds, what each is waiting for, where its price is, and the refund or settle that is open.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
