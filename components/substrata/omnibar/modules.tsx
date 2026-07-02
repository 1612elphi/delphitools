"use client";

import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { togglePin, type ModuleId } from "@/lib/substrata/pin-pref";
import { LayersBody, LayersCount } from "@/components/substrata/modules/layers-panel";
import { InspectorBody } from "@/components/substrata/modules/inspector-panel";
import { ColourBody, ColourName } from "@/components/substrata/modules/colour-panel";
import { ArrangeBody } from "@/components/substrata/modules/arrange-panel";

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
  inspector: { id: "inspector", title: "Inspector", width: "w-[236px]", body: <InspectorBody /> },
  colour: { id: "colour", title: "Colour", width: "w-[236px]", body: <ColourBody />, sub: <ColourName /> },
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
          "flex h-[30px] items-center gap-2 border-b border-border bg-card pl-[11px] pr-[7px]",
          variant === "rail" && "sticky top-0 z-[2]",
        )}
      >
        <span className="text-[10.5px] font-bold uppercase tracking-wide">{def.title}</span>
        {def.sub != null && <span className="ml-auto text-[10px] text-muted-foreground">{def.sub}</span>}
        {closable && (
          <button
            onClick={() => togglePin(id)}
            // ∑CG: close/unpin button aria-label. sample: "Close panel"
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
      <div className={cn(variant === "rail" && "min-h-0 flex-1 overflow-auto")}>{def.body}</div>
    </div>
  );
}
