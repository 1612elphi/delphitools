// Exports derived from the live editor doc. Markdown is canonical; HTML is
// rendered via DOMSerializer so it matches the on-screen rendering exactly.
import { DOMSerializer } from "prosemirror-model";
import type { Node as PMNode } from "prosemirror-model";
import { downloadText } from "@/lib/download";
import { injectPrintStyles, printHtmlInIframe } from "@/lib/print-pdf";
import { schema } from "./schema";
import { serializeDoc } from "./markdown";

function docToBodyHtml(doc: PMNode): string {
  const fragment = DOMSerializer.fromSchema(schema).serializeFragment(doc.content);
  const div = document.createElement("div");
  div.appendChild(fragment);
  return div.innerHTML;
}

function standaloneHtml(bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Document</title></head><body>${bodyHtml}</body></html>`;
}

export function exportMarkdown(doc: PMNode): void {
  downloadText(serializeDoc(doc), "document.md", "text/markdown;charset=utf-8");
}

export function exportHtml(doc: PMNode): void {
  const html = injectPrintStyles(standaloneHtml(docToBodyHtml(doc)));
  downloadText(html, "document.html", "text/html;charset=utf-8");
}

export async function copyRichText(doc: PMNode): Promise<void> {
  const html = standaloneHtml(docToBodyHtml(doc));
  const markdown = serializeDoc(doc);
  await navigator.clipboard.write([
    new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([markdown], { type: "text/plain" }),
    }),
  ]);
}

export function exportPdf(doc: PMNode): void {
  printHtmlInIframe(injectPrintStyles(standaloneHtml(docToBodyHtml(doc))));
}
