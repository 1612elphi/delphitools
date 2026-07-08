"use client";

import { useSyncExternalStore } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Undo2, Redo2, Maximize2, Check, Search, ClipboardX, Copy, Download, Trash2, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { subscribe, undo, redo, canUndo, canRedo } from "@/lib/substrata/doc-store";
import { getToast, subscribeToast, type ToastId } from "@/lib/substrata/toast";
import { hint } from "@/lib/substrata/hint";

/**
 * Top-bar status slot: shows the undo/redo buttons, but when a toast fires it
 * swaps them out for a transient status pill, then swaps back. The toast text is
 * \u2211CG (keyed by ToastId); icons are set here. Reduced-motion respected.
 */

const ICON = "size-[13px]";
const TOASTS: Record<ToastId, { icon: React.ReactNode; text: string }> = {
  "canvas-fit": { icon: <Maximize2 className={ICON} />, text: "Fit to view" },
  saved: { icon: <Check className={ICON} />, text: "Saved" },
  "storage-off": { icon: <Trash2 className={ICON} />, text: "Storage off" },
  "image-added": { icon: <ImagePlus className={ICON} />, text: "Image added" },
  "zoom-100": { icon: <Search className={ICON} />, text: "Zoom 100%" },
  copied: { icon: <Copy className={ICON} />, text: "Copied" },
  "paste-empty": { icon: <ClipboardX className={ICON} />, text: "Nothing to paste" },
  exported: { icon: <Download className={ICON} />, text: "Exported" },
  "wand-needs-layer": { icon: <ImagePlus className={ICON} />, text: "Select a layer first" },
  "open-failed": { icon: <ClipboardX className={ICON} />, text: "Couldn't open that file" },
};

export function ToastSlot() {
  const t = useSyncExternalStore(subscribeToast, getToast, () => null);
  const undoable = useSyncExternalStore(subscribe, canUndo, () => false);
  const redoable = useSyncExternalStore(subscribe, canRedo, () => false);

  // Undo/redo stay PUT — the toast pill floats to their left instead of
  // replacing them (clarity review: the safety net vanished for ~1.8s right
  // after every action, exactly when a beginner reaches for it).
  return (
    <MotionConfig reducedMotion="user">
      <div className="relative flex h-7 items-center gap-1">
        <AnimatePresence initial={false}>
          {t && (
            <motion.div
              key={`toast-${t.seq}`}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.16 }}
              className="absolute right-full top-1/2 flex -translate-y-1/2 items-center gap-1.5 whitespace-nowrap px-2 text-[11px] font-medium text-primary"
            >
              {TOASTS[t.id].icon}
              {TOASTS[t.id].text}
            </motion.div>
          )}
        </AnimatePresence>
        <Button variant="ghost" size="icon" className="size-7" disabled={!undoable} onClick={() => undo()} {...hint("Undo")}>
          <Undo2 className="size-[15px]" />
        </Button>
        <Button variant="ghost" size="icon" className="size-7" disabled={!redoable} onClick={() => redo()} {...hint("Redo")}>
          <Redo2 className="size-[15px]" />
        </Button>
      </div>
    </MotionConfig>
  );
}
