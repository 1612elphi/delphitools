"use client";

import { useEffect, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { PersistenceToggle } from "@/components/substrata/persistence-toggle";
import { getPersistenceEnabled, subscribePersistence } from "@/lib/substrata/persistence-pref";

/**
 * First-visit storage intro (Ruby 2026-07-11): a tiny dismissible card that
 * surfaces the opt-in local-storage toggle, which otherwise hides in the
 * Scene menu until someone loses work to the amber status dot. Embeds the
 * shipped PersistenceToggle (its strings and behaviour, unchanged); shown
 * until dismissed or storage is turned on, then never again. The seen-flag
 * lives in localStorage like the layout prefs — UI ergonomics, not document
 * content, so it is deliberately NOT gated on the storage opt-in itself.
 */

const SEEN_KEY = "substrata:storage-intro-seen";

// tiny external store over the seen-flag (the repo's useSyncExternalStore
// idiom) — the server snapshot says "seen" so the prerender never shows the
// card and hydration has nothing to mismatch
const seenListeners = new Set<() => void>();
function isSeen(): boolean {
  return !!localStorage.getItem(SEEN_KEY);
}
function markSeen(): void {
  localStorage.setItem(SEEN_KEY, "1");
  for (const l of seenListeners) l();
}
function subscribeSeen(l: () => void): () => void {
  seenListeners.add(l);
  return () => {
    seenListeners.delete(l);
  };
}

export function StorageIntro() {
  const enabled = useSyncExternalStore(subscribePersistence, getPersistenceEnabled, () => false);
  const seen = useSyncExternalStore(subscribeSeen, isSeen, () => true);

  // turning storage on (from the card OR the Scene menu) retires the card
  useEffect(() => {
    if (enabled && !seen) markSeen();
  }, [enabled, seen]);

  if (seen || enabled) return null;

  return (
    <div className="absolute bottom-3 right-3 z-20 w-[264px] border border-border bg-background shadow-lg">
      <div className="flex items-center justify-between border-b border-border py-1.5 pl-3 pr-1.5">
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
          {/* ∑CG: storage-intro card title
              spec: 2–4 word heading for the first-visit card offering browser storage; uppercase chrome style; ≤ 24 chars
              sample: "Keep your work"
          */}
          {"∑CG"}
        </span>
        <button
          type="button"
          onClick={markSeen}
          className="grid size-6 place-items-center text-muted-foreground hover:text-foreground"
          // ∑CG: storage-intro dismiss button accessible name
          //   spec: aria-label on the X button that hides the card permanently; ≤ 20 chars
          //   sample: "Dismiss"
          aria-label={"∑CG"}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      <p className="px-3 pt-2 text-[11px] leading-relaxed text-muted-foreground">
        {/* ∑CG: storage-intro card body
            spec: 1–2 sentences under the title; explains nothing is saved in the browser until the switch below is on, and off stays off; calm, no alarm; ≤ 160 chars
            sample: "Substrata saves nothing until you say so. Flip the switch to keep scenes in this browser — flip it off and every trace is gone."
        */}
        {"∑CG"}
      </p>
      <div className="px-1 pb-1">
        <PersistenceToggle />
      </div>
    </div>
  );
}
