// The few small line icons the site uses, drawn on a 20-unit grid in the current text colour.

import * as React from "react";

type IconProps = { size?: number; className?: string };

function Svg({ size = 18, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {children}
    </svg>
  );
}

export const IconExternal = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11 4h5v5M16 4l-7 7M14 12v3.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5H8" />
  </Svg>
);

export const IconRefresh = (p: IconProps) => (
  <Svg {...p}>
    <path d="M16 6.5A6.5 6.5 0 1 0 16.4 12M16 3v3.5h-3.5" />
  </Svg>
);

export const IconWallet = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 6.5h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1v-10a1.5 1.5 0 0 1 1.5-1.5h9.5" />
    <circle cx="13.2" cy="11.5" r="1" />
  </Svg>
);

export const IconDrop = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 3.2c2.4 3 4.6 5.6 4.6 8.2a4.6 4.6 0 0 1-9.2 0c0-2.6 2.2-5.2 4.6-8.2Z" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10.5l3.6 3.5L16 6" />
  </Svg>
);

export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 3.5 17.5 16.5h-15Z M10 8.5v3.5 M10 14.3v.2" />
  </Svg>
);

export const IconTicket = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 6h14v2.6a1.6 1.6 0 0 0 0 3V14H3v-2.4a1.6 1.6 0 0 0 0-3Z M12.5 6.5v7" strokeDasharray="0" />
  </Svg>
);

export const IconPage = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 2.5h7l3.5 3.5v11.5h-10.5Z M12 2.5V6h3.5 M7.5 10h5 M7.5 13h5" />
  </Svg>
);
