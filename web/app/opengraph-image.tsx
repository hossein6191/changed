import { ImageResponse } from "next/og";

import { SITE_TAGLINE } from "@/lib/config";
import { posterFonts } from "@/lib/og-fonts";
import { INK, MUSTARD, PAPER, RED, markDataUri } from "@/lib/mark";

export const alt = "Changed: if the show changes, the money comes back. Validators read the organizer's own notice and open the refunds from escrow.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TITLE = "CHANGED";
const LINE = SITE_TAGLINE;
const SUB = "Tickets held in escrow. The validators read the organizer's own notice.";
const STUB = ["NOTICE", "MATERIAL CHANGE - REFUNDS OPEN", "MOVED TO 21 JUNE 2027", "No.", "117", "ADMIT ONE"];

// The share card: newsprint with halftone dots, a wheat-pasted poster with the promise in letterpress,
// and a ticket stub with a NOTICE slip pasted over it.
export default async function OpenGraphImage() {
  // The card prints some lines in capitals, so the font is cut to both cases of every character.
  const chars = TITLE + LINE + SUB + STUB.join("") + "HARBOUR LIGHTS ONE NIGHT ONLY 0123456789·.,:'-";
  const fonts = await posterFonts(chars + chars.toUpperCase());
  const slab = fonts.length ? "Alfa Slab One" : "serif";
  const body = fonts.length ? "Work Sans" : "sans-serif";
  const mono = fonts.length ? "Courier Prime" : "monospace";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          backgroundColor: PAPER,
          backgroundImage: "radial-gradient(rgba(20,20,20,0.10) 1.4px, transparent 1.9px)",
          backgroundSize: "14px 14px",
          fontFamily: body,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", position: "absolute", left: 60, top: 54, width: 660, height: 520, backgroundColor: "#FBF8F0", border: `3px solid ${INK}`, transform: "rotate(-1.2deg)", boxShadow: "10px 12px 0 rgba(20,20,20,0.85)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: RED, color: "#FBF8F0", padding: "14px 26px", fontFamily: slab, fontSize: 34 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <img src={markDataUri({ size: 54, tile: true })} width={54} height={54} alt="" />
              <span>{TITLE}</span>
            </div>
            <span style={{ fontFamily: mono, fontSize: 22 }}>ONE NIGHT ONLY</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", padding: "30px 30px 0" }}>
            <div style={{ fontFamily: slab, fontSize: 74, lineHeight: 0.98, color: INK, textTransform: "uppercase" }}>{LINE}</div>
            <div style={{ marginTop: 28, fontSize: 28, lineHeight: 1.3, color: "#3B3833", fontWeight: 600 }}>{SUB}</div>
          </div>
        </div>
        <div style={{ display: "flex", position: "absolute", right: 64, top: 150, width: 380, height: 210, backgroundColor: MUSTARD, border: `3px solid ${INK}`, transform: "rotate(4deg)" }}>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, padding: "0 22px", fontFamily: mono, fontSize: 22, color: INK }}>
            <span>{STUB[5]}</span>
            <span style={{ fontFamily: slab, fontSize: 40, marginTop: 6 }}>HARBOUR LIGHTS</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 96, borderLeft: `4px dashed ${INK}`, fontFamily: mono, color: INK }}>
            <span style={{ fontSize: 20 }}>{STUB[3]}</span>
            <span style={{ fontFamily: slab, fontSize: 40 }}>{STUB[4]}</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", position: "absolute", right: 90, top: 300, width: 400, backgroundColor: "#FFFDF7", border: `3px solid ${INK}`, transform: "rotate(-3deg)", boxShadow: "0 18px 24px -14px rgba(20,20,20,0.6)" }}>
          <div style={{ display: "flex", padding: "12px 18px 6px", fontFamily: slab, fontSize: 34, color: INK, borderBottom: `5px solid ${INK}` }}>{STUB[0]}</div>
          <div style={{ display: "flex", margin: "14px 18px 0", padding: "10px 12px", backgroundColor: RED, color: "#FBF8F0", fontFamily: slab, fontSize: 25 }}>{STUB[1]}</div>
          <div style={{ display: "flex", padding: "10px 18px 16px", fontFamily: mono, fontSize: 21, color: INK }}>{STUB[2]}</div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
