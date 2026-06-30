"use client";

import { useSyncExternalStore } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { getPinned, subscribePins, type ModuleId } from "@/lib/substrata/pin-pref";
import { getModuleDockAll, subscribeDock } from "@/lib/substrata/dock-pref";
import { ModuleBox } from "@/components/substrata/omnibar/modules";

const EMPTY: readonly ModuleId[] = [];
const EASE = [0.2, 0.7, 0.3, 1] as const;

/**
 * Edge sidebar (§8 docking) — holds the pinned modules whose dock target is this
 * side. A fixed-width vertical column flanking the canvas; appears only when it
 * holds a module. Modules slide in/out from the outer edge and reflow (FLIP) on
 * change, consistent with the rail.
 */
export function Sidebar({ side }: { side: "left" | "right" }) {
  const pinned = useSyncExternalStore(subscribePins, getPinned, () => EMPTY);
  const docks = useSyncExternalStore(subscribeDock, getModuleDockAll, getModuleDockAll);
  const mods = pinned.filter((id) => docks[id] === side);
  if (mods.length === 0) return null;

  const dx = side === "left" ? -10 : 10;

  return (
    <MotionConfig reducedMotion="user">
      <div
        className={cn(
          "flex w-56 shrink-0 flex-col overflow-y-auto border-border bg-background",
          side === "left" ? "border-r" : "border-l",
        )}
      >
        <AnimatePresence mode="popLayout">
          {mods.map((id) => (
            <motion.div
              key={id}
              layout
              initial={{ opacity: 0, x: dx }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dx }}
              transition={{ duration: 0.2, ease: EASE }}
              className="border-b border-border last:border-b-0"
            >
              <ModuleBox id={id} variant="dock" />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
