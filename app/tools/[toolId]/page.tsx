import { notFound } from "next/navigation";
import dynamic from "next/dynamic";
import { Construction } from "lucide-react";
import { getToolById, getCategoryByToolId, allTools } from "@/lib/tools";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Dynamic imports for tool components
const toolComponents: Record<string, React.ComponentType> = {
  "px-to-rem": dynamic(() => import("@/components/tools/px-to-rem").then(mod => mod.PxToRemTool)),
  "word-counter": dynamic(() => import("@/components/tools/word-counter").then(mod => mod.WordCounterTool)),
  "qr-genny": dynamic(() => import("@/components/tools/qr-generator").then(mod => mod.QrGeneratorTool)),
  "code-genny": dynamic(() => import("@/components/tools/code-generator").then(mod => mod.CodeGeneratorTool)),
  "image-converter": dynamic(() => import("@/components/tools/image-converter").then(mod => mod.ImageConverterTool)),
  "artwork-enhancer": dynamic(() => import("@/components/tools/artwork-enhancer").then(mod => mod.ArtworkEnhancerTool)),
  "regex-tester": dynamic(() => import("@/components/tools/regex-tester").then(mod => mod.RegexTesterTool)),
  "line-height-calc": dynamic(() => import("@/components/tools/line-height-calc").then(mod => mod.LineHeightCalcTool)),
  "placeholder-genny": dynamic(() => import("@/components/tools/placeholder-genny").then(mod => mod.PlaceholderGennyTool)),
  "meta-tag-genny": dynamic(() => import("@/components/tools/meta-tag-genny").then(mod => mod.MetaTagGennyTool)),
  "paper-sizes": dynamic(() => import("@/components/tools/paper-sizes").then(mod => mod.PaperSizesTool)),
  "svg-optimiser": dynamic(() => import("@/components/tools/svg-optimiser").then(mod => mod.SvgOptimiserTool)),
  "favicon-genny": dynamic(() => import("@/components/tools/favicon-genny").then(mod => mod.FaviconGennyTool)),
  "image-splitter": dynamic(() => import("@/components/tools/image-splitter").then(mod => mod.ImageSplitterTool)),
  "typo-calc": dynamic(() => import("@/components/tools/typo-calc").then(mod => mod.TypoCalcTool)),
  "glyph-browser": dynamic(() => import("@/components/tools/glyph-browser").then(mod => mod.GlyphBrowserTool)),
  "font-explorer": dynamic(() => import("@/components/tools/font-explorer").then(mod => mod.FontExplorerTool)),
  "colour-converter": dynamic(() => import("@/components/tools/colour-converter").then(mod => mod.ColourConverterTool)),
  "tailwind-shades": dynamic(() => import("@/components/tools/tailwind-shades").then(mod => mod.TailwindShadesTool)),
  "harmony-genny": dynamic(() => import("@/components/tools/harmony-genny").then(mod => mod.HarmonyGennyTool)),
  "palette-genny": dynamic(() => import("@/components/tools/palette-genny").then(mod => mod.PaletteGennyTool)),
  "palette-collection": dynamic(() => import("@/components/tools/palette-collection").then(mod => mod.PaletteCollectionTool)),
  "tailwind-cheatsheet": dynamic(() => import("@/components/tools/tailwind-cheatsheet").then(mod => mod.TailwindCheatsheetTool)),
  "markdown-writer": dynamic(() => import("@/components/tools/markdown-writer").then(mod => mod.MarkdownWriterTool)),
  "social-cropper": dynamic(() => import("@/components/tools/social-cropper").then(mod => mod.SocialCropperTool)),
  "matte-generator": dynamic(() => import("@/components/tools/matte-generator").then(mod => mod.MatteGeneratorTool)),
  "scroll-generator": dynamic(() => import("@/components/tools/scroll-generator").then(mod => mod.ScrollGeneratorTool)),
  "watermarker": dynamic(() => import("@/components/tools/watermarker").then(mod => mod.WatermarkerTool)),
  "contrast-checker": dynamic(() => import("@/components/tools/contrast-checker").then(mod => mod.ContrastCheckerTool)),
  "colorblind-sim": dynamic(() => import("@/components/tools/colorblind-sim").then(mod => mod.ColorblindSimTool)),
  "background-remover": dynamic(() => import("@/components/tools/background-remover").then(mod => mod.BackgroundRemoverTool)),
  "zine-imposer": dynamic(() => import("@/components/tools/zine-imposer").then(mod => mod.ZineImposerTool)),
  "gradient-genny": dynamic(() => import("@/components/tools/gradient-genny").then(mod => mod.GradientGennyTool)),
};

interface ToolPageProps {
  params: Promise<{
    toolId: string;
  }>;
}

export async function generateStaticParams() {
  return allTools.map((tool) => ({
    toolId: tool.id,
  }));
}

export async function generateMetadata({ params }: ToolPageProps) {
  const { toolId } = await params;
  const tool = getToolById(toolId);

  if (!tool) {
    return {
      title: "Tool Not Found",
    };
  }

  return {
    title: `${tool.name} - delphitools`,
    description: tool.description,
  };
}

export default async function ToolPage({ params }: ToolPageProps) {
  const { toolId } = await params;
  const tool = getToolById(toolId);
  const category = getCategoryByToolId(toolId);

  if (!tool) {
    notFound();
  }

  const Icon = tool.icon;
  const ToolComponent = toolComponents[toolId];

  return (
    <div className="p-6 md:p-8 lg:p-10">
      <div className="max-w-4xl mx-auto">
        {/* Tool Header */}
        <div className="mb-8">
          <div className="flex items-start gap-4 mb-4">
            <div className="flex size-14 items-center justify-center rounded-xl bg-primary/10">
              <Icon className="size-7 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold tracking-tight">{tool.name}</h1>
                {category && (
                  <Badge variant="secondary">{category.name}</Badge>
                )}
                {tool.beta && (
                  <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">Beta</Badge>
                )}
                {tool.new && (
                  <Badge variant="outline" className="border-primary/50 text-primary">New</Badge>
                )}
              </div>
              <p className="text-muted-foreground mt-1">{tool.description}</p>
            </div>
          </div>
        </div>

        {/* Tool Content */}
        {ToolComponent ? (
          <ToolComponent />
        ) : (
          <>
            {/* Placeholder Content */}
            <Card className="border-dashed">
              <CardHeader className="text-center pb-4">
                <div className="flex justify-center mb-4">
                  <div className="flex size-16 items-center justify-center rounded-full bg-muted">
                    <Construction className="size-8 text-muted-foreground" />
                  </div>
                </div>
                <CardTitle className="text-xl">Coming Soon</CardTitle>
                <CardDescription className="max-w-md mx-auto">
                  This tool is currently under construction. Check back soon for the
                  full implementation.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/50 rounded-lg p-8 text-center">
                  <p className="text-sm text-muted-foreground mb-4">
                    Tool interface will appear here
                  </p>
                  <div className="flex flex-col gap-3 max-w-sm mx-auto">
                    <div className="h-10 bg-muted rounded-md animate-pulse" />
                    <div className="h-10 bg-muted rounded-md animate-pulse" />
                    <div className="h-24 bg-muted rounded-md animate-pulse" />
                    <div className="h-10 bg-primary/20 rounded-md animate-pulse" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Feature Preview */}
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="p-4 rounded-lg border bg-card">
                <h3 className="font-medium mb-1">Browser-based</h3>
                <p className="text-sm text-muted-foreground">
                  All processing happens locally in your browser
                </p>
              </div>
              <div className="p-4 rounded-lg border bg-card">
                <h3 className="font-medium mb-1">No uploads</h3>
                <p className="text-sm text-muted-foreground">
                  Your files never leave your computer
                </p>
              </div>
              <div className="p-4 rounded-lg border bg-card">
                <h3 className="font-medium mb-1">Free forever</h3>
                <p className="text-sm text-muted-foreground">
                  No subscriptions, no hidden costs
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
