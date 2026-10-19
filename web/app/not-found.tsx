import { StubLink } from "@/components/stub-button";

export default function NotFound() {
  return (
    <div className="bill max-w-2xl p-6">
      <p className="kicker text-red-deep">404 · nothing posted here</p>
      <h1 className="mt-2 text-[44px] uppercase">Bare wall</h1>
      <p className="mt-2 text-ink-2">This address is not part of the site. Events live under /event/E1, your tickets under /tickets.</p>
      <StubLink href="/" tone="ink" className="mt-4">
        Back to the wall
      </StubLink>
    </div>
  );
}
