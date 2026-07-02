"use client";

import { useSyncExternalStore } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { getGuides, subscribeGuides, toggleGuide } from "@/lib/substrata/guides-pref";
import {
  getToolSettings,
  setTransformAsGroup,
  subscribeToolSettings,
  updateToolSettings,
} from "@/lib/substrata/tool-settings";
import { cn } from "@/lib/utils";
import type { ToolId } from "@/lib/substrata/tool";

/**
 * Per-tool settings blooms for the omnibar's contextual zone (Ruby's rule: a
 * built tool ships its settings). MOVE is real — snap/grid (guides-pref, the
 * same switches as Workspace ▸ Guides) + the arrow-key nudge step
 * (tool-settings). The other tools keep the ∑CG placeholder until they land
 * (M2/M3). The Bloom supplies the box chrome; bodies render header + rows.
 */
export function ToolSettingsBody({ tool, title }: { tool: ToolId; title: string }) {
  if (tool === "move") return <MoveSettings title={title} />;
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

/** Stub tools until their settings exist (M2 TEXT/PIECES/SELECT · M3 ADJUST). */
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
