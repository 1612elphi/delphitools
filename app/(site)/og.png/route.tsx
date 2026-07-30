import { ImageResponse } from "next/og";
import { Frame, Hero, SiteUrl, OG_SIZE, ogFonts } from "@/lib/og-card";

/** Share card for the site root: the hero art in the frame, no title line — the art carries the wordmark. */
// a route with no params has to say so to be prerendered under output: "export"
export const dynamic = "force-static";

export async function GET() {
  return new ImageResponse(
    (
      <Frame>
        <Hero />
        <SiteUrl gap={0} />
      </Frame>
    ),
    { ...OG_SIZE, fonts: ogFonts },
  );
}
