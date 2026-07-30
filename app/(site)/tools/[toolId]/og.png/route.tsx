import { ImageResponse } from "next/og";
import { getToolById, toolPageParams } from "@/lib/tools";
import { Frame, TileBand, Mark, Title, Subtitle, SiteUrl, OG_SIZE, ogFonts } from "@/lib/og-card";

/**
 * Share card (og:image) for each tool, rendered to PNG at build time by satori.
 * A route handler rather than the opengraph-image.tsx convention: that one exports
 * as an extensionless file, which Cloudflare Pages serves as application/octet-stream
 * and scrapers then reject. The og.png path keeps the extension. The <meta> tags that
 * point here are in ../page.tsx.
 */
export function generateStaticParams() {
  return toolPageParams();
}

export async function GET(_request: Request, { params }: { params: Promise<{ toolId: string }> }) {
  const { toolId } = await params;
  const tool = getToolById(toolId);

  return new ImageResponse(
    (
      <Frame>
        <TileBand />
        <Mark />
        <Title>{tool?.name ?? "delphitools"}</Title>
        <Subtitle>a free tool on delphitools</Subtitle>
        <SiteUrl />
      </Frame>
    ),
    { ...OG_SIZE, fonts: ogFonts },
  );
}
