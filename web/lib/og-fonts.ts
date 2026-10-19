// Alfa Slab One, Work Sans and Courier Prime for the share card, fetched from Google Fonts when the card
// is built and cut down to the characters it prints. If the fetch fails the card is still built, in the
// renderer's own font.

type Font = { name: string; data: ArrayBuffer; weight: 400 | 500 | 600 | 700 | 800; style: "normal" };

async function loadGoogleFont(family: string, weight: number, text: string): Promise<ArrayBuffer> {
  const url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(url)).text();
  const resource = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/);
  if (!resource) throw new Error("no font in the stylesheet");
  const res = await fetch(resource[1]);
  if (res.status !== 200) throw new Error("font fetch failed");
  return res.arrayBuffer();
}

export async function posterFonts(text: string): Promise<Font[]> {
  try {
    const [slab, body, mono] = await Promise.all([
      loadGoogleFont("Alfa Slab One", 400, text),
      loadGoogleFont("Work Sans", 600, text),
      loadGoogleFont("Courier Prime", 700, text),
    ]);
    return [
      { name: "Alfa Slab One", data: slab, weight: 400, style: "normal" },
      { name: "Work Sans", data: body, weight: 600, style: "normal" },
      { name: "Courier Prime", data: mono, weight: 700, style: "normal" },
    ];
  } catch {
    return [];
  }
}
