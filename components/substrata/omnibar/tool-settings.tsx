"use client";

import { useRef, useSyncExternalStore } from "react";
import { ChevronDown, ChevronUp, Circle, Contrast, Copy, Moon, Pentagon, Slash, Sparkle, Square, Star, Sun, Upload } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { uploadLocalFont } from "@/lib/substrata/fonts";
import { FontSelect, TextAlignRow, TextStyleRow } from "@/components/substrata/text-style-row";
import { getActiveLayerId, subscribeSelection } from "@/lib/substrata/selection";
import { getSnapshot, subscribe } from "@/lib/substrata/doc-store";
import { addFx, setFxParams } from "@/lib/substrata/fx-ops";
import { findLayer } from "@/lib/substrata/layer-tree";
import { setTextProps } from "@/lib/substrata/layer-ops";
import { styleFields, textAccent, type TextStylePreset } from "@/lib/substrata/text-style";
import { Switch } from "@/components/ui/switch";
import { ColourSwatchCell, DeferredHexInput } from "@/components/colour-field";
import {
  CornerPresetIcon,
  PresetRow,
  StepBtn,
  Stepper,
  type PresetOption,
} from "@/components/substrata/preset-row";
import { getGuides, subscribeGuides, toggleGuide } from "@/lib/substrata/guides-pref";
import { PRESET_SHAPES } from "@/lib/substrata/preset-shapes";
import {
  getToolSettings,
  setTransformAsGroup,
  subscribeToolSettings,
  updateToolSettings,
  type PieceShape,
} from "@/lib/substrata/tool-settings";
import { cn } from "@/lib/utils";
import { hint } from "@/lib/substrata/hint";
import { segCellClass } from "@/components/substrata/preset-row";
import type { TextAlign } from "@/lib/substrata/doc-model";
import { getActiveSubs, getActiveTool, setActiveSub, subscribeTool, type ToolId } from "@/lib/substrata/tool";

/**
 * Per-tool settings blooms for the omnibar's contextual zone (Ruby's rule: a
 * built tool ships its settings). MOVE is real — snap/grid (guides-pref, the
 * same switches as Workspace ▸ Guides) + the arrow-key nudge step
 * (tool-settings). PIECES·Primitives is real — shape / fill / stroke / shape
 * params (M2-7); the Pieces head (preset gallery to come) and Brush/Pencil
 * (freehand, next chunk) keep the \u2211CG placeholder, as do the other stub tools.
 * The Bloom supplies the box chrome; bodies render header + rows.
 */
export function ToolSettingsBody({ tool, sub }: { tool: ToolId; sub?: string }) {
  if (tool === "move") return <MoveSettings />;
  if (tool === "pieces" && sub === "primitives") return <PiecesSettings />;
  if (tool === "pieces" && (sub === "brush" || sub === "pencil")) return <FreehandSettings sub={sub} />;
  if (tool === "text" && sub === "text") return <TextToolSettings />;
  if (tool === "select" && (sub === "lasso" || sub === "wand")) return <SelectToolSettings sub={sub} />;
  if (tool === "pieces" && sub === "pieces") return <PiecesGallerySettings />;
  if (tool === "adjust") return <AdjustSettings />;
  // marquee has no real settings yet (feather/boolean combine are post-v1) —
  // it keeps the placeholder like other settings-less modes
  return <PlaceholderSettings />;
}

/** ADJUST quick presets (Ruby 2026-07-12; titles + icons Claude-picked per
 *  her grant): one-tap versions of the FX everybody reaches for. Each adds
 *  its effect/filter to the ACTIVE raster layer (registry defaults, tuned
 *  params where the default is wrong for a scrim) — or retargets the
 *  existing block's params if the type is already on the stack (one undo
 *  step either way; fine-tuning lives in the FX panel). */
const ADJUST_PRESETS: {
  title: string;
  icon: LucideIcon;
  stack: "effects" | "filters";
  type: string;
  params?: Record<string, number | string>;
}[] = [
  { title: "Drop shadow", icon: Copy, stack: "effects", type: "drop-shadow" },
  { title: "Black overlay", icon: Moon, stack: "effects", type: "colour-overlay", params: { colour: "#000000", opacity: 40 } },
  { title: "White overlay", icon: Sun, stack: "effects", type: "colour-overlay", params: { colour: "#ffffff", opacity: 40 } },
  { title: "Outline", icon: Square, stack: "effects", type: "stroke" },
  { title: "Glow", icon: Sparkle, stack: "effects", type: "outer-glow" },
  { title: "Greyscale", icon: Contrast, stack: "filters", type: "grayscale" },
];

function AdjustSettings() {
  const doc = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const layerId = useSyncExternalStore(subscribeSelection, getActiveLayerId, () => null);
  const layer = doc && layerId ? findLayer(doc.layers, layerId) : null;
  const ok = layer?.kind === "raster";

  const apply = (preset: (typeof ADJUST_PRESETS)[number]) => {
    if (!ok || !layerId || !layer) return;
    const stack = preset.stack === "effects" ? layer.effects : layer.filters;
    const existing = stack.find((fx) => fx.type === preset.type);
    if (existing && preset.params) setFxParams(layerId, preset.stack, existing.id, preset.params);
    else if (!existing) addFx(layerId, preset.stack, preset.type, preset.params);
  };

  return (
    <div className="w-[224px]">
      {!ok && (
        // the FX panel's shipped gate line, reused
        <div className="border-b border-border px-[11px] py-2 text-[11px] text-muted-foreground">
          Effects apply to image layers for now.
        </div>
      )}
      <div className="segmented grid-cols-2">
        {ADJUST_PRESETS.map((p) => (
          <button
            key={p.title}
            type="button"
            disabled={!ok}
            onClick={() => apply(p)}
            className={cn(
              "flex h-11 items-center justify-start gap-2 bg-background px-2.5 text-[11px]",
              ok ? "hover:bg-accent" : "text-muted-foreground/50",
            )}
          >
            <p.icon className="size-[14px] shrink-0 text-muted-foreground" aria-hidden />
            {p.title}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The active subtool's display label (module `sub` slot). Ids are globally
 *  unique across tools; labels are Ruby's canonical subtool names. */
const SUB_LABELS: Record<string, string> = {
  move: "Move",
  crop: "Crop",
  select: "Select",
  lasso: "Lasso",
  wand: "Wand",
  adjust: "Adjust",
  text: "Text",
  pieces: "Pieces",
  primitives: "Primitives",
  brush: "Brush",
  pencil: "Pencil",
};

/** TOOL module body — the active tool's settings as a regular module (bloom /
 *  pin / rail / dock / drag-to-dock), replacing the omnibar's ContextZone. */
export function ToolModuleBody() {
  const activeTool = useSyncExternalStore(subscribeTool, getActiveTool, () => "move" as ToolId);
  const activeSubs = useSyncExternalStore(subscribeTool, getActiveSubs, getActiveSubs);
  return <ToolSettingsBody tool={activeTool} sub={activeSubs[activeTool]} />;
}

/** Module-header sub slot: names the subtool the body is configuring. */
export function ToolModuleSub() {
  const activeTool = useSyncExternalStore(subscribeTool, getActiveTool, () => "move" as ToolId);
  const activeSubs = useSyncExternalStore(subscribeTool, getActiveSubs, getActiveSubs);
  return <>{SUB_LABELS[activeSubs[activeTool]] ?? null}</>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex h-8 items-center justify-between gap-3 border-b border-border px-[11px] text-[11px] last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function MoveSettings() {
  const guides = useSyncExternalStore(subscribeGuides, getGuides, getGuides);
  const ts = useSyncExternalStore(subscribeToolSettings, getToolSettings, getToolSettings);
  const nudge = ts.move.nudge;

  const setNudge = (n: number) => updateToolSettings("move", { nudge: Math.min(100, Math.max(1, n)) });

  return (
    <div className="w-[200px]">
      {/* Group/Separate: how a multi-selection rotates/scales — shared with
          SELECT (one flag, Ruby's words as the cell labels). */}
      <Row label="Transform">
        <span className="segmented grid-cols-2">
          {(
            [
              ["Group", true],
              ["Separate", false],
            ] as const
          ).map(([label, asGroup]) => (
            <button
              key={label}
              type="button"
              onClick={() => setTransformAsGroup(asGroup)}
              className={cn(
                "h-6 px-2 text-[10.5px]",
                segCellClass(ts.transformAsGroup === asGroup),
              )}
            >
              {label}
            </button>
          ))}
        </span>
      </Row>
      {/* Snap/Grid mirror Workspace ▸ Guides (same store, same words) */}
      <Row label="Snap">
        <Switch checked={guides.snap} onCheckedChange={() => toggleGuide("snap")} aria-label="Snap to guidelines" />
      </Row>
      <Row label="Grid">
        <Switch checked={guides.grid} onCheckedChange={() => toggleGuide("grid")} aria-label="Show grid" />
      </Row>
      <Row label="Nudge">
        <span className="flex items-stretch border border-border">
          <span className="grid h-6 min-w-[42px] place-items-center px-1 text-[11px] tabular-nums">
            {nudge} px
          </span>
          <StepBtn
            icon={ChevronUp}
            onClick={() => setNudge(nudge + 1)}
            disabled={nudge >= 100}
            aria="Increase"
          />
          <StepBtn
            icon={ChevronDown}
            onClick={() => setNudge(nudge - 1)}
            disabled={nudge <= 1}
            aria="Decrease"
          />
        </span>
      </Row>
    </div>
  );
}

/** The Pieces HEAD sub = the preset-shapes gallery (ratified 2026-07-07):
 *  a grid of vendored Phosphor-fill symbols; picking one arms drag-to-draw
 *  with that symbol. Fill mirrors the primitives bloom's next-shape fill.
 *  Symbol names = standard vocabulary chrome (SHAPE_NAMES precedent). */
function PiecesGalleryGrid({ bordered }: { bordered?: boolean }) {
  const ts = useSyncExternalStore(subscribeToolSettings, getToolSettings, getToolSettings);
  const s = ts.pieces;
  return (
    <div className={cn("grid grid-cols-5 gap-px bg-border", bordered && "border-b border-border")}>
      {PRESET_SHAPES.map((shape) => (
        <button
          key={shape.id}
          type="button"
          title={shape.name}
          aria-label={shape.name}
          aria-pressed={s.symbolId === shape.id}
          onClick={() => {
            updateToolSettings("pieces", { shape: "symbol", symbolId: shape.id });
            setActiveSub("pieces", "pieces"); // picking a piece arms the tool
          }}
          className={cn(
            "grid aspect-square place-items-center",
            s.symbolId === shape.id
              ? "bg-primary text-primary-foreground"
              : "bg-card text-foreground hover:bg-accent",
          )}
        >
          <svg viewBox="0 0 256 256" className="h-6 w-6" aria-hidden>
            <path d={shape.d} fill="currentColor" />
          </svg>
        </button>
      ))}
    </div>
  );
}

function PiecesGallerySettings() {
  const ts = useSyncExternalStore(subscribeToolSettings, getToolSettings, getToolSettings);
  const s = ts.pieces;

  return (
    <div className="w-[224px]">
      <PiecesGalleryGrid bordered />
      <Row label="Fill">
        <ColourCell
          colour={s.fill}
          onChange={(hex) => updateToolSettings("pieces", { fill: hex })}
          aria="Fill colour"
        />
      </Row>
    </div>
  );
}

/** Floating shape menu on the PIECES tool button — the piece selector IS
 *  subtool selection (Ruby), so it hangs off the tool itself. */
export function PiecesFlyout() {
  return (
    <div className="w-[224px]">
      <PiecesGalleryGrid />
    </div>
  );
}

/** Floating shape menu on the PRIMITIVES tool button — pick a shape, the
 *  subtool arms itself. Full params stay in the tool-settings module. */
export function PrimitivesFlyout() {
  const ts = useSyncExternalStore(subscribeToolSettings, getToolSettings, getToolSettings);
  const s = ts.pieces;
  return (
    <div className="flex">
      {SHAPE_CELLS.map(({ shape, label, icon: Icon }) => (
        <button
          key={shape}
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={s.shape === shape}
          onClick={() => {
            updateToolSettings("pieces", { shape });
            setActiveSub("pieces", "primitives");
          }}
          className={cn(
            "grid size-10 place-items-center",
            s.shape === shape
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <Icon className="size-[15px]" />
        </button>
      ))}
    </div>
  );
}

/** SELECT subtool settings (M2-10): lasso = magnetic switch + edge
 *  sensitivity; wand = contiguous/global mode + tolerance. Mode words are
 *  standard graphics vocabulary = functional chrome. */
function SelectToolSettings({ sub }: { sub: "lasso" | "wand" }) {
  const ts = useSyncExternalStore(subscribeToolSettings, getToolSettings, getToolSettings);
  const s = ts.select;

  return (
    <div className="w-[200px]">
      {sub === "lasso" ? (
        <>
          <Row label="Magnetic">
            <Switch
              checked={s.magnetic}
              onCheckedChange={(v) => updateToolSettings("select", { magnetic: v })}
              aria-label="Snap to edges"
            />
          </Row>
          <Row label="Sensitivity">
            <span className="flex items-stretch border border-border">
              <span className="grid h-6 min-w-[42px] place-items-center px-1 text-[11px] tabular-nums">
                {s.sensitivity}
              </span>
              <StepBtn
                icon={ChevronUp}
                onClick={() => updateToolSettings("select", { sensitivity: Math.min(100, s.sensitivity + 10) })}
                disabled={!s.magnetic || s.sensitivity >= 100}
                aria="Increase"
              />
              <StepBtn
                icon={ChevronDown}
                onClick={() => updateToolSettings("select", { sensitivity: Math.max(0, s.sensitivity - 10) })}
                disabled={!s.magnetic || s.sensitivity <= 0}
                aria="Decrease"
              />
            </span>
          </Row>
        </>
      ) : (
        <>
          <Row label="Mode">
            <span className="segmented grid-cols-2">
              {(
                [
                  ["Contiguous", "flood"],
                  ["Global", "global"],
                ] as const
              ).map(([label, mode]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updateToolSettings("select", { wandMode: mode })}
                  className={cn(
                    "h-6 px-2 text-[10.5px]",
                    segCellClass(s.wandMode === mode),
                  )}
                >
                  {label}
                </button>
              ))}
            </span>
          </Row>
          <Row label="Tolerance">
            <span className="flex items-stretch border border-border">
              <span className="grid h-6 min-w-[42px] place-items-center px-1 text-[11px] tabular-nums">
                {s.tolerance}
              </span>
              <StepBtn
                icon={ChevronUp}
                onClick={() => updateToolSettings("select", { tolerance: Math.min(255, s.tolerance + 8) })}
                disabled={s.tolerance >= 255}
                aria="Increase"
              />
              <StepBtn
                icon={ChevronDown}
                onClick={() => updateToolSettings("select", { tolerance: Math.max(0, s.tolerance - 8) })}
                disabled={s.tolerance <= 0}
                aria="Decrease"
              />
            </span>
          </Row>
        </>
      )}
    </div>
  );
}

/** Swatch + hex pair used by the Fill and Stroke rows. */
function ColourCell({ colour, onChange, aria }: { colour: string; onChange: (hex: string) => void; aria: string }) {
  return (
    <span className="flex items-stretch border border-border">
      <ColourSwatchCell colour={colour} onChange={onChange} className="h-6 w-7 border-r border-border" aria-label={aria} />
      <DeferredHexInput
        value={colour}
        onChange={onChange}
        aria-label={aria}
        className="h-6 w-[72px] rounded-none border-0 px-1.5 font-mono text-[11px] shadow-none focus-visible:ring-0"
      />
    </span>
  );
}

/** Preset menus (Ruby, 2026-07-06: presets + a custom (…) escape hatch —
 *  "a simple editor for simple people"). Values are data; the corner glyphs
 *  are visual.
 *  Corner-preset arias: one or two words each, name the roundedness level,
 *  sharpest → roundest; British spelling. */
const CORNER_PX_PRESETS: PresetOption[] = [
  { value: 0, icon: <CornerPresetIcon r={0} />, aria: "Sharp" },
  { value: 16, icon: <CornerPresetIcon r={2} />, aria: "Subtle" },
  { value: 48, icon: <CornerPresetIcon r={4.5} />, aria: "Round" },
  { value: 120, icon: <CornerPresetIcon r={7} />, aria: "Pill" },
];
const SIDES_PRESETS: PresetOption[] = [3, 4, 5, 6, 8].map((v) => ({ value: v, label: String(v) }));
const POINTS_PRESETS: PresetOption[] = [4, 5, 6, 8].map((v) => ({ value: v, label: String(v) }));
const INNER_PRESETS: PresetOption[] = [30, 50, 70].map((v) => ({ value: v, label: `${v}%` }));

/** The five primitives — icon cells; labels are the standard shape vocabulary
 *  (functional chrome, the PIECE_LABEL/SHAPE_NAMES words). */
const SHAPE_CELLS: Array<{ shape: PieceShape; label: string; icon: LucideIcon }> = [
  { shape: "rectangle", label: "Rectangle", icon: Square },
  { shape: "ellipse", label: "Ellipse", icon: Circle },
  { shape: "line", label: "Line", icon: Slash },
  { shape: "polygon", label: "Polygon", icon: Pentagon },
  { shape: "star", label: "Star", icon: Star },
];

/** PIECES ▸ Primitives (M2-7): what the next drag draws. Writes tool-settings;
 *  the drag-to-draw gesture (fabric-canvas) reads it at draw time. */
function PiecesSettings() {
  const ts = useSyncExternalStore(subscribeToolSettings, getToolSettings, getToolSettings);
  const p = ts.pieces;
  const patch = (v: Partial<typeof p>) => updateToolSettings("pieces", v);

  return (
    <div className="w-[200px]">
      <div className="segmented grid-cols-5 m-[11px] mb-2">
        {SHAPE_CELLS.map(({ shape, label, icon: Icon }) => (
          <button
            key={shape}
            type="button"
            title={label}
            aria-label={label}
            onClick={() => patch({ shape })}
            className={cn(
              "grid h-7 place-items-center",
              segCellClass(p.shape === shape),
            )}
          >
            <Icon className="size-3.5" />
          </button>
        ))}
      </div>
      <Row label="Fill">
        <ColourCell colour={p.fill} onChange={(fill) => patch({ fill })} aria="Fill colour" />
      </Row>
      <Row label="Stroke">
        <Switch
          checked={p.stroke !== null}
          onCheckedChange={(on) => patch({ stroke: on ? { colour: "#1d1d1d", width: 2 } : null })}
          aria-label="Stroke"
        />
      </Row>
      {p.stroke && (
        <>
          <Row label="Colour">
            <ColourCell
              colour={p.stroke.colour}
              onChange={(colour) => patch({ stroke: { ...p.stroke!, colour } })}
              aria="Stroke colour"
            />
          </Row>
          <Row label="Width">
            <Stepper
              value={p.stroke.width}
              onChange={(width) => patch({ stroke: { ...p.stroke!, width } })}
              min={1}
              max={100}
              unit="px"
            />
          </Row>
        </>
      )}
      {p.shape === "rectangle" && (
        <Row label="Corner">
          <PresetRow
            options={CORNER_PX_PRESETS}
            value={p.cornerRadius}
            onChange={(cornerRadius) => patch({ cornerRadius })}
            min={0}
            max={250}
            unit="px"
          />
        </Row>
      )}
      {p.shape === "polygon" && (
        <Row label="Sides">
          <PresetRow
            options={SIDES_PRESETS}
            value={p.sides}
            onChange={(sides) => patch({ sides })}
            min={3}
            max={12}
          />
        </Row>
      )}
      {p.shape === "star" && (
        <>
          <Row label="Points">
            <PresetRow
              options={POINTS_PRESETS}
              value={p.starPoints}
              onChange={(starPoints) => patch({ starPoints })}
              min={3}
              max={12}
            />
          </Row>
          <Row label="Inner">
            <PresetRow
              options={INNER_PRESETS}
              value={Math.round(p.starInnerRatio * 100)}
              onChange={(v) => patch({ starInnerRatio: v / 100 })}
              min={10}
              max={90}
              step={5}
              unit="%"
            />
          </Row>
        </>
      )}
    </div>
  );
}

/** Brush/Pencil size menus — a fat and a fine register (data, not copy). */
const BRUSH_SIZES: PresetOption[] = [8, 16, 24, 48].map((v) => ({ value: v, label: String(v) }));
const PENCIL_SIZES: PresetOption[] = [2, 4, 6, 12].map((v) => ({ value: v, label: String(v) }));

/** PIECES ▸ Brush/Pencil (M2-2): the next stroke's colour + size. The stroke
 *  body is a filled outline, so it shares the pieces `fill` setting. */
function FreehandSettings({ sub }: { sub: "brush" | "pencil" }) {
  const ts = useSyncExternalStore(subscribeToolSettings, getToolSettings, getToolSettings);
  const p = ts.pieces;
  const sizeKey = sub === "brush" ? ("brushSize" as const) : ("pencilSize" as const);

  return (
    <div className="w-[200px]">
      <Row label="Colour">
        <ColourCell colour={p.fill} onChange={(fill) => updateToolSettings("pieces", { fill })} aria="Stroke colour" />
      </Row>
      <Row label="Size">
        <PresetRow
          options={sub === "brush" ? BRUSH_SIZES : PENCIL_SIZES}
          value={p[sizeKey]}
          onChange={(v) => updateToolSettings("pieces", { [sizeKey]: v })}
          min={1}
          max={200}
          unit="px"
        />
      </Row>
    </div>
  );
}

const TEXT_SIZES: PresetOption[] = [16, 24, 48, 96].map((v) => ({ value: v, label: String(v) }));

/** TEXT (M2): font choice (system stacks + session uploads — Ruby's call, no
 *  bundled files; dropdown per her 2026-07-06 ask), size presets, style
 *  presets. Colour rides the shared current-colour sink. Settings describe
 *  the NEXT text AND live-apply to the active text layer — a font click must
 *  restyle the text you're editing (Ruby, same day). */
function TextToolSettings() {
  const ts = useSyncExternalStore(subscribeToolSettings, getToolSettings, getToolSettings);
  const fileRef = useRef<HTMLInputElement>(null);
  const t = ts.text;

  /** patch the selected text layer too, so the bloom edits what you see */
  const applyLive = (
    patch: { fontFamily?: string; fontSize?: number; align?: TextAlign } | { style: TextStylePreset },
  ) => {
    const id = getActiveLayerId();
    const doc = getSnapshot();
    const layer = doc && id ? findLayer(doc.layers, id) : null;
    if (!layer || layer.kind !== "text") return;
    if ("style" in patch) setTextProps(id!, styleFields(patch.style, textAccent(layer), layer.fontSize));
    else setTextProps(id!, patch);
  };
  const setFont = (fontFamily: string) => {
    updateToolSettings("text", { fontFamily });
    applyLive({ fontFamily });
  };

  return (
    <div className="w-[200px]">
      <Row label="Font">
        <span className="flex items-stretch gap-1">
          <FontSelect value={t.fontFamily} onChange={setFont} className="h-6 w-[104px]" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            {...hint("Upload font")}
            className="grid h-6 w-7 place-items-center border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Upload className="size-3" aria-hidden />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".woff2,.woff,.ttf,.otf"
            className="hidden"
            aria-label="Upload a custom font file"
            onChange={async (e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (!file) return;
              setFont(await uploadLocalFont(file));
            }}
          />
        </span>
      </Row>
      <Row label="Size">
        <PresetRow
          options={TEXT_SIZES}
          value={t.fontSize}
          onChange={(fontSize) => {
            updateToolSettings("text", { fontSize });
            applyLive({ fontSize });
          }}
          min={6}
          max={400}
          unit="px"
        />
      </Row>
      <Row label="Align">
        <TextAlignRow
          value={t.align}
          onPick={(align) => {
            updateToolSettings("text", { align });
            applyLive({ align });
          }}
        />
      </Row>
      <Row label="Style">
        <TextStyleRow
          value={t.style}
          onPick={(style) => {
            updateToolSettings("text", { style });
            applyLive({ style });
          }}
        />
      </Row>
    </div>
  );
}

/** Stub tools until their settings exist (M2 SELECT). */
function PlaceholderSettings() {
  return (
    <div className="w-[200px]">
      <div className="p-3 text-center text-[11px] text-muted-foreground">
        Settings arrive with this tool
      </div>
    </div>
  );
}
