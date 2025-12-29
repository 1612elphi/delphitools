"use client";

import { useState } from "react";
import { Copy, Check, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    <div className="space-y-6">
      {/* Title */}
      <div className="space-y-2">
        <div className="flex justify-between">
          <label className="font-bold">Page Title</label>
          <span className={`text-sm ${titleLength > 60 ? "text-destructive" : "text-muted-foreground"}`}>
            {titleLength}/60
          </span>
        </div>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="My Awesome Website"
          className="text-lg h-12"
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <div className="flex justify-between">
          <label className="font-bold">Description</label>
          <span className={`text-sm ${descLength > 160 ? "text-destructive" : "text-muted-foreground"}`}>
            {descLength}/160
          </span>
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="A brief description of your page..."
          className="w-full min-h-[100px] p-3 rounded-lg border bg-background resize-y focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* URL */}
      <div className="space-y-2">
        <label className="font-bold">URL</label>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          className="font-mono"
        />
      </div>

      {/* Image */}
      <div className="space-y-2">
        <label className="font-bold">Image URL</label>
        <Input
          value={image}
          onChange={(e) => setImage(e.target.value)}
          placeholder="https://example.com/og-image.jpg"
          className="font-mono"
        />
        <p className="text-sm text-muted-foreground">
          Recommended size: 1200×630px
        </p>
      </div>

      {/* Optional Fields */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="font-bold">Site Name</label>
          <Input
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            placeholder="My Website"
          />
        </div>
        <div className="space-y-2">
          <label className="font-bold">Twitter Handle</label>
          <Input
            value={twitterHandle}
            onChange={(e) => setTwitterHandle(e.target.value)}
            placeholder="@username"
          />
        </div>
      </div>

      {/* Generated Code */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="font-bold">Generated Meta Tags</label>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPreview(!showPreview)}
          >
            <Eye className="size-4 mr-2" />
            {showPreview ? "Hide" : "Show"} Preview
          </Button>
        </div>
        <pre className="p-4 rounded-lg border bg-muted/50 overflow-x-auto text-sm font-mono whitespace-pre-wrap">
          {generateTags()}
        </pre>
        <Button size="lg" className="w-full h-14" onClick={copyTags}>
          {copied ? (
            <><Check className="size-5 mr-2" /> Copied to clipboard!</>
          ) : (
            <><Copy className="size-5 mr-2" /> Copy Meta Tags</>
          )}
        </Button>
      </div>

      {/* Preview */}
      {showPreview && (
        <div className="space-y-4">
          <h3 className="font-bold">Social Preview</h3>

          {/* Google */}
          <div className="p-4 rounded-lg border bg-card">
            <div className="text-sm text-muted-foreground mb-2">Google</div>
            <div className="space-y-1">
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

          {/* Social Card */}
          <div className="p-4 rounded-lg border bg-card">
            <div className="text-sm text-muted-foreground mb-2">Social Card</div>
            <div className="border rounded-lg overflow-hidden max-w-md">
              <div className="aspect-[1.91/1] bg-muted flex items-center justify-center">
                {image ? (
                  <img src={image} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-muted-foreground">No image</span>
                )}
              </div>
              <div className="p-3 bg-card">
                <div className="text-xs text-muted-foreground uppercase truncate">
                  {siteName || new URL(url || "https://example.com").hostname}
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
