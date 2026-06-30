"use client";

import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { togglePin, type ModuleId } from "@/lib/substrata/pin-pref";
import { LayersBody, LayersCount } from "@/components/substrata/modules/layers-panel";

/**
 * Module registry + box wrapper. One definition per omnibar module; the SAME
 * content renders in the hover-peek bloom (unpinned) or the rail (pinned). The
 * box supplies the header (title · sub · unpin-when-pinned). Layers is the real
 * module; the rest are placeholders until the modals pass. Titles = mockup words.
 */

export interface ModuleDef {
  id: ModuleId;
  title: string;
  width: string;
  body: React.ReactNode;
  sub?: React.ReactNode;
}

function Placeholder() {
  return (
    <div className="flex items-center gap-2 p-2.5">
      <Plus className="size-3.5 text-muted-foreground/50" />
      {/* ∑CG: empty module placeholder — real module UI lands in the modals pass */}
      <span className="text-[11px] text-muted-foreground">∑CG</span>
    </div>
  );
}

export const MODULES: Record<ModuleId, ModuleDef> = {
  layers: { id: "layers", title: "Layers", width: "w-[224px]", body: <LayersBody />, sub: <LayersCount /> },
  effects: { id: "effects", title: "Effects", width: "w-[296px]", body: <Placeholder /> },
  inspector: { id: "inspector", title: "Inspector", width: "w-[224px]", body: <Placeholder /> },
  colour: { id: "colour", title: "Colour", width: "w-[224px]", body: <Placeholder /> },
  export: { id: "export", title: "Export", width: "w-[224px]", body: <Placeholder /> },
  csize: { id: "csize", title: "Canvas size", width: "w-[224px]", body: <Placeholder /> },
  align: { id: "align", title: "Align", width: "w-[224px]", body: <Placeholder /> },
  rotate: { id: "rotate", title: "Rotate & flip", width: "w-[224px]", body: <Placeholder /> },
};

/** Uniform rail height (the §8 "every pinned module is the same height"). */
const RAIL_H = "h-[300px]";

export function ModuleBox({ id, inRail = false }: { id: ModuleId; inRail?: boolean }) {
  const def = MODULES[id];
  return (
    <div className={cn(def.width, inRail && cn("flex flex-col overflow-hidden", RAIL_H))}>
      <div
        className={cn(
          "flex h-[30px] items-center gap-2 border-b border-border bg-card pl-[11px] pr-[7px]",
          inRail && "sticky top-0 z-[2]",
        )}
      >
        <span className="text-[10.5px] font-bold uppercase tracking-wide">{def.title}</span>
        {def.sub != null && <span className="ml-auto text-[10px] text-muted-foreground">{def.sub}</span>}
        {inRail && (
          <button
            onClick={() => togglePin(id)}
            // ∑CG: unpin button aria-label. sample: "Unpin from rail"
            aria-label="∑CG"
            className={cn(
              "grid size-[22px] place-items-center text-muted-foreground hover:bg-accent hover:text-foreground",
              def.sub == null && "ml-auto",
            )}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <div className={cn(inRail && "min-h-0 flex-1 overflow-auto")}>{def.body}</div>
    </div>
  );
}
