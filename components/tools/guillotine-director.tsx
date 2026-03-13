"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { ArrowLeft, ArrowRight, Check, RotateCcw, Scissors } from "lucide-react"

// ── Preset: 2x A4 landscape on SRA3 portrait ─────────────────────

const SHEET = { w: 320, h: 450, name: "SRA3" }
const PRODUCT = { w: 297, h: 210, name: "A4" }
const BLEED = 3

const PRODUCT_BLEED_W = PRODUCT.w + 2 * BLEED // 303
const PRODUCT_BLEED_H = PRODUCT.h + 2 * BLEED // 216
const MARGIN_W = (SHEET.w - PRODUCT_BLEED_W) / 2 // 8.5
const MARGIN_H = (SHEET.h - 2 * PRODUCT_BLEED_H) / 2 // 9

// ── Step definitions ──────────────────────────────────────────────

interface Step {
  type: "measured" | "computed"
  instruction: string
  detail: string
  expectedValue: number
  orientation: "long-fence" | "short-fence"
  showTrail?: boolean
}

const steps: Step[] = [
  {
    type: "measured",
    instruction: "Trim the first margin",
    detail: `Align the long edge (${SHEET.h} mm) of the sheet with the fence. Measure from the fence to the crop mark closest to you. Set the distance and cut.`,
    expectedValue: SHEET.w - MARGIN_W, // 311.5
    orientation: "long-fence",
  },
  {
    type: "measured",
    instruction: "Trim the second margin",
    detail: `Align the short edge with the fence. Push the newly trimmed cut edge against the trail. Measure from the fence to the crop mark closest to you. Set the distance and cut.`,
    expectedValue: SHEET.h - MARGIN_H, // 441
    orientation: "short-fence",
    showTrail: true,
  },
  {
    type: "computed",
    instruction: "Separate the products",
    detail: `Do not reposition the sheet. Move the fence down by the product height plus 2x bleed (${PRODUCT.h} + ${2 * BLEED} = ${PRODUCT_BLEED_H} mm). Cut at this value.`,
    expectedValue: SHEET.h - MARGIN_H - PRODUCT_BLEED_H, // 225
    orientation: "short-fence",
    showTrail: true,
  },
  {
    type: "computed",
    instruction: "Trim the bleed",
    detail: `Stack your products. They will misalign — align the cut edges with the trail. Set the guillotine to the product height (${PRODUCT.h} mm) and cut.`,
    expectedValue: PRODUCT.h, // 210
    orientation: "short-fence",
    showTrail: true,
  },
]

// ── Guillotine Diagram ───────────────────────────────────────────

function GuillotineDiagram({
  step,
  measuredValue,
}: {
  step: Step
  measuredValue?: number
}) {
  const w = 300
  const h = 160
  const fenceX = 20
  const trailY = 20
  const sheetColor = "hsl(var(--primary) / 0.12)"
  const productColor = "hsl(var(--primary) / 0.25)"
  const cutColor = "hsl(var(--destructive))"

  const value = measuredValue ?? step.expectedValue

  // Sheet dimensions in diagram space
  const isLongFence = step.orientation === "long-fence"
  const sheetDiagW = isLongFence ? 200 : 140
  const sheetDiagH = isLongFence ? 100 : 200

  const sheetX = fenceX
  const sheetY = trailY + (step.showTrail ? 10 : 20)

  // Cut line position (proportional)
  const totalDim = isLongFence ? SHEET.w : SHEET.h
  const cutRatio = value / totalDim
  const cutPos = isLongFence
    ? sheetX + sheetDiagW * cutRatio
    : sheetY + sheetDiagH * cutRatio

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-sm mx-auto">
      {/* Fence */}
      <line
        x1={fenceX}
        y1={sheetY - 8}
        x2={fenceX}
        y2={sheetY + sheetDiagH + 8}
        className="stroke-foreground"
        strokeWidth={2}
      />
      <text
        x={fenceX - 2}
        y={sheetY + sheetDiagH / 2}
        textAnchor="end"
        className="fill-foreground"
        fontSize={9}
        fontWeight="bold"
        transform={`rotate(-90, ${fenceX - 2}, ${sheetY + sheetDiagH / 2})`}
      >
        FENCE
      </text>

      {/* Trail */}
      {step.showTrail && (
        <>
          <line
            x1={fenceX - 8}
            y1={trailY}
            x2={fenceX + sheetDiagW + 20}
            y2={trailY}
            className="stroke-foreground"
            strokeWidth={2}
          />
          <text
            x={fenceX + sheetDiagW + 22}
            y={trailY + 3}
            textAnchor="start"
            className="fill-foreground"
            fontSize={9}
            fontWeight="bold"
          >
            TRAIL
          </text>
        </>
      )}

      {/* Sheet */}
      <rect
        x={sheetX}
        y={sheetY}
        width={sheetDiagW}
        height={sheetDiagH}
        fill={sheetColor}
        className="stroke-border"
        strokeWidth={0.5}
        rx={2}
      />

      {/* Product areas (for context) */}
      {isLongFence ? (
        <rect
          x={sheetX + (sheetDiagW * MARGIN_W) / SHEET.w}
          y={sheetY + 2}
          width={(sheetDiagW * PRODUCT_BLEED_W) / SHEET.w}
          height={sheetDiagH - 4}
          fill={productColor}
          rx={1}
        />
      ) : (
        <>
          <rect
            x={sheetX + 2}
            y={sheetY + (sheetDiagH * MARGIN_H) / SHEET.h}
            width={sheetDiagW - 4}
            height={(sheetDiagH * PRODUCT_BLEED_H) / SHEET.h}
            fill={productColor}
            rx={1}
          />
          <rect
            x={sheetX + 2}
            y={
              sheetY +
              (sheetDiagH * (MARGIN_H + PRODUCT_BLEED_H)) / SHEET.h
            }
            width={sheetDiagW - 4}
            height={(sheetDiagH * PRODUCT_BLEED_H) / SHEET.h}
            fill={productColor}
            rx={1}
          />
        </>
      )}

      {/* Cut line */}
      {isLongFence ? (
        <line
          x1={cutPos}
          y1={sheetY - 6}
          x2={cutPos}
          y2={sheetY + sheetDiagH + 6}
          stroke={cutColor}
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      ) : (
        <line
          x1={sheetX - 6}
          y1={cutPos}
          x2={sheetX + sheetDiagW + 6}
          y2={cutPos}
          stroke={cutColor}
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      )}

      {/* Measurement arrow */}
      {isLongFence ? (
        <>
          <line
            x1={fenceX}
            y1={sheetY + sheetDiagH + 18}
            x2={cutPos}
            y2={sheetY + sheetDiagH + 18}
            className="stroke-primary"
            strokeWidth={1}
            markerEnd="url(#arr-end)"
            markerStart="url(#arr-start)"
          />
          <text
            x={(fenceX + cutPos) / 2}
            y={sheetY + sheetDiagH + 30}
            textAnchor="middle"
            className="fill-primary font-mono"
            fontSize={10}
            fontWeight="bold"
          >
            {value} mm
          </text>
        </>
      ) : (
        <>
          <line
            x1={sheetX + sheetDiagW + 14}
            y1={sheetY}
            x2={sheetX + sheetDiagW + 14}
            y2={cutPos}
            className="stroke-primary"
            strokeWidth={1}
            markerEnd="url(#arr-end-v)"
            markerStart="url(#arr-start-v)"
          />
          <text
            x={sheetX + sheetDiagW + 26}
            y={(sheetY + cutPos) / 2 + 3}
            textAnchor="start"
            className="fill-primary font-mono"
            fontSize={10}
            fontWeight="bold"
          >
            {value} mm
          </text>
        </>
      )}

      {/* Operator label */}
      {isLongFence ? (
        <text
          x={sheetX + sheetDiagW + 8}
          y={sheetY + sheetDiagH / 2 + 3}
          textAnchor="start"
          className="fill-muted-foreground"
          fontSize={8}
        >
          operator
        </text>
      ) : (
        <text
          x={sheetX + sheetDiagW / 2}
          y={sheetY + sheetDiagH + 16}
          textAnchor="middle"
          className="fill-muted-foreground"
          fontSize={8}
        >
          operator
        </text>
      )}

      {/* Arrow markers */}
      <defs>
        <marker id="arr-end" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
          <path d="M0,0 L6,2 L0,4" className="fill-primary" />
        </marker>
        <marker id="arr-start" markerWidth="6" markerHeight="4" refX="1" refY="2" orient="auto">
          <path d="M6,0 L0,2 L6,4" className="fill-primary" />
        </marker>
        <marker id="arr-end-v" markerWidth="4" markerHeight="6" refX="2" refY="5" orient="auto">
          <path d="M0,0 L2,6 L4,0" className="fill-primary" />
        </marker>
        <marker id="arr-start-v" markerWidth="4" markerHeight="6" refX="2" refY="1" orient="auto">
          <path d="M0,6 L2,0 L4,6" className="fill-primary" />
        </marker>
      </defs>
    </svg>
  )
}

// ── Main Component ───────────────────────────────────────────────

export function GuillotineDirectorTool() {
  const [currentStep, setCurrentStep] = useState(0)
  const [measuredValues, setMeasuredValues] = useState<Record<number, string>>({})
  const [started, setStarted] = useState(false)

  const step = steps[currentStep]
  const isLast = currentStep === steps.length - 1

  const measuredVal = measuredValues[currentStep]
  const hasMeasurement =
    step?.type === "computed" ||
    (measuredVal !== undefined && measuredVal !== "")

  const reset = useCallback(() => {
    setCurrentStep(0)
    setMeasuredValues({})
    setStarted(false)
  }, [])

  const advance = useCallback(() => {
    if (isLast) {
      reset()
    } else {
      setCurrentStep((s) => s + 1)
    }
  }, [isLast, reset])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && hasMeasurement) advance()
    },
    [hasMeasurement, advance]
  )

  // ── Landing / start screen ──────────────────────────────────────

  if (!started) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Scissors className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">2x A4 on SRA3</h3>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sheet</span>
              <span className="font-mono">{SHEET.w} x {SHEET.h} mm</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Product</span>
              <span className="font-mono">{PRODUCT.w} x {PRODUCT.h} mm</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bleed</span>
              <span className="font-mono">{BLEED} mm</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Layout</span>
              <span className="font-mono">1 x 2</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Margin (W)</span>
              <span className="font-mono">{MARGIN_W} mm</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Margin (H)</span>
              <span className="font-mono">{MARGIN_H} mm</span>
            </div>
          </div>
        </div>

        <Button className="w-full h-12 text-base" onClick={() => setStarted(true)}>
          Start Cutting
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
      </div>
    )
  }

  // ── Step wizard ─────────────────────────────────────────────────

  const progressPct = ((currentStep + 1) / steps.length) * 100

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={reset}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setCurrentStep(0)
            setMeasuredValues({})
          }}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Restart
        </Button>
      </div>

      {/* Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            Step {currentStep + 1} of {steps.length}
          </span>
          <Badge variant="secondary" className="text-xs">
            {step.type === "measured" ? "Measure" : "Computed"}
          </Badge>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Step card */}
      <div className="rounded-xl border bg-card p-6 space-y-5 shadow-sm">
        <h3 className="text-lg font-semibold">{step.instruction}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {step.detail}
        </p>

        {/* Diagram */}
        <GuillotineDiagram
          step={step}
          measuredValue={
            step.type === "measured" && measuredVal
              ? parseFloat(measuredVal)
              : undefined
          }
        />

        {/* Value display */}
        {step.type === "computed" ? (
          <div className="rounded-lg bg-muted/50 py-6 text-center">
            <span className="text-5xl font-mono font-bold tracking-tight">
              {step.expectedValue}
            </span>
            <span className="text-xl text-muted-foreground ml-2">mm</span>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/50 py-4 px-4">
              <div className="flex items-center gap-3 max-w-sm mx-auto">
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="0"
                  value={measuredVal ?? ""}
                  onChange={(e) =>
                    setMeasuredValues((prev) => ({
                      ...prev,
                      [currentStep]: e.target.value,
                    }))
                  }
                  onKeyDown={handleKeyDown}
                  className="text-center text-3xl font-mono h-16 border-primary/30 focus-visible:border-primary"
                  autoFocus
                />
                <span className="text-lg text-muted-foreground font-mono shrink-0">
                  mm
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Expected ~{step.expectedValue} mm
            </p>
          </div>
        )}

        {/* Next / Done */}
        <Button
          className={cn("w-full h-12 text-base", isLast && "bg-green-600 hover:bg-green-700")}
          disabled={!hasMeasurement}
          onClick={advance}
        >
          {isLast ? (
            <>
              Done
              <Check className="ml-2 h-5 w-5" />
            </>
          ) : (
            <>
              Next Step
              <ArrowRight className="ml-2 h-5 w-5" />
            </>
          )}
        </Button>
      </div>

      {/* Step overview */}
      <div className="space-y-1">
        {steps.map((s, i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-3 text-sm py-1.5 px-2 rounded",
              i === currentStep && "bg-muted/50 font-medium",
              i < currentStep && "text-muted-foreground"
            )}
          >
            <div
              className={cn(
                "h-5 w-5 rounded-full flex items-center justify-center text-xs shrink-0",
                i < currentStep
                  ? "bg-primary text-primary-foreground"
                  : i === currentStep
                    ? "border-2 border-primary text-primary"
                    : "border border-muted-foreground/30 text-muted-foreground/50"
              )}
            >
              {i < currentStep ? (
                <Check className="h-3 w-3" />
              ) : (
                i + 1
              )}
            </div>
            <span>{s.instruction}</span>
            {i < currentStep && (
              <span className="ml-auto font-mono text-xs text-muted-foreground">
                {s.type === "measured"
                  ? `${measuredValues[i] ?? s.expectedValue} mm`
                  : `${s.expectedValue} mm`}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
