"use client";

import Link from "next/link";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import pkg from "@/package.json";

/**
 * Help ▸ About panes (two tiny blocking dialogs). Product names, version and
 * links are factual data; the descriptive body text of each pane is authored
 * copy and stays a marked gap for slopsieve.
 */

function AboutShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <DialogContent
      className="max-w-sm gap-0 border-2 border-border p-0"
      aria-describedby={undefined}
    >
      <DialogHeader className="border-b-2 border-border px-4 py-3 text-left">
        <DialogTitle className="pr-8 text-sm font-bold uppercase tracking-wide">
          {/* reuses the Help-menu item's shipped label */}
          {title}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-3 px-4 py-4 text-xs">{children}</div>
    </DialogContent>
  );
}

export function AboutSubstrataModal() {
  return (
    <AboutShell title="About Substrata">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-bold">Substrata</span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">v{pkg.version}</span>
      </div>
      <p className="leading-relaxed text-muted-foreground">
        {/* ∑CG: About-Substrata body — what the editor is, in the product's voice
            spec: 1–2 sentences shown in the Help ▸ About Substrata dialog; names the editor's promise (layered image editing, in the browser, nothing uploaded); ≤ 200 chars
            sample: "A layered image editor that runs entirely in your browser. Your work never leaves this machine unless you export it."
        */}
        {"∑CG"}
      </p>
      <div className="border-t border-border pt-2 text-[11px] text-muted-foreground">
        {/* factual: part of the delphitools catalogue */}
        <Link href="/" className="underline underline-offset-2 hover:text-foreground">
          delphitools
        </Link>
      </div>
    </AboutShell>
  );
}

export function AboutDelphitoolsModal() {
  return (
    <AboutShell title="About delphitools">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-bold">delphitools</span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">v{pkg.version}</span>
      </div>
      <p className="leading-relaxed text-muted-foreground">
        {/* ∑CG: About-delphitools body — the catalogue's one-breath pitch
            spec: 1–2 sentences shown in the Help ▸ About delphitools dialog; privacy-first browser tools, no accounts, no uploads; ≤ 200 chars
            sample: "A collection of browser tools that work entirely on your device — no accounts, no uploads, no tracking."
        */}
        {"∑CG"}
      </p>
      <div className="flex gap-4 border-t border-border pt-2 text-[11px] text-muted-foreground">
        <Link href="/" className="underline underline-offset-2 hover:text-foreground">
          delphitools
        </Link>
        <a
          href="https://github.com/1612elphi/delphitools"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          GitHub
        </a>
      </div>
    </AboutShell>
  );
}
