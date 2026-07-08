"use client";

import { GripVertical, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { togglePin, type ModuleId } from "@/lib/substrata/pin-pref";
import { useDraggable } from "@dnd-kit/core";
import { hint } from "@/lib/substrata/hint";
import { LayersBody, LayersCount } from "@/components/substrata/modules/layers-panel";
import { InspectorBody } from "@/components/substrata/modules/inspector-panel";
import { ColourBody, ColourName } from "@/components/substrata/modules/colour-panel";
import { ArrangeBody } from "@/components/substrata/modules/arrange-panel";
import { FxBody, FxSub } from "@/components/substrata/modules/fx-panel";
import { LooksBody, LooksSub } from "@/components/substrata/modules/looks-panel";

/**
 * Module registry + box wrapper. One definition per omnibar module; the SAME
 * content renders in the hover-peek bloom (unpinned) or the rail (pinned). The
 * box supplies the header (title · sub · unpin-when-pinned). All six modules
 * are real. Titles = mockup/omnibar words ("FX" matches its omnibar trigger —
 * the module holds adjustments + effects; the film-sim/LUT family lives in
 * LOOKS, whose category Ruby hasn't named yet → its title is the \u2211CG gap).
 */

export interface ModuleDef {
  id: ModuleId;
  title: string;
  width: string;
  body: React.ReactNode;
  sub?: React.ReactNode;
}

export const MODULES: Record<ModuleId, ModuleDef> = {
  layers: { id: "layers", title: "Layers", width: "w-[224px]", body: <LayersBody />, sub: <LayersCount /> },
  effects: { id: "effects", title: "FX", width: "w-[296px]", body: <FxBody />, sub: <FxSub /> },
  inspector: { id: "inspector", title: "Inspector", width: "w-[236px]", body: <InspectorBody /> },
  colour: { id: "colour", title: "Colour", width: "w-[236px]", body: <ColourBody />, sub: <ColourName /> },
  looks: { id: "looks", title: "Looks", width: "w-[312px]", body: <LooksBody />, sub: <LooksSub /> },
  arrange: { id: "arrange", title: "Arrange", width: "w-[224px]", body: <ArrangeBody /> },
};

/** Uniform rail height (the §8 "every pinned module is the same height"). */
const RAIL_H = "h-[300px]";

export type ModuleVariant = "bloom" | "rail" | "dock";

/**
 * Render a module. `bloom` = hover-peek (own width, natural height); `rail` =
 * pinned in the rail (own width, uniform height, sticky header, ✕ close);
 * `dock` = pinned in a side sidebar (full sidebar width, natural height, ✕).
 */
export function ModuleBox({ id, variant = "bloom" }: { id: ModuleId; variant?: ModuleVariant }) {
  const def = MODULES[id];
  const closable = variant !== "bloom";
  return (
    <div
      className={cn(
        variant === "dock" ? "w-full" : def.width,
        variant === "rail" && cn("flex flex-col overflow-hidden", RAIL_H),
      )}
    >
      <div
        className={cn(
          "flex h-[30px] items-center gap-1.5 border-b border-border bg-card pl-1 pr-[7px]",
          variant === "rail" && "sticky top-0 z-[2]",
        )}
      >
        <ModuleGrip id={id} />
        <span className="text-[10.5px] font-bold uppercase tracking-wide">{def.title}</span>
        {def.sub != null && <span className="ml-auto text-[10px] text-muted-foreground">{def.sub}</span>}
        {closable && (
          <button
            onClick={() => togglePin(id)}
            aria-label="Close panel"
            className={cn(
              "grid size-[22px] place-items-center text-muted-foreground hover:bg-accent hover:text-foreground",
              def.sub == null && "ml-auto",
            )}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <div className={cn(variant === "rail" && "min-h-0 flex-1 overflow-auto")}>{def.body}</div>
    </div>
  );
}

/** Drag-to-dock grip (dnd-kit draggable) — the visible affordance that
 *  replaced the Workspace-menu dock rows; works from the bloom too (a drop
 *  also pins). The shell's DndContext owns sensors + the drop dispatch. */
function ModuleGrip({ id }: { id: ModuleId }) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `dock-module-${id}`,
    data: { kind: "module", id },
  });
  return (
    <span
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="grid h-full w-4 shrink-0 cursor-grab touch-none place-items-center text-muted-foreground/60 outline-none hover:text-foreground"
      // ∑CG: aria-label + tooltip for the module drag-to-dock grip
      //   sample: "Drag to dock"
      {...hint("∑CG")}
    >
      <GripVertical className="size-3" />
    </span>
  );
}
