"use client"

import { useState, useMemo, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { ArrowLeft, ArrowRight, Check, RotateCcw, Scissors } from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────

interface Inputs {
  sheetW: number
  sheetH: number
  prodW: number
  prodH: number
  bleed: number
  cols: number
  rows: number
}

interface Imposition {
  stripW: number
  stripH: number
  marginW: number
  marginH: number
  totalProducts: number
  totalCuts: number
  valid: boolean
}

interface MeasureContext {
  totalDimension: number
  measureValue: number
  wasteEnd: "far" | "near"
  axis: "width" | "height"
}

interface CutStep {
  type: "measured" | "computed"
  phase: 1 | 2 | 3
  phaseLabel: string
  instruction: string
  value: number
  measureContext?: MeasureContext
}

// ── Presets ────────────────────────────────────────────────────────

const sheetPresets = [
  { label: "SRA3", w: 320, h: 450 },
  { label: "SRA4", w: 225, h: 320 },
  { label: "A3", w: 297, h: 420 },
  { label: "A4", w: 210, h: 297 },
  { label: "A5", w: 148, h: 210 },
  { label: "Letter", w: 216, h: 279 },
  { label: "Legal", w: 216, h: 356 },
  { label: "Tabloid", w: 279, h: 432 },
]

// ── Pure functions ─────────────────────────────────────────────────

function computeImposition(inputs: Inputs): Imposition {
  const { sheetW, sheetH, prodW, prodH, bleed, cols, rows } = inputs
  const stripW = prodW + 2 * bleed
  const stripH = prodH + 2 * bleed
  const marginW = (sheetW - cols * stripW) / 2
  const marginH = (sheetH - rows * stripH) / 2
  return {
    stripW,
    stripH,
    marginW,
    marginH,
    totalProducts: cols * rows,
    totalCuts: cols + rows + 6,
    valid: marginW >= 0 && marginH >= 0,
  }
}

function generateCutSequence(inputs: Inputs, imp: Imposition): CutStep[] {
  const { sheetW, sheetH, prodW, prodH, bleed, cols, rows } = inputs
  const { stripW, stripH, marginW, marginH } = imp
  const steps: CutStep[] = []

  // Determine edge labels based on sheet orientation
  const wEdge = sheetW <= sheetH ? "short edge" : "long edge"
  const hEdge = sheetH >= sheetW ? "long edge" : "short edge"

  // Phase 1 — Width cuts
  steps.push({
    type: "measured",
    phase: 1,
    phaseLabel: "Width Cuts",
    instruction: `${wEdge[0].toUpperCase() + wEdge.slice(1)} against fence. Measure to far bleed mark — far margin slides off toward you`,
    value: sheetW - marginW,
    measureContext: {
      totalDimension: sheetW,
      measureValue: sheetW - marginW,
      wasteEnd: "far",
      axis: "width",
    },
  })
  steps.push({
    type: "measured",
    phase: 1,
    phaseLabel: "Width Cuts",
    instruction: `Push trimmed ${wEdge} to fence. Measure to near bleed mark — near margin slides off toward you`,
    value: cols * stripW,
    measureContext: {
      totalDimension: sheetW - marginW,
      measureValue: cols * stripW,
      wasteEnd: "near",
      axis: "width",
    },
  })
  // Descending fence: strips slide off toward operator
  for (let i = 0; i < cols - 1; i++) {
    steps.push({
      type: "computed",
      phase: 1,
      phaseLabel: "Width Cuts",
      instruction: `Separate strip ${i + 1} of ${cols} — set fence, cut, slide strip off`,
      value: (cols - 1 - i) * stripW,
    })
  }

  // Phase 2 — Height cuts
  steps.push({
    type: "measured",
    phase: 2,
    phaseLabel: "Height Cuts",
    instruction: `Stack all strips. ${hEdge[0].toUpperCase() + hEdge.slice(1)} against fence. Measure to far bleed mark — far margin slides off toward you`,
    value: sheetH - marginH,
    measureContext: {
      totalDimension: sheetH,
      measureValue: sheetH - marginH,
      wasteEnd: "far",
      axis: "height",
    },
  })
  steps.push({
    type: "measured",
    phase: 2,
    phaseLabel: "Height Cuts",
    instruction: `Push trimmed ${hEdge} to fence. Measure to near bleed mark — near margin slides off toward you`,
    value: rows * stripH,
    measureContext: {
      totalDimension: sheetH - marginH,
      measureValue: rows * stripH,
      wasteEnd: "near",
      axis: "height",
    },
  })
  // Descending fence: strips slide off toward operator
  for (let i = 0; i < rows - 1; i++) {
    steps.push({
      type: "computed",
      phase: 2,
      phaseLabel: "Height Cuts",
      instruction: `Separate strip ${i + 1} of ${rows} — set fence, cut, slide strip off`,
      value: (rows - 1 - i) * stripH,
    })
  }

  // Phase 3 — Trim bleed (fence keeps product, bleed waste falls toward operator)
  const pWEdge = prodW <= prodH ? "short edge" : "long edge"
  const pHEdge = prodH >= prodW ? "long edge" : "short edge"

  steps.push({
    type: "computed",
    phase: 3,
    phaseLabel: "Trim Bleed",
    instruction: `Stack all pieces, ${pWEdge} facing fence. Set fence — bleed waste slides off toward you`,
    value: prodW + bleed,
  })
  steps.push({
    type: "computed",
    phase: 3,
    phaseLabel: "Trim Bleed",
    instruction: `Flip stack. Trim ${pWEdge} to product width — bleed slides off`,
    value: prodW,
  })
  steps.push({
    type: "computed",
    phase: 3,
    phaseLabel: "Trim Bleed",
    instruction: `Rotate stack, ${pHEdge} facing fence. Set fence — bleed waste slides off toward you`,
    value: prodH + bleed,
  })
  steps.push({
    type: "computed",
    phase: 3,
    phaseLabel: "Trim Bleed",
    instruction: `Flip stack. Trim ${pHEdge} to product height — bleed slides off`,
    value: prodH,
  })

  return steps
}

// ── SVG Sheet Preview ──────────────────────────────────────────────

function SheetPreview({
  inputs,
  imposition,
}: {
  inputs: Inputs
  imposition: Imposition
}) {
  const { sheetW, sheetH, bleed, cols, rows } = inputs
  const { stripW, stripH, marginW, marginH, valid } = imposition
  if (!valid) return null

  const padding = 10
  const vbW = sheetW + padding * 2
  const vbH = sheetH + padding * 2

  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      className="w-full max-h-72 rounded-lg bg-white dark:bg-zinc-900/50"
    >
      {/* Sheet outline */}
      <rect
        x={padding}
        y={padding}
        width={sheetW}
        height={sheetH}
        fill="none"
        stroke="currentColor"
        strokeWidth={0.5}
        className="text-border"
      />

      {/* Margin area — subtle fill */}
      <rect
        x={padding}
        y={padding}
        width={sheetW}
        height={sheetH}
        className="fill-muted/30"
      />

      {/* Product grid */}
      {Array.from({ length: cols }, (_, c) =>
        Array.from({ length: rows }, (_, r) => {
          const x = padding + marginW + c * stripW
          const y = padding + marginH + r * stripH
          return (
            <g key={`${c}-${r}`}>
              {/* Bleed area */}
              <rect
                x={x}
                y={y}
                width={stripW}
                height={stripH}
                className="fill-muted stroke-border"
                strokeWidth={0.25}
              />
              {/* Product area */}
              <rect
                x={x + bleed}
                y={y + bleed}
                width={stripW - 2 * bleed}
                height={stripH - 2 * bleed}
                className="fill-primary/15 stroke-primary/60"
                strokeWidth={0.3}
              />
            </g>
          )
        })
      )}

      {/* Dimension labels */}
      <text
        x={padding + sheetW / 2}
        y={padding - 3}
        textAnchor="middle"
        className="fill-muted-foreground"
        fontSize={Math.max(6, Math.min(10, sheetW / 40))}
      >
        {sheetW} mm
      </text>
      <text
        x={padding - 3}
        y={padding + sheetH / 2}
        textAnchor="middle"
        className="fill-muted-foreground"
        fontSize={Math.max(6, Math.min(10, sheetH / 40))}
        transform={`rotate(-90, ${padding - 3}, ${padding + sheetH / 2})`}
      >
        {sheetH} mm
      </text>
    </svg>
  )
}

// ── Measure Diagram ────────────────────────────────────────────────

function MeasureDiagram({ ctx }: { ctx: MeasureContext }) {
  const { totalDimension, measureValue } = ctx

  const w = 280
  const h = 72
  const barY = 16
  const barH = 26
  const arrowY = barY + barH + 14

  const measureRatio = measureValue / totalDimension
  const measureW = Math.max(20, Math.round(w * measureRatio))
  const wasteW = w - measureW

  // Keep portion on left (fence side), waste on right (slides toward operator)
  const measureX = 0
  const wasteX = measureW
  const cutX = measureW

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full max-w-xs mx-auto"
      role="img"
      aria-label={`Measure ${measureValue} mm from fence edge to bleed mark — waste slides off`}
    >
      {/* Keep portion (fence side) */}
      <rect
        x={measureX}
        y={barY}
        width={measureW}
        height={barH}
        rx={2}
        className="fill-primary/15 stroke-primary/40"
        strokeWidth={0.5}
      />
      {measureW > 40 && (
        <text
          x={measureX + measureW / 2}
          y={barY + barH / 2 + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-primary/70"
          fontSize={8}
        >
          keep
        </text>
      )}

      {/* Waste portion (operator side) */}
      <rect
        x={wasteX}
        y={barY}
        width={wasteW}
        height={barH}
        rx={2}
        className="fill-destructive/10 stroke-destructive/30"
        strokeWidth={0.5}
      />
      {wasteW > 30 && (
        <text
          x={wasteX + wasteW / 2}
          y={barY + barH / 2 + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-destructive/50"
          fontSize={8}
        >
          waste
        </text>
      )}

      {/* Fence edge label */}
      <text
        x={1}
        y={barY - 4}
        textAnchor="start"
        className="fill-muted-foreground"
        fontSize={7}
      >
        fence
      </text>

      {/* Cut line — dashed vertical line */}
      <line
        x1={cutX}
        y1={barY - 4}
        x2={cutX}
        y2={barY + barH + 4}
        strokeDasharray="2 2"
        className="stroke-foreground/60"
        strokeWidth={1}
      />
      <text
        x={cutX}
        y={barY - 4}
        textAnchor="middle"
        className="fill-muted-foreground"
        fontSize={7}
      >
        bleed mark
      </text>

      {/* Operator side label */}
      {wasteW > 20 && (
        <text
          x={w - 1}
          y={barY - 4}
          textAnchor="end"
          className="fill-muted-foreground"
          fontSize={7}
        >
          ↓ you
        </text>
      )}

      {/* Measurement arrow */}
      <line
        x1={measureX + 2}
        y1={arrowY}
        x2={cutX - 2}
        y2={arrowY}
        className="stroke-primary"
        strokeWidth={1}
        markerEnd="url(#measure-arrow-end)"
        markerStart="url(#measure-arrow-start)"
      />
      <text
        x={measureW / 2}
        y={arrowY + 11}
        textAnchor="middle"
        className="fill-primary font-mono"
        fontSize={8}
        fontWeight="bold"
      >
        ← measure →
      </text>

      {/* Arrow markers */}
      <defs>
        <marker
          id="measure-arrow-end"
          markerWidth="6"
          markerHeight="4"
          refX="5"
          refY="2"
          orient="auto"
        >
          <path d="M0,0 L6,2 L0,4" className="fill-primary" />
        </marker>
        <marker
          id="measure-arrow-start"
          markerWidth="6"
          markerHeight="4"
          refX="1"
          refY="2"
          orient="auto"
        >
          <path d="M6,0 L0,2 L6,4" className="fill-primary" />
        </marker>
      </defs>
    </svg>
  )
}

// ── Section header helper ──────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  )
}

// ── Main Component ─────────────────────────────────────────────────

export function GuillotineDirectorTool() {
  const [sheetW, setSheetW] = useState(320)
  const [sheetH, setSheetH] = useState(450)
  const [prodW, setProdW] = useState(90)
  const [prodH, setProdH] = useState(55)
  const [bleed, setBleed] = useState(3)
  const [cols, setCols] = useState(3)
  const [rows, setRows] = useState(5)
  const [phase, setPhase] = useState<"input" | "guided">("input")
  const [currentStep, setCurrentStep] = useState(0)
  const [measuredValues, setMeasuredValues] = useState<Record<number, string>>(
    {}
  )
  const [cutLog, setCutLog] = useState<
    Array<{ step: number; instruction: string; value: number; type: string }>
  >([])
  const [activePreset, setActivePreset] = useState<string | null>("SRA3")

  const inputs: Inputs = useMemo(
    () => ({ sheetW, sheetH, prodW, prodH, bleed, cols, rows }),
    [sheetW, sheetH, prodW, prodH, bleed, cols, rows]
  )

  const imposition = useMemo(() => computeImposition(inputs), [inputs])
  const cutSequence = useMemo(
    () => generateCutSequence(inputs, imposition),
    [inputs, imposition]
  )

  const applyPreset = (preset: (typeof sheetPresets)[number]) => {
    setSheetW(preset.w)
    setSheetH(preset.h)
    setActivePreset(preset.label)
  }

  const numField = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    opts?: { min?: number; step?: number; unit?: string }
  ) => {
    const id = label.toLowerCase().replace(/\s+/g, "-")
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id} className="text-xs">
          {label}
          {opts?.unit && (
            <span className="text-muted-foreground font-normal ml-1">
              ({opts.unit})
            </span>
          )}
        </Label>
        <Input
          id={id}
          type="number"
          min={opts?.min ?? 0}
          step={opts?.step}
          value={value}
          onChange={(e) => {
            onChange(Number(e.target.value))
            if (label.startsWith("Sheet")) setActivePreset(null)
          }}
          className="font-mono"
        />
      </div>
    )
  }

  // ── Guided phase handlers ─────────────────────────────────────

  const resetGuidedState = useCallback(() => {
    setCurrentStep(0)
    setMeasuredValues({})
    setCutLog([])
  }, [])

  const handleStartCutting = useCallback(() => {
    resetGuidedState()
    setPhase("guided")
  }, [resetGuidedState])

  const handleBackToSetup = useCallback(() => {
    setPhase("input")
    resetGuidedState()
  }, [resetGuidedState])

  const handleNextCut = useCallback(() => {
    const step = cutSequence[currentStep]
    if (!step) return

    const value =
      step.type === "computed"
        ? step.value
        : parseFloat(measuredValues[currentStep] ?? "0")

    setCutLog((prev) => [
      ...prev,
      {
        step: currentStep + 1,
        instruction: step.instruction,
        value,
        type: step.type,
      },
    ])

    if (currentStep < cutSequence.length - 1) {
      setCurrentStep((prev) => prev + 1)
    } else {
      setPhase("input")
    }
  }, [currentStep, cutSequence, measuredValues])

  const handleMeasuredKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        const step = cutSequence[currentStep]
        if (!step) return
        if (step.type === "measured" && !measuredValues[currentStep]) return
        handleNextCut()
      }
    },
    [currentStep, cutSequence, measuredValues, handleNextCut]
  )

  // ── Guided phase UI ─────────────────────────────────────────────

  if (phase === "guided") {
    const step = cutSequence[currentStep]
    const totalCuts = cutSequence.length
    const isLast = currentStep === totalCuts - 1
    const progressPct = ((currentStep + 1) / totalCuts) * 100

    const canAdvance =
      step.type === "computed" ||
      (step.type === "measured" &&
        measuredValues[currentStep] !== undefined &&
        measuredValues[currentStep] !== "")

    return (
      <div className="space-y-6">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={handleBackToSetup}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Setup
          </Button>
          <Button variant="ghost" size="sm" onClick={resetGuidedState}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Restart
          </Button>
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              Cut {currentStep + 1} of {totalCuts}
            </span>
            <span className="text-muted-foreground">
              Phase {step.phase}: {step.phaseLabel}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Current step card */}
        <div className="rounded-xl border bg-card p-6 space-y-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              Phase {step.phase}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {step.phaseLabel}
            </span>
          </div>

          <p className="text-base leading-relaxed">{step.instruction}</p>

          {/* Measurement display */}
          {step.type === "computed" ? (
            <div className="rounded-lg bg-muted/50 py-6 text-center">
              <span className="text-5xl font-mono font-bold tracking-tight">
                {step.value}
              </span>
              <span className="text-xl text-muted-foreground ml-2">mm</span>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Visual aid diagram */}
              {step.measureContext && (
                <MeasureDiagram ctx={step.measureContext} />
              )}

              <div className="rounded-lg bg-muted/50 py-4 px-4">
                <div className="flex items-center gap-3 max-w-sm mx-auto">
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="0"
                    value={measuredValues[currentStep] ?? ""}
                    onChange={(e) =>
                      setMeasuredValues((prev) => ({
                        ...prev,
                        [currentStep]: e.target.value,
                      }))
                    }
                    onKeyDown={handleMeasuredKeyDown}
                    className="text-center text-3xl font-mono h-16 border-primary/30 focus-visible:border-primary"
                    autoFocus
                  />
                  <span className="text-lg text-muted-foreground font-mono shrink-0">
                    mm
                  </span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Expect around ~{step.value} mm
              </p>
            </div>
          )}

          {/* Next / Done button */}
          <Button
            className="w-full h-12 text-base"
            disabled={!canAdvance}
            onClick={handleNextCut}
          >
            {isLast ? (
              <>
                All Done
                <Check className="ml-2 h-5 w-5" />
              </>
            ) : (
              <>
                Next Cut
                <ArrowRight className="ml-2 h-5 w-5" />
              </>
            )}
          </Button>
        </div>

        {/* Cut history log */}
        <div className="space-y-3">
          <SectionLabel>Cut Log</SectionLabel>
          {cutLog.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No cuts recorded yet.
            </p>
          ) : (
            <ScrollArea className="max-h-48 rounded-lg border bg-muted/20">
              <div className="p-3 space-y-1">
                {[...cutLog].reverse().map((entry, i) => (
                  <div
                    key={cutLog.length - 1 - i}
                    className="flex items-baseline gap-2 text-sm font-mono py-0.5"
                  >
                    <span className="text-muted-foreground shrink-0 w-6 text-right">
                      {entry.step}.
                    </span>
                    <span className="text-muted-foreground truncate">
                      {entry.instruction}
                    </span>
                    <span className="ml-auto shrink-0 font-semibold">
                      {entry.value} mm
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    )
  }

  // ── Input phase ────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* Sheet size section */}
      <div className="space-y-3">
        <SectionLabel>Sheet Size</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {sheetPresets.map((preset) => (
            <Button
              key={preset.label}
              variant="outline"
              size="sm"
              className={cn(
                "h-7 text-xs px-2.5",
                activePreset === preset.label &&
                  "bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:text-primary-foreground"
              )}
              onClick={() => applyPreset(preset)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {numField("Sheet W", sheetW, setSheetW, { unit: "mm" })}
          {numField("Sheet H", sheetH, setSheetH, { unit: "mm" })}
        </div>
      </div>

      {/* Product size section */}
      <div className="space-y-3">
        <SectionLabel>Product Size</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          {numField("Product W", prodW, setProdW, { unit: "mm" })}
          {numField("Product H", prodH, setProdH, { unit: "mm" })}
        </div>
        <div className="grid grid-cols-1 gap-3">
          {numField("Bleed", bleed, setBleed, { unit: "mm" })}
        </div>
      </div>

      {/* Layout section */}
      <div className="space-y-3">
        <SectionLabel>Layout</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          {numField("Cols", cols, setCols, { min: 1, step: 1 })}
          {numField("Rows", rows, setRows, { min: 1, step: 1 })}
        </div>
      </div>

      {/* Validation / Summary */}
      {!imposition.valid ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">
            Products don&apos;t fit on this sheet — reduce cols/rows or use a
            larger sheet.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Scissors className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {cols} &times; {rows} = {imposition.totalProducts} products
              </span>
            </div>
            <Badge variant="outline" className="font-mono">
              {imposition.totalCuts} cuts
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              Strip: {imposition.stripW} &times; {imposition.stripH} mm
            </span>
            <span>
              Margin: {imposition.marginW.toFixed(1)} &times;{" "}
              {imposition.marginH.toFixed(1)} mm
            </span>
          </div>
        </div>
      )}

      {/* SVG preview */}
      <SheetPreview inputs={inputs} imposition={imposition} />

      {/* Start button */}
      <Button
        className="w-full h-12 text-base"
        disabled={!imposition.valid}
        onClick={handleStartCutting}
      >
        Start Cutting
        <ArrowRight className="ml-2 h-5 w-5" />
      </Button>
    </div>
  )
}
