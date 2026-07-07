"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  Undo2,
  Redo2,
  Maximize2,
  Download,
  ChevronDown,
  Plus,
  Image as ImageIcon,
  Move,
  Type,
  Sparkles,
  Scissors,
  Copy,
  ClipboardPaste,
  CopyPlus,
  Trash2,
  BoxSelect,
  PanelTop,
  PanelBottom,
  PanelLeft,
  PanelRight,
  CornerDownRight,
  Dock,
  Minus,
  Ruler,
  Grid3x3,
  Magnet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { subscribe, getSnapshot, undo, redo, canUndo, canRedo } from "@/lib/substrata/doc-store";
import { getPersistenceEnabled, subscribePersistence } from "@/lib/substrata/persistence-pref";
import { openModal } from "@/lib/substrata/modal";
import {
  getOmnibarEdge,
  setOmnibarEdge,
  getRailEdge,
  setRailEdge,
  getModuleDockAll,
  setModuleDock,
  subscribeDock,
  type Edge,
  type RailEdge,
  type DockTarget,
} from "@/lib/substrata/dock-pref";
import { setPinned, type ModuleId } from "@/lib/substrata/pin-pref";
import { getGuides, subscribeGuides, toggleGuide } from "@/lib/substrata/guides-pref";
import { getZoom, subscribeViewport, viewport } from "@/lib/substrata/viewport";
import { toast } from "@/lib/substrata/toast";
import { importImageFile } from "@/lib/substrata/import-raster";
import { PersistenceToggle } from "@/components/substrata/persistence-toggle";
import { ToastSlot } from "@/components/substrata/toast-slot";

/**
 * Top bar (§7) — parity with sketches/mockup.html. Functional chrome labels use
 * the mockup's words; voice-y microcopy (scene name placeholder, save status)
 * stays ∑CG. Wired: undo/redo, theme, import, the Scene-info inspector, and the
 * persistence-aware status dot. Stubbed (visual only, no-op): zoom, export,
 * file ops (New/Open/Save/…), the Edit history list, the ACXV keypad, and the
 * Workspace docking toggles — those land with M5/M6 and the docking system.
 */

type MenuId = "scene" | "edit" | "workspace" | "help";

export function TopBar() {
  const [open, setOpen] = useState<MenuId | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const doc = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const undoable = useSyncExternalStore(subscribe, canUndo, () => false);
  const redoable = useSyncExternalStore(subscribe, canRedo, () => false);
  const persistOn = useSyncExternalStore(subscribePersistence, getPersistenceEnabled, () => false);
  const zoom = useSyncExternalStore(subscribeViewport, getZoom, () => 1);

  // Click outside any menu root closes the open menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-menu-root]")) setOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const toggle = (id: MenuId) => setOpen((cur) => (cur === id ? null : id));
  const close = () => setOpen(null);

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) for (const f of Array.from(files)) if (f.type.startsWith("image/")) void importImageFile(f);
    e.target.value = "";
  };

  return (
    <div className="relative z-50 flex h-[46px] shrink-0 items-center gap-1 border-b border-border bg-card px-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onPickFiles}
      />

      {/* Left: home · wordmark · menubar */}
      <Link
        href="/"
        // ∑CG: home/back-to-tools affordance tooltip
        //   spec: ≤24 chars; "back to delphitools tools". sample: "delphitools — all tools"
        aria-label="∑CG"
        className="grid size-[30px] place-items-center"
      >
        <img
          src="/delphi-lowlod.png"
          alt=""
          className="size-[22px] border-2"
          style={{ borderColor: "oklch(0.32 0.07 145)" }}
        />
      </Link>
      <span className="mx-0.5 mr-1.5 text-[13px] font-semibold">Substrata</span>
      <span className="mx-1 h-[18px] w-px bg-border" />

      <nav className="flex">
        <Menu id="scene" label="Scene" open={open} onToggle={toggle}>
          <SceneMenu doc={doc} persistOn={persistOn} onImport={() => { fileInputRef.current?.click(); close(); }} onClose={close} />
        </Menu>
        <Menu id="edit" label="Edit" open={open} onToggle={toggle}>
          <EditMenu undoable={undoable} redoable={redoable} onClose={close} />
        </Menu>
        <Menu id="workspace" label="Workspace" open={open} onToggle={toggle}>
          <WorkspaceMenu />
        </Menu>
        <Menu id="help" label="Help" open={open} onToggle={toggle}>
          <HelpMenu />
        </Menu>
      </nav>

      {/* Centre: scene name + save status */}
      <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2.5">
        <span className="flex cursor-pointer items-center gap-1.5 px-2 py-1 text-[12.5px] font-medium hover:bg-accent">
          {/* ∑CG: scene-name placeholder when unnamed
              spec: ≤18 chars; the default scene title. sample: "Untitled scene" */}
          {doc?.name?.trim() ? doc.name : "∑CG"}
          <ChevronDown className="size-3" />
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className={cn("size-[7px] rounded-full", persistOn ? "bg-primary" : "bg-muted-foreground/40")} />
          {/* ∑CG: local save status — must read as stored in THIS browser, not the cloud
              spec: ≤22 chars; saved / saving / unsaved / off. British spelling.
              sample: "Saved in browser" · "Saving…" · "Off" */}
          ∑CG
        </span>
      </div>

      {/* Right: undo/redo (swaps to a status toast) · zoom · fit · export · theme */}
      <div className="ml-auto flex items-center gap-1">
        <ToastSlot />
        <span className="mx-1 h-[18px] w-px bg-border" />
        <div className="flex items-center border border-border">
          <button onClick={() => viewport.zoomOut()} className="grid size-[26px] place-items-center text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="∑CG">−</button>
          <button onClick={() => viewport.cycle()} className="grid h-[26px] min-w-[46px] place-items-center border-x border-border text-[11.5px] tabular-nums hover:bg-accent" aria-label="∑CG">
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={() => viewport.zoomIn()} className="grid size-[26px] place-items-center text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="∑CG">+</button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="∑CG"
          onClick={() => {
            viewport.fit();
            toast("canvas-fit");
          }}
        >
          <Maximize2 className="size-[15px]" />
        </Button>
        <span className="mx-1 h-[18px] w-px bg-border" />
        <button
          type="button"
          onClick={() => openModal("export")}
          className="flex h-[30px] items-center gap-1.5 bg-primary px-3 text-[12.5px] font-semibold text-primary-foreground hover:brightness-105"
        >
          <Download className="size-[15px]" />
          Export
        </button>
        <ThemeToggle />
      </div>
    </div>
  );
}

/* ── menu shell ────────────────────────────────────────────────────────────── */

function Menu({
  id,
  label,
  open,
  onToggle,
  children,
}: {
  id: MenuId;
  label: string;
  open: MenuId | null;
  onToggle: (id: MenuId) => void;
  children: React.ReactNode;
}) {
  const isOpen = open === id;
  return (
    <div data-menu-root className="relative">
      <button
        onClick={() => onToggle(id)}
        className={cn(
          "flex h-[30px] select-none items-center px-2.5 text-[12.5px]",
          isOpen ? "bg-accent" : "hover:bg-accent",
        )}
      >
        {label}
      </button>
      {isOpen && <div className="absolute left-0 top-full z-[60] pt-px">{children}</div>}
    </div>
  );
}

/** A box in a dropdown (the .ebox: bg + hairline + shadow). */
function Box({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("border border-border bg-background shadow-lg", className)}>{children}</div>;
}

/** A plain menu item row with optional shortcut hint. */
function Item({ label, hint, onClick }: { label: string; hint?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className="flex cursor-default items-center justify-between gap-6 whitespace-nowrap px-3 py-1.5 text-xs hover:bg-accent"
    >
      <span>{label}</span>
      {hint && <span className="text-[10.5px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

function Sep() {
  return <div className="my-1 h-px bg-border" />;
}

/* ── Scene: file menu + document inspector ───────────────────────────────────── */

function SceneMenu({
  doc,
  persistOn,
  onImport,
  onClose,
}: {
  doc: ReturnType<typeof getSnapshot>;
  persistOn: boolean;
  onImport: () => void;
  onClose: () => void;
}) {
  const ab = doc?.artboard;
  return (
    <div className="min-w-[224px] space-y-2">
      <Box>
        <div className="py-1">
          <Item label="New scene" hint="⌘N" onClick={onClose} />
          <Item label="Open…" hint="⌘O" onClick={onClose} />
          <Item label="Open recent" hint="›" />
          <Item label="Import image…" hint="⌘I" onClick={onImport} />
          <Item
            label="Canvas size…"
            onClick={() => {
              onClose();
              openModal("canvas-size");
            }}
          />
          <Sep />
          <Item label="Save" hint="⌘S" onClick={onClose} />
          <Item label="Save a copy…" hint="⇧⌘S" onClick={onClose} />
          <Item
            label="Export…"
            hint="⌘E"
            onClick={() => {
              onClose();
              openModal("export");
            }}
          />
          <Sep />
          <Item label="Rename" onClick={onClose} />
          <Item label="Duplicate" onClick={onClose} />
          <Item label="Delete" onClick={onClose} />
          <Sep />
          <Link href="/" className="block">
            <Item label="Back to delphitools" />
          </Link>
        </div>
      </Box>
      <Box>
        <div className="border-b border-border px-3 pb-[5px] pt-2 text-[9.5px] uppercase tracking-wide text-muted-foreground">
          Scene info
        </div>
        <DiRow label="Dimensions" value={ab ? `${ab.width} × ${ab.height} px` : "—"} />
        <DiRow label="Resolution" value={ab ? `${ab.resolution} ppi` : "—"} />
        <DiRow label="Bit depth" value="8-bit / ch" />
        <DiRow label="Colour" value="sRGB" />
        <DiRow label="Layers" value={String(doc?.layers.length ?? 0)} />
        <DiRow label="Stored" value={persistOn ? "Local" : "Off"} />
      </Box>
      <Box>
        <PersistenceToggle />
      </Box>
    </div>
  );
}

function DiRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-[5px] text-[11.5px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/* ── Edit: undo/redo + history list + ACXV keypad ────────────────────────────── */

function EditMenu({
  undoable,
  redoable,
  onClose,
}: {
  undoable: boolean;
  redoable: boolean;
  onClose: () => void;
}) {
  return (
    <div className="min-w-[240px] space-y-2">
      <Box>
        <div className="flex border-b border-border">
          <UrButton icon={<Undo2 className="size-[15px]" />} label="Undo" hint="⌘Z" disabled={!undoable} onClick={() => undo()} />
          <UrButton icon={<Redo2 className="size-[15px]" />} label="Redo" hint="⇧⌘Z" disabled={!redoable} onClick={() => redo()} className="border-l border-border" />
        </div>
        {/* Visual stub — real labelled history wiring is a follow-up (current
            history is unlabelled snapshots). Parity with the mockup for now. */}
        <div className="max-h-[148px] overflow-y-auto">
          <HRow icon={<Plus className="size-3" />} label="New" />
          <HRow icon={<ImageIcon className="size-3" />} label="Photo" />
          <HRow icon={<Move className="size-3" />} label="Move" />
          <HRow icon={<Type className="size-3" />} label="Text" />
          <HRow icon={<Sparkles className="size-3" />} label="Bokeh" current />
          <HRow icon={<Maximize2 className="size-3" />} label="Resize" future />
          <HRow icon={<Sparkles className="size-3" />} label="Blur" future />
        </div>
      </Box>
      <Box>
        <div className="segmented grid-cols-3">
          <Ab icon={<Scissors className="size-[15px]" />} label="Cut" onClick={onClose} />
          <Ab icon={<Copy className="size-[15px]" />} label="Copy" onClick={onClose} />
          <Ab icon={<ClipboardPaste className="size-[15px]" />} label="Paste" onClick={onClose} />
          <Ab icon={<CopyPlus className="size-[15px]" />} label="Duplicate" onClick={onClose} />
          <Ab icon={<Trash2 className="size-[15px]" />} label="Delete" onClick={onClose} />
          <Ab icon={<BoxSelect className="size-[15px]" />} label="Select all" onClick={onClose} />
        </div>
      </Box>
    </div>
  );
}

function UrButton({
  icon,
  label,
  hint,
  disabled,
  onClick,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-10 flex-1 items-center justify-center gap-1.5 text-[12.5px] font-semibold hover:bg-accent disabled:opacity-40",
        className,
      )}
    >
      {icon}
      {label}
      <span className="text-[10px] font-normal text-muted-foreground">{hint}</span>
    </button>
  );
}

function HRow({
  icon,
  label,
  current,
  future,
}: {
  icon: React.ReactNode;
  label: string;
  current?: boolean;
  future?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-7 cursor-default items-center gap-2.5 px-[11px] text-xs",
        current && "bg-primary/10 font-semibold text-primary",
        future ? "text-muted-foreground opacity-55" : "hover:bg-accent",
      )}
    >
      <span className={current ? "text-primary" : "text-muted-foreground"}>{icon}</span>
      {label}
      {current && (
        <span className="ml-auto text-[8px] font-bold uppercase tracking-wide text-primary">now</span>
      )}
    </div>
  );
}

function Ab({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-[50px] cursor-default flex-col items-center justify-center gap-1.5 bg-background text-[10px] hover:bg-accent"
    >
      {icon}
      {label}
    </button>
  );
}

/* ── Workspace: docking + guides (visual stubs) ──────────────────────────────── */

const EDGE_TO_LETTER: Record<Edge, string> = { top: "T", bottom: "B", left: "L", right: "R" };
const LETTER_TO_EDGE: Record<string, Edge> = { T: "top", B: "bottom", L: "left", R: "right" };

const SEG_ICON_CLS = "size-3.5";
/** Shared seg-key → icon map. Keys are consistent across rows (L = dock-left
 *  everywhere, etc.); a key with no icon (e.g. "67%") falls back to its text. */
const SEG_ICON: Record<string, React.ReactNode> = {
  "↳": <CornerDownRight className={SEG_ICON_CLS} />,
  T: <PanelTop className={SEG_ICON_CLS} />,
  B: <PanelBottom className={SEG_ICON_CLS} />,
  L: <PanelLeft className={SEG_ICON_CLS} />,
  R: <PanelRight className={SEG_ICON_CLS} />,
  Rail: <Dock className={SEG_ICON_CLS} />,
  "−": <Minus className={SEG_ICON_CLS} />,
  "+": <Plus className={SEG_ICON_CLS} />,
  Fit: <Maximize2 className={SEG_ICON_CLS} />,
  Rulers: <Ruler className={SEG_ICON_CLS} />,
  Grid: <Grid3x3 className={SEG_ICON_CLS} />,
  Snap: <Magnet className={SEG_ICON_CLS} />,
};
const renderSeg = (s: string): React.ReactNode => SEG_ICON[s] ?? s;

const DOCK_TO_LETTER: Record<DockTarget, string> = { left: "L", right: "R", rail: "Rail" };
const LETTER_TO_DOCK: Record<string, DockTarget> = { L: "left", R: "right", Rail: "rail" };
const RAIL_TO_LETTER: Record<RailEdge, string> = { follow: "↳", top: "T", bottom: "B", left: "L", right: "R" };
const LETTER_TO_RAIL: Record<string, RailEdge> = { "↳": "follow", T: "top", B: "bottom", L: "left", R: "right" };

function DockRow({ label, id, docks }: { label: string; id: ModuleId; docks: Record<ModuleId, DockTarget> }) {
  return (
    <WRow
      label={label}
      seg={["L", "R", "Rail"]}
      active={DOCK_TO_LETTER[docks[id]]}
      onSelect={(s) => {
        setModuleDock(id, LETTER_TO_DOCK[s]);
        setPinned(id, true); // placing a module also shows it
      }}
      render={renderSeg}
    />
  );
}

function WorkspaceMenu() {
  const edge = useSyncExternalStore(subscribeDock, getOmnibarEdge, () => "bottom" as Edge);
  const guides = useSyncExternalStore(subscribeGuides, getGuides, getGuides);
  const rail = useSyncExternalStore(subscribeDock, getRailEdge, () => "follow" as RailEdge);
  const docks = useSyncExternalStore(subscribeDock, getModuleDockAll, getModuleDockAll);
  const zoom = useSyncExternalStore(subscribeViewport, getZoom, () => 1);
  const pct = `${Math.round(zoom * 100)}%`;
  return (
    <Box className="min-w-[254px] py-1">
      <WRow
        label="Omnibar"
        seg={["T", "B", "L", "R"]}
        active={EDGE_TO_LETTER[edge]}
        onSelect={(s) => setOmnibarEdge(LETTER_TO_EDGE[s])}
        render={renderSeg}
      />
      <WRow
        label="Rail"
        seg={["↳", "T", "B", "L", "R"]}
        active={RAIL_TO_LETTER[rail]}
        onSelect={(s) => setRailEdge(LETTER_TO_RAIL[s])}
        render={renderSeg}
      />
      <Sep />
      <div className="px-3 pb-0.5 pt-1.5 text-[9.5px] uppercase tracking-wide text-muted-foreground">
        Dock modules
      </div>
      <DockRow label="Layers" id="layers" docks={docks} />
      <DockRow label="Effects" id="effects" docks={docks} />
      <DockRow label="Inspector" id="inspector" docks={docks} />
      <DockRow label="Colour" id="colour" docks={docks} />
      <Sep />
      <WRow
        label="Zoom"
        seg={["−", pct, "+", "Fit"]}
        onSelect={(s) => {
          if (s === "−") viewport.zoomOut();
          else if (s === "+") viewport.zoomIn();
          else if (s === "Fit") {
            viewport.fit();
            toast("canvas-fit");
          } else viewport.cycle();
        }}
        render={renderSeg}
      />
      {/* All four are live: Rulers draw + drag out Guides (2026-07-07);
          Grid + Snap since M2-12. "Guides" = visibility of dragged guidelines. */}
      <WRow
        label="Guides"
        seg={["Rulers", "Guides", "Grid", "Snap"]}
        on={[
          guides.rulers && "Rulers",
          guides.guides && "Guides",
          guides.grid && "Grid",
          guides.snap && "Snap",
        ].filter((s): s is string => typeof s === "string")}
        onSelect={(s) => toggleGuide(s.toLowerCase() as "rulers" | "guides" | "grid" | "snap")}
        render={renderSeg}
      />
      <Sep />
      <Item label="Theme" onClick={toggleTheme} />
    </Box>
  );
}

function toggleTheme() {
  const next = !document.documentElement.classList.contains("dark");
  document.documentElement.classList.toggle("dark", next);
  try {
    localStorage.setItem("theme", next ? "dark" : "light");
  } catch {
    /* storage blocked — theme still toggles for the session */
  }
}

function WRow({
  label,
  seg,
  on,
  active,
  onSelect,
  render,
}: {
  label: string;
  seg: string[];
  on?: string[];
  active?: string;
  onSelect?: (seg: string) => void;
  render?: (seg: string) => React.ReactNode;
}) {
  const isOn = (s: string) => (active !== undefined ? s === active : (on ?? []).includes(s));
  return (
    <div className="flex items-center justify-between gap-3.5 px-3 py-[5px] text-xs">
      <span>{label}</span>
      <div className="segmented grid-flow-col text-[10.5px]">
        {seg.map((s) => (
          <span
            key={s}
            title={s}
            onClick={() => onSelect?.(s)}
            className={cn(
              "grid h-[22px] min-w-[22px] place-items-center px-1.5",
              isOn(s) ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
              onSelect ? "cursor-pointer" : "cursor-default",
            )}
          >
            {render ? render(s) : s}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Help ────────────────────────────────────────────────────────────────────── */

function HelpMenu() {
  return (
    <Box className="min-w-[218px] py-1">
      <Item label="Keyboard shortcuts" hint="?" />
      <Item label="About Substrata" />
      <Item label="About delphitools" />
      <a href="https://github.com/1612elphi/delphitools" target="_blank" rel="noopener noreferrer" className="block">
        <Item label="Source · GitHub" />
      </a>
    </Box>
  );
}
