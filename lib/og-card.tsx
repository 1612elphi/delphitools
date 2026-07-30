import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";

/**
 * Shared frame and parts for the share cards (og:image) rendered by satori at
 * build time. Server-only: reads fonts and art off disk at module load, so it
 * must never be pulled into a client bundle. The cards live at
 * app/(site)/og.png, app/(site)/tools/[toolId]/og.png and app/editor/og.png.
 */

export const OG_SIZE = { width: 1200, height: 630 };

// Hex, because satori has no oklch parser. CREAM and SUB are the light-theme
// --background and --primary from app/globals.css; the other three are picked to
// match Ruby's sketch (the token greens clip out of gamut at that lightness).
const CREAM = "#faf5e6";
const BORDER = "#1b5e20";
const TITLE = "#14481a";
const SUB = "#1e6626";
const URL_SAGE = "#93a98d";

const assets = join(process.cwd(), "assets/og");
const read = (file: string) => readFileSync(join(assets, file));
const dataUri = (file: string, type: string) => `data:${type};base64,${read(file).toString("base64")}`;

export const ogFonts = [
  { name: "Quattro", data: read("quattro-italic-700.ttf"), weight: 700 as const, style: "normal" as const },
  { name: "Quattro", data: read("quattro-italic-400.ttf"), weight: 400 as const, style: "normal" as const },
];

const MARK = dataUri("mark.jpg", "image/jpeg");

const heroFile = read("hero.png");
const HERO = `data:image/png;base64,${heroFile.toString("base64")}`;
/** IHDR width/height, so re-exporting the art at another size cannot stretch it. */
const HERO_ASPECT = heroFile.readUInt32BE(16) / heroFile.readUInt32BE(20);

/** Green border, cream field. Children stack from the bottom up; absolute ones sit where they say. */
export function Frame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        padding: 14,
        backgroundColor: BORDER,
        fontFamily: "Quattro",
      }}
    >
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          flex: 1,
          overflow: "hidden",
          backgroundColor: CREAM,
          paddingLeft: 56,
          paddingRight: 56,
          paddingBottom: 40,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Tiled wordmark band across the top, each row offset so the seams don't line up. */
export function TileBand() {
  return (
    <div
      style={{
        position: "absolute",
        top: -30,
        left: 0,
        display: "flex",
        flexDirection: "column",
        color: SUB,
        opacity: 0.4,
        maskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)",
        fontSize: 46,
        fontWeight: 700,
        lineHeight: 1.3,
      }}
    >
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} style={{ marginLeft: -60 - row * 95, whiteSpace: "nowrap" }}>
          {"delphitools ".repeat(9)}
        </div>
      ))}
    </div>
  );
}

export function Mark() {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- satori renders this, it never reaches the DOM
    <img src={MARK} alt="" width={168} height={168} style={{ position: "absolute", right: 36, bottom: 30 }} />
  );
}

/** The hero art, centred in whatever room is left above the URL line. */
export function Hero() {
  return (
    <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- satori renders this, it never reaches the DOM */}
      <img src={HERO} alt="" width={1000} height={Math.round(1000 / HERO_ASPECT)} />
    </div>
  );
}

export function Title({ children }: { children: string }) {
  const size = children.length <= 14 ? 104 : children.length <= 20 ? 88 : children.length <= 26 ? 68 : 56;
  return (
    <div style={{ display: "flex", fontSize: size, fontWeight: 700, color: TITLE, lineHeight: 1.1 }}>{children}</div>
  );
}

export function Subtitle({ children }: { children: string }) {
  const size = children.length <= 30 ? 40 : 34;
  return (
    <div style={{ display: "flex", marginTop: 22, fontSize: size, fontWeight: 700, color: SUB, lineHeight: 1.2 }}>
      {children}
    </div>
  );
}

export function SiteUrl({ gap = 96 }: { gap?: number }) {
  return (
    <div style={{ display: "flex", marginTop: gap, fontSize: 34, color: URL_SAGE }}>https://delphi.tools/</div>
  );
}
