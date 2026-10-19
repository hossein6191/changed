import { ImageResponse } from "next/og";

import { PAPER, markDataUri } from "@/lib/mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// The app icon: the red ticket stub with its bent corner, on newsprint.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: PAPER }}>
        <img src={markDataUri({ size: 156 })} width={156} height={156} alt="" />
      </div>
    ),
    size,
  );
}
