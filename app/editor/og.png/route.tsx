import { ImageResponse } from "next/og";
import { Frame, TileBand, Mark, Title, Subtitle, SiteUrl, OG_SIZE, ogFonts } from "@/lib/og-card";

/** Share card for the Substrata editor. Same frame as the tool cards — see lib/og-card.tsx. */
// a route with no params has to say so to be prerendered under output: "export"
export const dynamic = "force-static";

export async function GET() {
  return new ImageResponse(
    (
      <Frame>
        <TileBand />
        <Mark />
        <Title>Substrata</Title>
        <Subtitle>the delphitools image editor</Subtitle>
        <SiteUrl />
      </Frame>
    ),
    { ...OG_SIZE, fonts: ogFonts },
  );
}
