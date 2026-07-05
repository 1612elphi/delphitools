"use client";

import { useSyncExternalStore } from "react";
import { ChevronDown, ChevronUp, Circle, Pentagon, Slash, Square, Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ColourSwatchCell, DeferredHexInput } from "@/components/colour-field";
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

function StepBtn({
  icon: Icon,
  aria,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  aria: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={aria}
      className="grid h-6 w-[22px] place-items-center border-l border-border text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
    >
      <Icon className="size-3" />
    </button>
  );
}

/** Compact value + up/down stepper (the Nudge cell's pattern, generalised). */
function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  return (
    <span className="flex items-stretch border border-border">
      <span className="grid h-6 min-w-[42px] place-items-center px-1 text-[11px] tabular-nums">
        {value}
        {unit ? ` ${unit}` : ""}
      </span>
      <StepBtn
        icon={ChevronUp}
        onClick={() => set(value + step)}
        disabled={value >= max}
        // ∑CG: aria-label for a stepper increment. sample: "Increase"
        aria="∑CG"
      />
      <StepBtn
        icon={ChevronDown}
        onClick={() => set(value - step)}
        disabled={value <= min}
        // ∑CG: aria-label for a stepper decrement. sample: "Decrease"
        aria="∑CG"
      />
    </span>
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
          <Stepper value={p.cornerRadius} onChange={(cornerRadius) => patch({ cornerRadius })} min={0} max={250} unit="px" />
        </Row>
      )}
      {p.shape === "polygon" && (
        <Row label="Sides">
          <Stepper value={p.sides} onChange={(sides) => patch({ sides })} min={3} max={12} />
        </Row>
      )}
      {p.shape === "star" && (
        <>
          <Row label="Points">
            <Stepper value={p.starPoints} onChange={(starPoints) => patch({ starPoints })} min={3} max={12} />
          </Row>
          <Row label="Inner">
            <Stepper
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

/** Stub tools until their settings exist (M2 TEXT/SELECT · brush/pencil next). */
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
