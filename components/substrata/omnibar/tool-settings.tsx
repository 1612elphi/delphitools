"use client";

import { useRef, useSyncExternalStore } from "react";
import { ChevronDown, ChevronUp, Circle, Pentagon, Slash, Square, Star, Upload } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { uploadLocalFont } from "@/lib/substrata/fonts";
import { FontSelect, TextStyleRow } from "@/components/substrata/text-style-row";
import { getActiveLayerId } from "@/lib/substrata/selection";
import { getSnapshot } from "@/lib/substrata/doc-store";
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
import {
  getToolSettings,
  setTransformAsGroup,
  subscribeToolSettings,
  updateToolSettings,
  type PieceShape,
} from "@/lib/substrata/tool-settings";
import { cn } from "@/lib/utils";
import type { ToolId } from "@/lib/substrata/tool";

/**
 * Per-tool settings blooms for the omnibar's contextual zone (Ruby's rule: a
 * built tool ships its settings). MOVE is real — snap/grid (guides-pref, the
 * same switches as Workspace ▸ Guides) + the arrow-key nudge step
 * (tool-settings). PIECES·Primitives is real — shape / fill / stroke / shape
 * params (M2-7); the Pieces head (preset gallery to come) and Brush/Pencil
 * (freehand, next chunk) keep the ∑CG placeholder, as do the other stub tools.
 * The Bloom supplies the box chrome; bodies render header + rows.
 */
export function ToolSettingsBody({ tool, sub, title }: { tool: ToolId; sub?: string; title: string }) {
  if (tool === "move") return <MoveSettings title={title} />;
  if (tool === "pieces" && sub === "primitives") return <PiecesSettings title={title} />;
  if (tool === "pieces" && (sub === "brush" || sub === "pencil"))
    return <FreehandSettings sub={sub} title={title} />;
  if (tool === "text" && sub === "text") return <TextToolSettings title={title} />;
  if (tool === "select" && (sub === "lasso" || sub === "wand"))
    return <SelectToolSettings sub={sub} title={title} />;
  // marquee has no real settings yet (feather/boolean combine are post-v1) —
  // it keeps the placeholder like other settings-less modes
  return <PlaceholderSettings title={title} />;
}

function Head({ title }: { title: string }) {
  return (
    <div className="flex h-[30px] items-center border-b border-border bg-card px-[11px]">
      <span className="text-[10.5px] font-bold uppercase tracking-wide">{title}</span>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex h-8 items-center justify-between gap-3 border-b border-border px-[11px] text-[11px] last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function MoveSettings({ title }: { title: string }) {
  const guides = useSyncExternalStore(subscribeGuides, getGuides, getGuides);
  const ts = useSyncExternalStore(subscribeToolSettings, getToolSettings, getToolSettings);
  const nudge = ts.move.nudge;

  const setNudge = (n: number) => updateToolSettings("move", { nudge: Math.min(100, Math.max(1, n)) });

  return (
    <div className="w-[200px]">
      <Head title={title} />
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
                ts.transformAsGroup === asGroup
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </span>
      </Row>
      {/* Snap/Grid mirror Workspace ▸ Guides (same store, same words) */}
      <Row label="Snap">
        {/* ∑CG: aria-label for the snap toggle. sample: "Snap to guides" */}
        <Switch checked={guides.snap} onCheckedChange={() => toggleGuide("snap")} aria-label="∑CG" />
      </Row>
      <Row label="Grid">
        {/* ∑CG: aria-label for the grid toggle. sample: "Show grid" */}
        <Switch checked={guides.grid} onCheckedChange={() => toggleGuide("grid")} aria-label="∑CG" />
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
            // ∑CG: aria-label for nudge-step increment. sample: "Increase"
            aria="∑CG"
          />
          <StepBtn
            icon={ChevronDown}
            onClick={() => setNudge(nudge - 1)}
            disabled={nudge <= 1}
            // ∑CG: aria-label for nudge-step decrement. sample: "Decrease"
            aria="∑CG"
          />
        </span>
      </Row>
    </div>
  );
}

/** SELECT subtool settings (M2-10): lasso = magnetic switch + edge
 *  sensitivity; wand = contiguous/global mode + tolerance. Mode words are
 *  standard graphics vocabulary = functional chrome. */
function SelectToolSettings({ sub, title }: { sub: "lasso" | "wand"; title: string }) {
  const ts = useSyncExternalStore(subscribeToolSettings, getToolSettings, getToolSettings);
  const s = ts.select;

  return (
    <div className="w-[200px]">
      <Head title={title} />
      {sub === "lasso" ? (
        <>
          <Row label="Magnetic">
            {/* ∑CG: aria-label for the magnetic-lasso toggle. sample: "Snap to edges" */}
            <Switch
              checked={s.magnetic}
              onCheckedChange={(v) => updateToolSettings("select", { magnetic: v })}
              aria-label="∑CG"
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
                // ∑CG: aria-label for sensitivity increment. sample: "Increase"
                aria="∑CG"
              />
              <StepBtn
                icon={ChevronDown}
                onClick={() => updateToolSettings("select", { sensitivity: Math.max(0, s.sensitivity - 10) })}
                disabled={!s.magnetic || s.sensitivity <= 0}
                // ∑CG: aria-label for sensitivity decrement. sample: "Decrease"
                aria="∑CG"
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
                    s.wandMode === mode
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
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
                // ∑CG: aria-label for tolerance increment. sample: "Increase"
                aria="∑CG"
              />
              <StepBtn
                icon={ChevronDown}
                onClick={() => updateToolSettings("select", { tolerance: Math.max(0, s.tolerance - 8) })}
                disabled={s.tolerance <= 0}
                // ∑CG: aria-label for tolerance decrement. sample: "Decrease"
                aria="∑CG"
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
 *  ∑CG: aria-labels for the four corner presets, sharpest → roundest.
 *    spec: one or two words each, name the roundedness level; British spelling.
 *    sample: "Sharp" · "Subtle" · "Round" · "Pill" */
const CORNER_PX_PRESETS: PresetOption[] = [
  { value: 0, icon: <CornerPresetIcon r={0} />, aria: "∑CG" },
  { value: 16, icon: <CornerPresetIcon r={2} />, aria: "∑CG" },
  { value: 48, icon: <CornerPresetIcon r={4.5} />, aria: "∑CG" },
  { value: 120, icon: <CornerPresetIcon r={7} />, aria: "∑CG" },
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
function PiecesSettings({ title }: { title: string }) {
  const ts = useSyncExternalStore(subscribeToolSettings, getToolSettings, getToolSettings);
  const p = ts.pieces;
  const patch = (v: Partial<typeof p>) => updateToolSettings("pieces", v);

  return (
    <div className="w-[200px]">
      <Head title={title} />
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
              p.shape === shape
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
          </button>
        ))}
      </div>
      <Row label="Fill">
        {/* ∑CG: aria-label for the next-shape fill swatch. sample: "Fill colour" */}
        <ColourCell colour={p.fill} onChange={(fill) => patch({ fill })} aria="∑CG" />
      </Row>
      <Row label="Stroke">
        <Switch
          checked={p.stroke !== null}
          onCheckedChange={(on) => patch({ stroke: on ? { colour: "#1d1d1d", width: 2 } : null })}
          // ∑CG: aria-label for the stroke on/off toggle. sample: "Stroke"
          aria-label="∑CG"
        />
      </Row>
      {p.stroke && (
        <>
          <Row label="Colour">
            {/* ∑CG: aria-label for the stroke colour swatch. sample: "Stroke colour" */}
            <ColourCell
              colour={p.stroke.colour}
              onChange={(colour) => patch({ stroke: { ...p.stroke!, colour } })}
              aria="∑CG"
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
function FreehandSettings({ sub, title }: { sub: "brush" | "pencil"; title: string }) {
  const ts = useSyncExternalStore(subscribeToolSettings, getToolSettings, getToolSettings);
  const p = ts.pieces;
  const sizeKey = sub === "brush" ? ("brushSize" as const) : ("pencilSize" as const);

  return (
    <div className="w-[200px]">
      <Head title={title} />
      <Row label="Colour">
        {/* ∑CG: aria-label for the stroke colour swatch. sample: "Stroke colour" */}
        <ColourCell colour={p.fill} onChange={(fill) => updateToolSettings("pieces", { fill })} aria="∑CG" />
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
function TextToolSettings({ title }: { title: string }) {
  const ts = useSyncExternalStore(subscribeToolSettings, getToolSettings, getToolSettings);
  const fileRef = useRef<HTMLInputElement>(null);
  const t = ts.text;

  /** patch the selected text layer too, so the bloom edits what you see */
  const applyLive = (patch: { fontFamily?: string; fontSize?: number } | { style: TextStylePreset }) => {
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
      <Head title={title} />
      <Row label="Font">
        <span className="flex items-stretch gap-1">
          <FontSelect value={t.fontFamily} onChange={setFont} className="h-6 w-[104px]" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            // ∑CG: aria-label for the font upload button. sample: "Upload font"
            aria-label="∑CG"
            title="∑CG"
            className="grid h-6 w-7 place-items-center border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Upload className="size-3" aria-hidden />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".woff2,.woff,.ttf,.otf"
            className="hidden"
            // ∑CG: aria-label for the font-file input. sample: "Upload a font file"
            aria-label="∑CG"
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
function PlaceholderSettings({ title }: { title: string }) {
  return (
    <div className="w-[200px]">
      <Head title={title} />
      <div className="p-3 text-center text-[11px] text-muted-foreground">
        {/* ∑CG: placeholder hint inside a stub tool's settings bloom
            spec: ≤ 48 chars; says this tool's settings arrive with the tool;
            British spelling.
            sample: "Settings arrive with this tool." */}
        ∑CG
      </div>
    </div>
  );
}
