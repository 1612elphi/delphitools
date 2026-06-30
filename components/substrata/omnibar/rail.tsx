"use client";

import { useSyncExternalStore } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { getPinned, subscribePins, type ModuleId } from "@/lib/substrata/pin-pref";
import { ModuleBox } from "@/components/substrata/omnibar/modules";

const EMPTY: readonly ModuleId[] = [];
const EASE = [0.2, 0.7, 0.3, 1] as const;

/**
 * Utility rail (§8) — the pinned modules at uniform height, on the canvas side of
 * the omnibar. Modules animate in/out on pin/unpin (rise + fade + scale) and the
 * remaining modules reflow via layout (FLIP), matching the mockup. Horizontal row
 * for top/bottom docking, vertical column for left/right. Returns null when empty
 * (so the dock leaves no phantom gap); honours prefers-reduced-motion.
 */
export function Rail({ vertical }: { vertical: boolean }) {
  const pinned = useSyncExternalStore(subscribePins, getPinned, () => EMPTY);
  if (pinned.length === 0) return null;

  // Modules enter/leave from the omnibar side: along Y for a horizontal bar,
  // along X for a vertical one.
  const offset = vertical ? { x: 10 } : { y: 10 };

  return (
    <MotionConfig reducedMotion="user">
      <div
        className={cn(
          "pointer-events-auto flex gap-3.5",
          vertical ? "flex-col items-start" : "flex-wrap items-end justify-center",
        )}
      >
        <AnimatePresence mode="popLayout">
          {pinned.map((id) => (
            <motion.div
              key={id}
              layout
              initial={{ opacity: 0, scale: 0.97, ...offset }}
              animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, ...offset }}
              transition={{ duration: 0.24, ease: EASE }}
              className="border border-border bg-background shadow-lg"
            >
              <ModuleBox id={id} inRail />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
