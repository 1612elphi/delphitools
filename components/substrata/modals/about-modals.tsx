"use client";

import Link from "next/link";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AboutDelphitoolsBody } from "@/components/about-delphitools";
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
        {"Substrata is a simple, uncomplicated image editor for the browser, based on Fabric.JS."}
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
  // same body as the main site's sidebar About dialog (single source of truth)
  return (
    <DialogContent
      className="max-h-[80vh] max-w-lg gap-0 overflow-y-auto border-2 border-border p-0"
      aria-describedby={undefined}
    >
      <DialogHeader className="border-b-2 border-border px-4 py-3 text-left">
        <DialogTitle className="pr-8 text-sm font-bold uppercase tracking-wide">
          About delphitools
        </DialogTitle>
      </DialogHeader>
      <div className="px-4 py-4">
        <AboutDelphitoolsBody />
      </div>
    </DialogContent>
  );
}
