"use client"

import { useState, useMemo, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, ArrowRight, Check, RotateCcw } from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────

interface Inputs {
  sheetW: number
  sheetH: number
  cardW: number
  cardH: number
  bleed: number
  cols: number
  rows: number
}

interface Imposition {
  stripW: number
  stripH: number
  marginW: number
  marginH: number
  totalCards: number
  totalCuts: number
  valid: boolean
}

interface CutStep {
  type: "measured" | "computed"
  phase: 1 | 2 | 3
  phaseLabel: string
  instruction: string
  value: number
}

// ── Pure functions ─────────────────────────────────────────────────

function computeImposition(inputs: Inputs): Imposition {
  const { sheetW, sheetH, cardW, cardH, bleed, cols, rows } = inputs
  const stripW = cardW + 2 * bleed
  const stripH = cardH + 2 * bleed
  const marginW = (sheetW - cols * stripW) / 2
  const marginH = (sheetH - rows * stripH) / 2
  return {
    stripW,
    stripH,
    marginW,
    marginH,
    totalCards: cols * rows,
    totalCuts: cols + rows + 6,
    valid: marginW >= 0 && marginH >= 0,
  }
}

function generateCutSequence(inputs: Inputs, imp: Imposition): CutStep[] {
  const { sheetW, sheetH, cardW, cardH, bleed, cols, rows } = inputs
  const { stripW, stripH, marginW, marginH } = imp
  const steps: CutStep[] = []

  // Phase 1 — Width cuts
  steps.push({
    type: "measured",
    phase: 1,
    phaseLabel: "Width Cuts",
    instruction:
      "Trim far waste — measure from sheet edge to last vertical crop mark",
    value: sheetW - marginW - bleed,
  })
  steps.push({
    type: "measured",
    phase: 1,
    phaseLabel: "Width Cuts",
    instruction:
      "Flip sheet. Trim near waste — measure from edge to first vertical crop mark",
    value: marginW + bleed,
  })
  for (let i = 0; i < cols - 1; i++) {
    steps.push({
      type: "computed",
      phase: 1,
      phaseLabel: "Width Cuts",
      instruction: `Separate strip ${i + 1} — set guillotine to strip width`,
      value: stripW,
    })
  }

  // Phase 2 — Height cuts
  steps.push({
    type: "measured",
    phase: 2,
    phaseLabel: "Height Cuts",
    instruction:
      "Stack strips. Trim far waste — measure from edge to last horizontal crop mark",
    value: sheetH - marginH - bleed,
  })
  steps.push({
    type: "measured",
    phase: 2,
    phaseLabel: "Height Cuts",
    instruction:
      "Flip stack. Trim near waste — measure from edge to first horizontal crop mark",
    value: marginH + bleed,
  })
  for (let i = 0; i < rows - 1; i++) {
    steps.push({
      type: "computed",
      phase: 2,
      phaseLabel: "Height Cuts",
      instruction: `Separate strip ${i + 1} — set guillotine to strip height`,
      value: stripH,
    })
  }

  // Phase 3 — Trim bleed
  steps.push({
    type: "computed",
    phase: 3,
    phaseLabel: "Trim Bleed",
    instruction: "Stack all pieces. Trim bleed from first side",
    value: bleed,
  })
  steps.push({
    type: "computed",
    phase: 3,
    phaseLabel: "Trim Bleed",
    instruction: "Flip stack. Trim to card width",
    value: cardW,
  })
  steps.push({
    type: "computed",
    phase: 3,
    phaseLabel: "Trim Bleed",
    instruction: "Trim bleed from third side",
    value: bleed,
  })
  steps.push({
    type: "computed",
    phase: 3,
    phaseLabel: "Trim Bleed",
    instruction: "Flip stack. Trim to card height",
    value: cardH,
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
      className="w-full max-h-64 border rounded-lg bg-white dark:bg-zinc-900"
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

      {/* Card grid */}
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
                strokeWidth={0.3}
              />
              {/* Card area */}
              <rect
                x={x + bleed}
                y={y + bleed}
                width={stripW - 2 * bleed}
                height={stripH - 2 * bleed}
                className="fill-primary/20 stroke-primary"
                strokeWidth={0.3}
              />
            </g>
          )
        })
      )}
    </svg>
  )
}

// ── Main Component ─────────────────────────────────────────────────

export function GuillotineDirectorTool() {
  const [sheetW, setSheetW] = useState(320)
  const [sheetH, setSheetH] = useState(450)
  const [cardW, setCardW] = useState(90)
  const [cardH, setCardH] = useState(55)
  const [bleed, setBleed] = useState(3)
  const [cols, setCols] = useState(3)
  const [rows, setRows] = useState(5)
  const [phase, setPhase] = useState<"input" | "guided">("input")
  const [currentStep, setCurrentStep] = useState(0)
  const [measuredValues, setMeasuredValues] = useState<Record<number, string>>({})
  const [cutLog, setCutLog] = useState<Array<{ step: number; instruction: string; value: number; type: string }>>([])

  const inputs: Inputs = useMemo(
    () => ({ sheetW, sheetH, cardW, cardH, bleed, cols, rows }),
    [sheetW, sheetH, cardW, cardH, bleed, cols, rows]
  )

  const imposition = useMemo(() => computeImposition(inputs), [inputs])
  const cutSequence = useMemo(
    () => generateCutSequence(inputs, imposition),
    [inputs, imposition]
  )

  const numField = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    opts?: { min?: number; step?: number; unit?: string }
  ) => {
    const id = label.toLowerCase().replace(/\s+/g, "-")
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>
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
          onChange={(e) => onChange(Number(e.target.value))}
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

    const entry = {
      step: currentStep + 1,
      instruction: step.instruction,
      value,
      type: step.type,
    }

    setCutLog((prev) => [...prev, entry])

    if (currentStep < cutSequence.length - 1) {
      setCurrentStep((prev) => prev + 1)
    } else {
      // Last step — return to input phase (cutLog persists until next start)
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
          <p className="text-sm text-muted-foreground">
            Cut {currentStep + 1} of {totalCuts} — Phase {step.phase}:{" "}
            {step.phaseLabel}
          </p>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Current step card */}
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <Badge variant="secondary">
            Phase {step.phase}: {step.phaseLabel}
          </Badge>

          <p className="text-base leading-relaxed">{step.instruction}</p>

          {/* Measurement display */}
          {step.type === "computed" ? (
            <div className="text-center py-4">
              <span className="text-4xl font-mono font-bold">
                {step.value}
              </span>
              <span className="text-xl text-muted-foreground ml-2">mm</span>
            </div>
          ) : (
            <div className="space-y-2 py-4">
              <div className="flex items-center gap-2 max-w-xs mx-auto">
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
                  className="text-center text-2xl font-mono h-14"
                  autoFocus
                />
                <span className="text-lg text-muted-foreground font-mono">
                  mm
                </span>
              </div>
              <p className="text-sm text-muted-foreground text-center">
                ~{step.value} mm computed
              </p>
            </div>
          )}

          {/* Next / Done button */}
          <Button
            className="w-full"
            disabled={!canAdvance}
            onClick={handleNextCut}
          >
            {isLast ? (
              <>
                All Done
                <Check className="ml-2 h-4 w-4" />
              </>
            ) : (
              <>
                Next Cut
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>

        {/* Cut history log */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Cut Log</h3>
          {cutLog.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No cuts recorded yet.
            </p>
          ) : (
            <ScrollArea className="max-h-48 rounded-md border">
              <div className="p-3 space-y-1">
                {[...cutLog].reverse().map((entry, i) => (
                  <p
                    key={cutLog.length - 1 - i}
                    className="text-sm font-mono text-muted-foreground"
                  >
                    #{entry.step} — {entry.instruction} — {entry.value} mm
                  </p>
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
    <div className="space-y-6">
      {/* Input grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {numField("Sheet W", sheetW, setSheetW, { unit: "mm" })}
        {numField("Sheet H", sheetH, setSheetH, { unit: "mm" })}
        {numField("Card W", cardW, setCardW, { unit: "mm" })}
        {numField("Card H", cardH, setCardH, { unit: "mm" })}
      </div>

      <div className="grid grid-cols-1 gap-4">
        {numField("Bleed", bleed, setBleed, { unit: "mm" })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {numField("Cols", cols, setCols, { min: 1, step: 1 })}
        {numField("Rows", rows, setRows, { min: 1, step: 1 })}
      </div>

      {/* Validation / Summary */}
      {!imposition.valid ? (
        <p className="text-sm text-destructive">
          Cards don&apos;t fit on this sheet.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {cols} &times; {rows} = {imposition.totalCards} cards,{" "}
          {imposition.totalCuts} cuts
        </p>
      )}

      {/* SVG preview */}
      <SheetPreview inputs={inputs} imposition={imposition} />

      {/* Start button */}
      <Button
        className="w-full"
        disabled={!imposition.valid}
        onClick={handleStartCutting}
      >
        Start Cutting
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  )
}
