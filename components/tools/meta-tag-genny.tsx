"use client";

import { useState } from "react";
import { Copy, Check, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function MetaTagGennyTool() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [image, setImage] = useState("");
  const [siteName, setSiteName] = useState("");
  const [twitterHandle, setTwitterHandle] = useState("");
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const generateTags = () => {
    const tags: string[] = [];

    // Basic meta
    if (title) {
      tags.push(`<title>${title}</title>`);
      tags.push(`<meta name="title" content="${title}">`);
    }
    if (description) {
      tags.push(`<meta name="description" content="${description}">`);
    }

    // Open Graph
    tags.push("");
    tags.push("<!-- Open Graph / Facebook -->");
    tags.push(`<meta property="og:type" content="website">`);
    if (url) tags.push(`<meta property="og:url" content="${url}">`);
    if (title) tags.push(`<meta property="og:title" content="${title}">`);
    if (description) tags.push(`<meta property="og:description" content="${description}">`);
    if (image) tags.push(`<meta property="og:image" content="${image}">`);
    if (siteName) tags.push(`<meta property="og:site_name" content="${siteName}">`);

    // Twitter
    tags.push("");
    tags.push("<!-- Twitter -->");
    tags.push(`<meta property="twitter:card" content="summary_large_image">`);
    if (url) tags.push(`<meta property="twitter:url" content="${url}">`);
    if (title) tags.push(`<meta property="twitter:title" content="${title}">`);
    if (description) tags.push(`<meta property="twitter:description" content="${description}">`);
    if (image) tags.push(`<meta property="twitter:image" content="${image}">`);
    if (twitterHandle) tags.push(`<meta property="twitter:creator" content="${twitterHandle}">`);

    return tags.join("\n");
  };

  const copyTags = async () => {
    await navigator.clipboard.writeText(generateTags());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const titleLength = title.length;
  const descLength = description.length;

  return (
    <div className="border-2 border-border">

      {/* Form fields */}
      <div className="border-b-2 border-border">

        {/* Page Title */}
        <div className="border-b border-border p-4">
          <div className="flex items-baseline justify-between mb-2">
            <label className="font-bold">Page Title</label>
            <span className={cn("text-sm", titleLength > 60 ? "text-destructive" : "text-muted-foreground")}>
              {titleLength}/60
            </span>
          </div>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My Awesome Website"
            className="h-11 border-border"
          />
        </div>

        {/* Description */}
        <div className="border-b border-border p-4">
          <div className="flex items-baseline justify-between mb-2">
            <label className="font-bold">Description</label>
            <span className={cn("text-sm", descLength > 160 ? "text-destructive" : "text-muted-foreground")}>
              {descLength}/160
            </span>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A brief description of your page..."
            className="w-full min-h-[96px] p-3 border border-border bg-background resize-y focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* URL */}
        <div className="border-b border-border p-4">
          <label className="font-bold block mb-2">URL</label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            className="border-border"
          />
        </div>

        {/* Image URL */}
        <div className="border-b border-border p-4">
          <label className="font-bold block mb-2">Image URL</label>
          <Input
            value={image}
            onChange={(e) => setImage(e.target.value)}
            placeholder="https://example.com/og-image.jpg"
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            className="border-border"
          />
          <p className="text-sm text-muted-foreground mt-2">
            Recommended size: 1200×630px
          </p>
        </div>

        {/* Site Name + Twitter Handle — two-cell row */}
        <div className="flex">
          <div className="flex-1 p-4">
            <label className="font-bold block mb-2">Site Name</label>
            <Input
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="My Website"
              className="border-border"
            />
          </div>
          <div className="flex-1 border-l border-border p-4">
            <label className="font-bold block mb-2">Twitter Handle</label>
            <Input
              value={twitterHandle}
              onChange={(e) => setTwitterHandle(e.target.value)}
              placeholder="@username"
              className="border-border"
            />
          </div>
        </div>

      </div>

      {/* Generated Code section */}
      <div className="border-b-2 border-border">
        <div className="p-4">
          <label className="font-bold block">Generated Meta Tags</label>
        </div>
        <pre
          className="overflow-x-auto text-sm bg-muted/30 border-t border-border p-4 whitespace-pre-wrap"
          style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
        >
          {generateTags()}
        </pre>
      </div>

      {/* Action bar: Copy + Preview toggle */}
      <div className="flex items-stretch">
        <Button
          onClick={copyTags}
          className="flex-1 h-14 text-lg font-bold border-0"
        >
          {copied ? (
            <><Check className="size-5 mr-2" /> Copied to clipboard!</>
          ) : (
            <><Copy className="size-5 mr-2" /> Copy Meta Tags</>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowPreview(!showPreview)}
          className="h-14 px-5 border-0 border-l border-border"
        >
          {showPreview ? (
            <><EyeOff className="size-4 mr-2" /> Hide Preview</>
          ) : (
            <><Eye className="size-4 mr-2" /> Preview</>
          )}
        </Button>
      </div>

      {/* Social Preview */}
      {showPreview && (
        <div className="border-t-2 border-border">

          {/* Google result preview */}
          <div className="border-b border-border p-4">
            <div className="text-sm text-muted-foreground mb-3 font-bold">Google</div>
            <div className="space-y-0.5">
              <div className="text-blue-600 text-lg hover:underline cursor-pointer truncate">
                {title || "Page Title"}
              </div>
              <div className="text-green-700 text-sm truncate">
                {url || "https://example.com"}
              </div>
              <div className="text-sm text-muted-foreground line-clamp-2">
                {description || "Page description will appear here..."}
              </div>
            </div>
          </div>

          {/* Social card preview */}
          <div className="p-4">
            <div className="text-sm text-muted-foreground mb-3 font-bold">Social Card</div>
            <div className="border border-border overflow-hidden max-w-md">
              <div className="aspect-[1.91/1] bg-muted flex items-center justify-center">
                {image ? (
                  <img src={image} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-muted-foreground text-sm">No image</span>
                )}
              </div>
              <div className="p-3 border-t border-border bg-card">
                <div className="text-xs text-muted-foreground uppercase truncate">
                  {siteName || (() => { try { return new URL(url || "https://example.com").hostname; } catch { return "example.com"; } })()}
                </div>
                <div className="font-bold truncate">{title || "Page Title"}</div>
                <div className="text-sm text-muted-foreground line-clamp-2">
                  {description || "Description"}
                </div>
              </div>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
