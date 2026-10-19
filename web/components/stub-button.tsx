// The site's one kind of button: a ticket stub with a notch bitten out of its left end, a dashed
// perforation just inside it and a torn right edge, standing on its own shadow until it is pressed.
// Four inks: poster red for the one thing to do, ink, mustard, and plain paper.

import * as React from "react";
import Link from "next/link";

import { cx } from "@/lib/cx";

type Tone = "red" | "ink" | "mustard" | "paper";

const cls = (tone: Tone, size: "md" | "sm", block?: boolean, className?: string) =>
  cx("tbtn", tone !== "red" && `tbtn-${tone}`, size === "sm" && "tbtn-sm", block && "tbtn-block", className);

type StubButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: Tone;
  size?: "md" | "sm";
  icon?: React.ReactNode;
  block?: boolean;
};

export function StubButton({ tone = "red", size = "md", icon, block, className, children, type = "button", ...rest }: StubButtonProps) {
  return (
    <button type={type} {...rest} className={cls(tone, size, block, className)}>
      <span className="tbtn-face">
        {icon}
        <span className="min-w-0">{children}</span>
      </span>
    </button>
  );
}

export function StubLink({ href, tone = "red", size = "md", icon, block, className, children }: { href: string; tone?: Tone; size?: "md" | "sm"; icon?: React.ReactNode; block?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cls(tone, size, block, className)}>
      <span className="tbtn-face">
        {icon}
        <span className="min-w-0">{children}</span>
      </span>
    </Link>
  );
}
