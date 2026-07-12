"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  Undo2,
  Redo2,
  Maximize2,
  MessageSquarePlus,
  Download,
  Plus,
  Scissors,
  Copy,
  ClipboardPaste,
  CopyPlus,
  Trash2,
  BoxSelect,
  Frame,
  Minus,
  Ruler,
  Grid3x3,
  Magnet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { subscribe, getSnapshot, undo, redo, canUndo, canRedo, update } from "@/lib/substrata/doc-store";
import { getPersistenceEnabled, subscribePersistence } from "@/lib/substrata/persistence-pref";
import { openModal } from "@/lib/substrata/modal";
import { getGuides, subscribeGuides, toggleGuide } from "@/lib/substrata/guides-pref";
import { getZoom, subscribeViewport, viewport } from "@/lib/substrata/viewport";
import { toast } from "@/lib/substrata/toast";
import { importImageFile } from "@/lib/substrata/import-raster";
import { newScene, openRecent, openScene, saveScene } from "@/lib/substrata/file-ops";
import { listRecentProjects, type RecentProject } from "@/lib/substrata/autosave";
import { duplicateLayers, deleteLayers } from "@/lib/substrata/layer-ops";
import { getSelectedLayerIds, setSelection, subscribeSelection } from "@/lib/substrata/selection";
import { hint } from "@/lib/substrata/hint";
import { PersistenceToggle } from "@/components/substrata/persistence-toggle";
import { ToastSlot } from "@/components/substrata/toast-slot";

/**
 * Top bar (§7) — parity with sketches/mockup.html. Functional chrome labels use
 * the mockup's words; voice-y microcopy (scene name placeholder, save status)
 * stays \u2211CG. Wired: undo/redo, theme, import, the Scene-info inspector, and the
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
        aria-label="back to delphitools"
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
          <HelpMenu onClose={close} />
        </Menu>
      </nav>

      {/* Centre: scene name (click to rename — one undoable doc edit) + save status */}
      <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2.5">
        <SceneName name={doc?.name ?? ""} hasDoc={!!doc} />
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {/* Three-state dot: stored locally (primary) · edits at risk — storage
              off with undoable work (amber) · idle with storage off (muted). */}
          <span
            className={cn(
              "size-[7px] rounded-full",
              persistOn ? "bg-primary" : undoable ? "bg-amber-500" : "bg-muted-foreground/40",
            )}
          />
          {persistOn ? (
            <>Saved in browser</>
          ) : undoable ? (
            <>Not saved</>
          ) : (
            <>Storage off</>
          )}
        </span>
      </div>

      {/* Right: undo/redo (swaps to a status toast) · zoom · fit · export · theme */}
      <div className="ml-auto flex items-center gap-1">
        <ToastSlot />
        <span className="mx-1 h-[18px] w-px bg-border" />
        <div className="flex items-center border border-border">
          <button onClick={() => viewport.zoomOut()} className="grid size-[26px] place-items-center text-muted-foreground hover:bg-accent hover:text-foreground" {...hint("Zoom out")}>−</button>
          <button onClick={() => viewport.cycle()} className="grid h-[26px] min-w-[46px] place-items-center border-x border-border text-[11.5px] tabular-nums hover:bg-accent" {...hint("Cycle zoom")}>
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={() => viewport.zoomIn()} className="grid size-[26px] place-items-center text-muted-foreground hover:bg-accent hover:text-foreground" {...hint("Zoom in")}>+</button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          {...hint("Fit to view")}
          onClick={() => {
            viewport.fit();
            toast("canvas-fit");
          }}
        >
          <Maximize2 className="size-[15px]" />
        </Button>
        <span className="mx-1 h-[18px] w-px bg-border" />
        {/* beta feedback — the bug-report mailto Ruby specced (subject prefilled) */}
        <a
          href="mailto:tools@rmv.fyi?subject=substrata%20bug%20report"
          className="flex h-[30px] items-center gap-1.5 border border-border px-3 text-[12.5px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <MessageSquarePlus className="size-[15px]" />
          Feedback
        </a>
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

/** Scene name, click-to-rename (Ruby 2026-07-12): the centre slot swaps to an
 *  inline input; Enter/blur commit the new name as ONE undoable doc edit,
 *  Escape cancels. The name is doc content — it persists, saves into the
 *  .substrata file, and drives the export/save filenames. */
function SceneName({ name, hasDoc }: { name: string; hasDoc: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next === name.trim()) return;
    update((d) => ({ ...d, name: next }));
  };
  if (!editing) {
    return (
      <button
        type="button"
        data-scene-name
        disabled={!hasDoc}
        onClick={() => {
          setDraft(name);
          setEditing(true);
        }}
        {...hint("Rename scene")}
        className="cursor-text px-2 py-1 text-[12.5px] font-medium hover:bg-accent disabled:cursor-default"
      >
        {name.trim() ? name : "Untitled scene"}
      </button>
    );
  }
  return (
    <input
      autoFocus
      data-scene-name-input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
      className="w-[22ch] border border-border bg-background px-2 py-1 text-center text-[12.5px] font-medium outline-none focus:border-primary"
    />
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

/** A plain menu item row with optional shortcut hint. `disabled` greys the row
 *  and drops the handler — a visibly-dead item never reads as a broken one
 *  (the clarity review's "menus that lie" finding). */
function Item({
  label,
  hint,
  onClick,
  disabled,
  className,
}: {
  label: string;
  hint?: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled || undefined}
      className={cn(
        "flex cursor-default items-center justify-between gap-6 whitespace-nowrap px-3 py-1.5 text-xs",
        disabled ? "opacity-40" : "hover:bg-accent",
        className,
      )}
    >
      <span className="truncate">{label}</span>
      {hint && <span className="shrink-0 text-[10.5px] text-muted-foreground">{hint}</span>}
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
  // Recents load once per menu open (SceneMenu remounts with the dropdown);
  // gated on the persistence opt-in like every other IndexedDB read.
  const [recents, setRecents] = useState<RecentProject[]>([]);
  useEffect(() => {
    if (persistOn) void listRecentProjects().then(setRecents);
  }, [persistOn]);
  const others = recents.filter((r) => r.id !== doc?.id);
  return (
    <div className="min-w-[224px] space-y-2">
      <Box>
        <div className="py-1">
          {/* no ⌘N hint — browsers reserve it; a shortcut we can't deliver is a lie */}
          <Item
            label="New scene"
            onClick={() => {
              onClose();
              newScene();
            }}
          />
          <Item
            label="Open…"
            hint="⌘O"
            onClick={() => {
              onClose();
              void openScene();
            }}
          />
          <Item label="Open recent" disabled={others.length === 0} className={others.length > 0 ? "text-muted-foreground" : undefined} />
          {others.map((r) => (
            <Item
              key={r.id}
              label={
                r.name.trim() ||
                "Untitled scene"
              }
              hint={new Date(r.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              className="pl-6"
              onClick={() => {
                onClose();
                void openRecent(r.id);
              }}
            />
          ))}
          <Item label="Import image…" hint="⌘I" onClick={onImport} />
          <Item
            label="Canvas size…"
            onClick={() => {
              onClose();
              openModal("canvas-size");
            }}
          />
          <Sep />
          <Item
            label="Save"
            hint="⌘S"
            onClick={() => {
              onClose();
              void saveScene();
            }}
          />
          <Item
            label="Save a copy…"
            hint="⇧⌘S"
            onClick={() => {
              onClose();
              void saveScene(true);
            }}
          />
          <Item
            label="Export…"
            hint="⌘E"
            onClick={() => {
              onClose();
              openModal("export");
            }}
          />
          <Sep />
          {/* project-manager actions — disabled until it lands (post-v1) so a
              dead click never reads as breakage */}
          <Item label="Rename" disabled />
          <Item label="Duplicate" disabled />
          <Item label="Delete" disabled />
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
  const doc = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const selectedIds = useSyncExternalStore(subscribeSelection, getSelectedLayerIds, () => EMPTY_IDS);
  const hasSelection = selectedIds.length > 0;
  const hasLayers = (doc?.layers.length ?? 0) > 0;
  // The mockup's fake history list is GONE (clarity review: a history that
  // never reflects real actions poisons trust in the whole menu). Labelled
  // history needs command labels the snapshot store doesn't carry — later.
  return (
    <div className="min-w-[240px] space-y-2">
      <Box>
        <div className="flex">
          <UrButton icon={<Undo2 className="size-[15px]" />} label="Undo" hint="⌘Z" disabled={!undoable} onClick={() => undo()} />
          <UrButton icon={<Redo2 className="size-[15px]" />} label="Redo" hint="⇧⌘Z" disabled={!redoable} onClick={() => redo()} className="border-l border-border" />
        </div>
      </Box>
      <Box>
        <div className="segmented grid-cols-3">
          {/* Cut/Copy/Paste need a layer clipboard that doesn't exist yet —
              disabled, not silently inert */}
          <Ab icon={<Scissors className="size-[15px]" />} label="Cut" disabled />
          <Ab icon={<Copy className="size-[15px]" />} label="Copy" disabled />
          <Ab icon={<ClipboardPaste className="size-[15px]" />} label="Paste" disabled />
          <Ab
            icon={<CopyPlus className="size-[15px]" />}
            label="Duplicate"
            disabled={!hasSelection}
            onClick={() => {
              duplicateLayers(selectedIds);
              onClose();
            }}
          />
          <Ab
            icon={<Trash2 className="size-[15px]" />}
            label="Delete"
            disabled={!hasSelection}
            onClick={() => {
              deleteLayers(selectedIds);
              onClose();
            }}
          />
          <Ab
            icon={<BoxSelect className="size-[15px]" />}
            label="Select all"
            disabled={!hasLayers}
            onClick={() => {
              setSelection(doc!.layers.map((l) => l.id));
              onClose();
            }}
          />
        </div>
      </Box>
    </div>
  );
}

const EMPTY_IDS: readonly string[] = [];

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

function Ab({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex h-[50px] cursor-default flex-col items-center justify-center gap-1.5 bg-background text-[10px] hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
    >
      {icon}
      {label}
    </button>
  );
}

/* ── Workspace: docking + guides (visual stubs) ──────────────────────────────── */

const SEG_ICON_CLS = "size-3.5";
/** Shared seg-key → icon map. Keys are consistent across rows (L = dock-left
 *  everywhere, etc.); a key with no icon (e.g. "67%") falls back to its text. */
const SEG_ICON: Record<string, React.ReactNode> = {
  "−": <Minus className={SEG_ICON_CLS} />,
  "+": <Plus className={SEG_ICON_CLS} />,
  Fit: <Maximize2 className={SEG_ICON_CLS} />,
  Rulers: <Ruler className={SEG_ICON_CLS} />,
  Guides: <Frame className={SEG_ICON_CLS} />,
  Grid: <Grid3x3 className={SEG_ICON_CLS} />,
  Snap: <Magnet className={SEG_ICON_CLS} />,
};
const renderSeg = (s: string): React.ReactNode => SEG_ICON[s] ?? s;

function WorkspaceMenu() {
  const guides = useSyncExternalStore(subscribeGuides, getGuides, getGuides);
  const zoom = useSyncExternalStore(subscribeViewport, getZoom, () => 1);
  const pct = `${Math.round(zoom * 100)}%`;
  // Docking left this menu (Ruby, 2026-07-08): the omnibar and every module
  // header now carry a drag grip — drag onto the left/right/rail drop zones
  // (dock-zones.tsx). The old letter-segmented rows weren't discoverable.
  // ponytail: the rail-edge pref lost its UI (rail follows the omnibar now);
  // re-surface a control if anyone misses it.
  return (
    <Box className="min-w-[254px] py-1">
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

function HelpMenu({ onClose }: { onClose: () => void }) {
  const show = (id: "shortcuts" | "about-substrata" | "about-delphitools") => () => {
    openModal(id);
    onClose();
  };
  return (
    <Box className="min-w-[218px] py-1">
      <Item label="Keyboard shortcuts" onClick={show("shortcuts")} />
      <Item label="About Substrata" onClick={show("about-substrata")} />
      <Item label="About delphitools" onClick={show("about-delphitools")} />
      <a href="https://github.com/1612elphi/delphitools" target="_blank" rel="noopener noreferrer" className="block">
        <Item label="Source · GitHub" />
      </a>
    </Box>
  );
}
