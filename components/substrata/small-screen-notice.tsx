"use client";

import { useSyncExternalStore } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Small-screen notice (Ruby 2026-07-12): a dismissible banner on sub-768px
 * viewports — the editor works there but isn't designed for it yet. Wording
 * is Ruby's dictation, shipped verbatim. Dismissal sticks via localStorage
 * (the layout-pref precedent: UI ergonomics, not document content).
 * Non-blocking: fixed above the canvas chrome, the editor stays usable.
 */

const SEEN_KEY = "substrata:small-screen-notice-seen";

const listeners = new Set<() => void>();
function isSeen(): boolean {
  try {
    return !!localStorage.getItem(SEEN_KEY);
  } catch {
    return false;
  }
}
function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // storage blocked — the notice returns next visit, acceptable
  }
  for (const l of listeners) l();
}
function subscribeSeen(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function SmallScreenNotice() {
  const isMobile = useIsMobile();
  const seen = useSyncExternalStore(subscribeSeen, isSeen, () => true);

  if (!isMobile || seen) return null;

  return (
    <div className="fixed left-1/2 top-1/2 z-40 w-[calc(100vw-32px)] max-w-sm -translate-x-1/2 -translate-y-1/2 border-2 border-border bg-background shadow-lg">
      <p className="px-3 pt-3 text-xs leading-relaxed text-muted-foreground">
        Substrata works best on a bigger screen. You can still use it here, but please
        don&rsquo;t email me about issues arising from your screen being too small. I&rsquo;m
        actively working on a mobile version, please be patient.
      </p>
      <p className="px-3 pb-1 pt-2 text-xs text-muted-foreground">Love, delphi</p>
      <div className="mt-2 border-t-2 border-border">
        <button
          type="button"
          onClick={markSeen}
          className="h-11 w-full bg-primary text-sm font-semibold text-primary-foreground hover:brightness-105"
        >
          all right all right
        </button>
      </div>
    </div>
  );
}
