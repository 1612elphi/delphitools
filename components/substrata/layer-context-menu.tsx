"use client";

import { useSyncExternalStore } from "react";
import {
  ArrowDown,
  Grid2x2,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  Check,
  Clipboard,
  Copy,
  Eye,
  EyeOff,
  Frame,
  Grid3x3,
  Group,
  ImagePlus,
  Lock,
  LockOpen,
  Magnet,
  Maximize2,
  Search,
  SquareDashed,
  Trash2,
  Ungroup,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { getSnapshot, subscribe } from "@/lib/substrata/doc-store";
import { canRasterize, rasterizeLayer } from "@/lib/substrata/rasterize-ops";
import {
  closeLayerMenu,
  getLayerMenu,
  subscribeLayerMenu,
  type MenuState,
} from "@/lib/substrata/context-menu";
import { findLayer, isGroup, selectableLeafIds, siblingListOf } from "@/lib/substrata/layer-tree";
import {
  deleteLayers,
  duplicateLayers,
  groupLayers,
  reorderLayers,
  toggleLock,
  toggleVisibility,
  ungroupLayer,
  type ReorderDirection,
} from "@/lib/substrata/layer-ops";
import { importClipboardImage, importImageFile } from "@/lib/substrata/import-raster";
import { setSelection } from "@/lib/substrata/selection";
import { getGuides, subscribeGuides, toggleGuide } from "@/lib/substrata/guides-pref";
import { viewport } from "@/lib/substrata/viewport";
import { openModal } from "@/lib/substrata/modal";
import type { SubstrataDoc } from "@/lib/substrata/doc-model";

/**
 * The one context menu (right-click; Ruby 2026-07-03), mounted by the shell
 * and opened by any surface via the context-menu store. Two bodies: LAYER
 * (canvas hit / panel row — acts on the target ids) and CANVAS (blank space —
 * paste/place at the scene point, view + guides + canvas actions). Built on
 * the installed Popover with a virtual point anchor: portal, Escape/outside
 * dismiss, and viewport collision-flipping for free. Item labels are standard
 * editor vocabulary = functional chrome (BLEND_OPTIONS precedent).
 */
export function LayerContextMenu() {
  const menu = useSyncExternalStore(subscribeLayerMenu, getLayerMenu, () => null);
  const doc = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const guides = useSyncExternalStore(subscribeGuides, getGuides, getGuides);
  if (!menu || !doc) return null;

  return (
    <Popover open onOpenChange={(open) => !open && closeLayerMenu()}>
      <PopoverAnchor asChild>
        <span aria-hidden className="fixed size-0" style={{ left: menu.x, top: menu.y }} />
      </PopoverAnchor>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={2}
        className="w-[184px] border-border p-0 text-[11px]"
        onContextMenu={(e) => e.preventDefault()}
      >
        {menu.kind === "layer" ? (
          <LayerMenuBody menu={menu} doc={doc} />
        ) : (
          <CanvasMenuBody menu={menu} doc={doc} grid={guides.grid} snap={guides.snap} />
        )}
      </PopoverContent>
    </Popover>
  );
}

function LayerMenuBody({ menu, doc }: { menu: Extract<MenuState, { kind: "layer" }>; doc: SubstrataDoc }) {
  const ids = menu.ids.filter((id) => findLayer(doc.layers, id));
  if (ids.length === 0) return null;
  const primary = findLayer(doc.layers, ids[ids.length - 1])!;

  // Group when the selection shares ONE sibling list (the panel-footer rule);
  // ordering shares the same constraint.
  const list = siblingListOf(doc.layers, ids[0]);
  const sameSiblings = !!list && ids.every((id) => list.some((l) => l.id === id));
  const canGroup = ids.length >= 2 && sameSiblings;
  const canUngroup = ids.length === 1 && isGroup(primary);

  const run = (action: () => void) => () => {
    action();
    closeLayerMenu();
  };
  const restack = (dir: ReorderDirection) => run(() => reorderLayers(ids, dir));

  return (
    <>
      <Item icon={Copy} label="Duplicate" hint="⌘D" onClick={run(() => duplicateLayers(ids))} />
      {/* Rasterize (M3-15): bake vector/text content so the raster pipelines
          (filters/effects, SELECT cut) apply. Standard vocabulary chrome. */}
      {(() => {
        const rasterizable = doc
          ? ids.filter((id) => {
              const l = findLayer(doc.layers, id);
              return l !== null && canRasterize(l);
            })
          : [];
        return (
          <Item
            icon={Grid2x2}
            label="Rasterize"
            disabled={rasterizable.length === 0}
            onClick={run(() => rasterizable.forEach((id) => void rasterizeLayer(id)))}
          />
        );
      })()}
      {canUngroup ? (
        <Item icon={Ungroup} label="Ungroup" hint="⇧⌘G" onClick={run(() => ungroupLayer(primary.id))} />
      ) : (
        <Item icon={Group} label="Group" hint="⌘G" disabled={!canGroup} onClick={run(() => groupLayers(ids))} />
      )}
      <Rule />
      <Item icon={ArrowUpToLine} label="Bring to Front" hint="⇧⌘]" disabled={!sameSiblings} onClick={restack("front")} />
      <Item icon={ArrowUp} label="Bring Forward" hint="⌘]" disabled={!sameSiblings} onClick={restack("forward")} />
      <Item icon={ArrowDown} label="Send Backward" hint="⌘[" disabled={!sameSiblings} onClick={restack("backward")} />
      <Item icon={ArrowDownToLine} label="Send to Back" hint="⇧⌘[" disabled={!sameSiblings} onClick={restack("back")} />
      <Rule />
      <Item
        icon={primary.visible ? EyeOff : Eye}
        label={primary.visible ? "Hide" : "Show"}
        onClick={run(() => ids.forEach((id) => toggleVisibility(id)))}
      />
      <Item
        icon={primary.locked ? LockOpen : Lock}
        label={primary.locked ? "Unlock" : "Lock"}
        onClick={run(() => ids.forEach((id) => toggleLock(id)))}
      />
      <Rule />
      <Item icon={Trash2} label="Delete" hint="⌫" destructive onClick={run(() => deleteLayers(ids))} />
    </>
  );
}

function CanvasMenuBody({
  menu,
  doc,
  grid,
  snap,
}: {
  menu: Extract<MenuState, { kind: "canvas" }>;
  doc: SubstrataDoc;
  grid: boolean;
  snap: boolean;
}) {
  const at = menu.scene;
  const run = (action: () => void) => () => {
    action();
    closeLayerMenu();
  };

  const selectable = selectableLeafIds(doc.layers);

  const placeImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void importImageFile(file, { at });
    };
    input.click();
  };

  return (
    <>
      <Item icon={Clipboard} label="Paste" hint="⌘V" onClick={run(() => void importClipboardImage({ at }))} />
      <Item icon={ImagePlus} label="Place Image…" onClick={run(placeImage)} />
      <Rule />
      <Item
        icon={SquareDashed}
        label="Select All"
        hint="⌘A"
        disabled={selectable.length === 0}
        onClick={run(() => setSelection(selectable))}
      />
      <Rule />
      <Item icon={Maximize2} label="Zoom to Fit" hint="⌘0" onClick={run(() => viewport.fit())} />
      <Item icon={Search} label="Zoom to 100%" hint="⌘1" onClick={run(() => viewport.setZoom(1))} />
      <Rule />
      {/* toggles stay open — the checkmark is the feedback */}
      <Item icon={Grid3x3} label="Grid" checked={grid} onClick={() => toggleGuide("grid")} />
      <Item icon={Magnet} label="Snap" checked={snap} onClick={() => toggleGuide("snap")} />
      <Rule />
      <Item icon={Frame} label="Canvas Size…" onClick={run(() => openModal("canvas-size"))} />
    </>
  );
}

function Rule() {
  return <div aria-hidden className="h-px bg-border" />;
}

function Item({
  icon: Icon,
  label,
  hint,
  onClick,
  disabled = false,
  destructive = false,
  checked,
}: {
  icon: LucideIcon;
  label: string;
  /** keyboard combo, shown right-aligned — only for combos the keymap delivers */
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  /** presence renders a trailing check slot (menu toggles: Grid/Snap) */
  checked?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      role={checked !== undefined ? "menuitemcheckbox" : undefined}
      aria-checked={checked}
      className={cn(
        "flex h-8 w-full items-center gap-2 px-2.5 text-left",
        destructive
          ? "text-destructive hover:bg-destructive/10"
          : "text-foreground hover:bg-accent hover:text-accent-foreground",
        "disabled:pointer-events-none disabled:opacity-35",
      )}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && <span className="shrink-0 text-[9.5px] text-muted-foreground">{hint}</span>}
      {checked && <Check className="size-3.5 shrink-0 text-primary" />}
    </button>
  );
}
