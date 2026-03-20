"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeftRight, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const starterMarkdown = `# Markdown Preview

Write GitHub-flavored markdown here.

- [x] Live preview
- [x] GFM tables
- [x] Safe HTML output

| Tool | Output |
|---|---|
| Markdown | HTML |
| HTML | Markdown |

> Great for README files, release notes, and CMS drafts.`;

const BLOCKED_TAGS = new Set(["script", "style", "iframe", "object", "embed", "link", "meta"]);

function sanitizeHtml(html: string): string {
  if (typeof window === "undefined") return html;

  const doc = new DOMParser().parseFromString(html, "text/html");

  const walk = (node: Element) => {
    const tag = node.tagName.toLowerCase();
    if (BLOCKED_TAGS.has(tag)) {
      node.remove();
      return;
    }

    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith("on")) {
        node.removeAttribute(attr.name);
      }
      if ((name === "href" || name === "src") && value.startsWith("javascript:")) {
        node.removeAttribute(attr.name);
      }
    }

    for (const child of [...node.children]) walk(child);
  };

  for (const child of [...doc.body.children]) walk(child);
  return doc.body.innerHTML;
}

function htmlToMarkdown(html: string): string {
  if (typeof window === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");

  const convert = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const children = Array.from(el.childNodes).map(convert).join("").trim();

    switch (tag) {
      case "h1": return `# ${children}\n\n`;
      case "h2": return `## ${children}\n\n`;
      case "h3": return `### ${children}\n\n`;
      case "h4": return `#### ${children}\n\n`;
      case "h5": return `##### ${children}\n\n`;
      case "h6": return `###### ${children}\n\n`;
      case "p": return `${children}\n\n`;
      case "strong":
      case "b": return `**${children}**`;
      case "em":
      case "i": return `*${children}*`;
      case "code": return `\`${children}\``;
      case "pre": return `\n\`\`\`\n${el.textContent?.trim() ?? ""}\n\`\`\`\n\n`;
      case "a": return `[${children}](${el.getAttribute("href") ?? ""})`;
      case "blockquote": return `> ${children}\n\n`;
      case "hr": return `---\n\n`;
      case "br": return "\n";
      case "ul": return `${Array.from(el.children).map((li) => `- ${convert(li).trim()}`).join("\n")}\n\n`;
      case "ol": return `${Array.from(el.children).map((li, i) => `${i + 1}. ${convert(li).trim()}`).join("\n")}\n\n`;
      case "li": return `${Array.from(el.childNodes).map(convert).join("")}`;
      default: return `${Array.from(el.childNodes).map(convert).join("")}`;
    }
  };

  return Array.from(doc.body.childNodes).map(convert).join("").replace(/\n{3,}/g, "\n\n").trim();
}

export function MarkdownPreviewTool() {
  const [markdown, setMarkdown] = useState(starterMarkdown);
  const [htmlInput, setHtmlInput] = useState("<h2>Hello world</h2><p>Paste HTML to convert it into markdown.</p>");
  const [htmlOutput, setHtmlOutput] = useState("");
  const [copied, setCopied] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const rawHtml = previewRef.current?.innerHTML ?? "";
      setHtmlOutput(sanitizeHtml(rawHtml));
    });

    return () => cancelAnimationFrame(frame);
  }, [markdown]);

  const markdownFromHtml = useMemo(() => htmlToMarkdown(htmlInput), [htmlInput]);

  const copyRenderedHtml = async () => {
    await navigator.clipboard.writeText(htmlOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Markdown Preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="markdown-input">Markdown</Label>
          <Textarea
            id="markdown-input"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            className="min-h-56 font-mono"
            placeholder="Write markdown here..."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Rendered HTML Output</CardTitle>
          <Button variant="outline" size="sm" onClick={copyRenderedHtml}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />} Copy rendered HTML
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea value={htmlOutput} readOnly className="min-h-44 font-mono" />
          <div className="rounded-md border p-4 prose prose-sm max-w-none dark:prose-invert" ref={previewRef}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ArrowLeftRight className="size-4" /> HTML → Markdown</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="html-input">HTML Input</Label>
            <Textarea
              id="html-input"
              value={htmlInput}
              onChange={(e) => setHtmlInput(e.target.value)}
              className="min-h-40 font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="markdown-output">Markdown Output</Label>
            <Textarea id="markdown-output" value={markdownFromHtml} readOnly className="min-h-40 font-mono" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
