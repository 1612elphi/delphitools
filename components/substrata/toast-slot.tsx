"use client";

import { useSyncExternalStore } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Undo2, Redo2, Maximize2, Check, Search, ClipboardX, Copy, Download, Trash2, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { subscribe, undo, redo, canUndo, canRedo } from "@/lib/substrata/doc-store";
import { getToast, subscribeToast, type ToastId } from "@/lib/substrata/toast";

/**
 * Top-bar status slot: shows the undo/redo buttons, but when a toast fires it
 * swaps them out for a transient status pill, then swaps back. The toast text is
 * ∑CG (keyed by ToastId); icons are set here. Reduced-motion respected.
 */

const ICON = "size-[13px]";
const TOASTS: Record<ToastId, { icon: React.ReactNode; text: string }> = {
  // ∑CG: canvas-fit toast — ≤16 chars, confirms the view was fit to the artboard.
  //   sample: "Fit to view"
  "canvas-fit": { icon: <Maximize2 className={ICON} />, text: "∑CG" },
  // ∑CG: saved toast — ≤16 chars, confirms the scene is saved IN THIS BROWSER.
  //   sample: "Saved"
  saved: { icon: <Check className={ICON} />, text: "∑CG" },
  // ∑CG: storage-off toast — ≤22 chars, confirms local storage is off + the local
  //   copy was removed. sample: "Storage off"
  "storage-off": { icon: <Trash2 className={ICON} />, text: "∑CG" },
  // ∑CG: image-added toast — ≤16 chars, confirms an image was added as a layer.
  //   sample: "Image added"
  "image-added": { icon: <ImagePlus className={ICON} />, text: "∑CG" },
  // ∑CG: zoom-reset toast — ≤16 chars, confirms zoom back to 100%.
  //   sample: "Zoom 100%"
  "zoom-100": { icon: <Search className={ICON} />, text: "∑CG" },
  // ∑CG: copied toast — ≤16 chars, confirms selection copied.
  //   sample: "Copied"
  copied: { icon: <Copy className={ICON} />, text: "∑CG" },
  // ∑CG: paste-empty toast — ≤22 chars, the clipboard held no image to paste
  //   (or reading it was blocked). sample: "Nothing to paste"
  "paste-empty": { icon: <ClipboardX className={ICON} />, text: "∑CG" },
  // ∑CG: exported toast — ≤16 chars, confirms export finished.
  //   sample: "Exported"
  exported: { icon: <Download className={ICON} />, text: "∑CG" },
  // ∑CG: wand-needs-layer toast — ≤24 chars, the wand needs an active layer
  //   to sample pixels from. sample: "Select a layer first"
  "wand-needs-layer": { icon: <ImagePlus className={ICON} />, text: "∑CG" },
  // ∑CG: open-failed toast — ≤24 chars, the picked .substrata file couldn't
  //   be read (corrupt/not a scene). The current scene is untouched.
  //   sample: "Couldn't open that file"
  "open-failed": { icon: <ClipboardX className={ICON} />, text: "∑CG" },
};

export function ToastSlot() {
  const t = useSyncExternalStore(subscribeToast, getToast, () => null);
  const undoable = useSyncExternalStore(subscribe, canUndo, () => false);
  const redoable = useSyncExternalStore(subscribe, canRedo, () => false);

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative flex h-7 items-center">
        <AnimatePresence mode="wait" initial={false}>
          {t ? (
            <motion.div
              key={`toast-${t.seq}`}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.16 }}
              className="flex items-center gap-1.5 whitespace-nowrap px-2 text-[11px] font-medium text-primary"
            >
              {TOASTS[t.id].icon}
              {TOASTS[t.id].text}
            </motion.div>
          ) : (
            <motion.div
              key="undoredo"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="flex items-center gap-1"
            >
              <Button variant="ghost" size="icon" className="size-7" disabled={!undoable} onClick={() => undo()} aria-label="∑CG">
                <Undo2 className="size-[15px]" />
              </Button>
              <Button variant="ghost" size="icon" className="size-7" disabled={!redoable} onClick={() => redo()} aria-label="∑CG">
                <Redo2 className="size-[15px]" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
