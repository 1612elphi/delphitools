"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";

// Zoom limits
const MIN_RANGE = 1; // Minimum range (max zoom in)
const MAX_RANGE = 10000; // Maximum range (max zoom out)
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  RotateCcw,
  Palette,
  Grid3X3,
  Hash,
  Axis3D,
  Crosshair,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Mafs, Coordinates, Plot, Line } from "mafs";
import "mafs/core.css";

type Operator = "=" | "<" | ">" | "≤" | "≥";

interface FunctionEntry {
  id: string;
  expression: string;
  color: string;
  visible: boolean;
  operator: Operator;
  error?: string;
}

const OPERATORS: Operator[] = ["=", "<", ">", "≤", "≥"];

const COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#22c55e", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
];

// Safe math evaluation using Function constructor
function createEvaluator(expression: string): ((x: number) => number) | null {
  if (!expression.trim()) return null;

  try {
    // Replace common math notation with JavaScript equivalents
    const jsExpr = expression
      .replace(/\^/g, "**")
      .replace(/\bpi\b/gi, "Math.PI")
      .replace(/\be\b/g, "Math.E")
      .replace(/\bsin\b/g, "Math.sin")
      .replace(/\bcos\b/g, "Math.cos")
      .replace(/\btan\b/g, "Math.tan")
      .replace(/\basin\b/g, "Math.asin")
      .replace(/\bacos\b/g, "Math.acos")
      .replace(/\batan\b/g, "Math.atan")
      .replace(/\bsqrt\b/g, "Math.sqrt")
      .replace(/\babs\b/g, "Math.abs")
      .replace(/\blog\b/g, "Math.log10")
      .replace(/\bln\b/g, "Math.log")
      .replace(/\bexp\b/g, "Math.exp")
      .replace(/\bfloor\b/g, "Math.floor")
      .replace(/\bceil\b/g, "Math.ceil")
      .replace(/\bround\b/g, "Math.round");

    // Create function and test it
    const fn = new Function("x", `"use strict"; return (${jsExpr});`) as (
      x: number
    ) => number;

    // Test that it works with a sample value
    const testResult = fn(1);
    if (typeof testResult !== "number") return null;

    return fn;
  } catch {
    return null;
  }
}

// Custom plot component that handles discontinuities by segmenting the function
function DiscontinuousPlot({
  fn,
  color,
  xMin,
  xMax,
}: {
  fn: (x: number) => number;
  color: string;
  xMin: number;
  xMax: number;
}) {
  // Sample the function and find continuous segments
  // Extend sampling beyond visible range to prevent edge cutoff
  const segments = useMemo(() => {
    const padding = (xMax - xMin) * 0.5; // 50% padding on each side
    const sampleMin = xMin - padding;
    const sampleMax = xMax + padding;
    const numSamples = 1500; // More samples for the extended range
    const step = (sampleMax - sampleMin) / numSamples;
    const allSegments: Array<Array<[number, number]>> = [];
    let currentSegment: Array<[number, number]> = [];

    for (let i = 0; i <= numSamples; i++) {
      const x = sampleMin + i * step;
      const y = fn(x);

      // Check if y is a valid finite number
      if (Number.isFinite(y)) {
        currentSegment.push([x, y]);
      } else {
        // End current segment if it has points
        if (currentSegment.length > 1) {
          allSegments.push(currentSegment);
        }
        currentSegment = [];
      }
    }

    // Don't forget the last segment
    if (currentSegment.length > 1) {
      allSegments.push(currentSegment);
    }

    return allSegments;
  }, [fn, xMin, xMax]);

  return (
    <>
      {segments.map((segment, idx) => (
        <Plot.Parametric
          key={idx}
          t={[0, segment.length - 1]}
          xy={(t) => {
            const index = Math.min(Math.floor(t), segment.length - 1);
            const nextIndex = Math.min(index + 1, segment.length - 1);
            const frac = t - index;
            // Linear interpolation between points
            const x =
              segment[index][0] +
              frac * (segment[nextIndex][0] - segment[index][0]);
            const y =
              segment[index][1] +
              frac * (segment[nextIndex][1] - segment[index][1]);
            return [x, y];
          }}
          color={color}
          weight={2}
        />
      ))}
    </>
  );
}

function FunctionPlot({
  expression,
  color,
  xMin,
  xMax,
  operator,
  onError,
}: {
  expression: string;
  color: string;
  xMin: number;
  xMax: number;
  operator: Operator;
  onError: (hasError: boolean) => void;
}) {
  const evaluator = useMemo(() => {
    return createEvaluator(expression);
  }, [expression]);

  // Report errors via useEffect to avoid setState during render
  useEffect(() => {
    const hasError = evaluator === null && expression.trim() !== "";
    onError(hasError);
  }, [evaluator, expression, onError]);

  if (!evaluator) return null;

  // For equality, use DiscontinuousPlot (line only)
  if (operator === "=") {
    return (
      <DiscontinuousPlot fn={evaluator} color={color} xMin={xMin} xMax={xMax} />
    );
  }

  // For inequalities, use Plot.Inequality
  // Convert our operators to Mafs operators
  const mafsOperator = operator === "≤" ? "<=" : operator === "≥" ? ">=" : operator;

  // Build the y prop dynamically
  const yProp = { [mafsOperator]: evaluator } as { ">"?: (x: number) => number; "<"?: (x: number) => number; ">="?: (x: number) => number; "<="?: (x: number) => number };

  return (
    <Plot.Inequality
      y={yProp}
      color={color}
      fillOpacity={0.2}
      strokeOpacity={operator === "<" || operator === ">" ? 0.5 : 1}
      weight={2}
      svgFillPathProps={{ strokeDasharray: operator === "<" || operator === ">" ? "4 2" : undefined }}
    />
  );
}


// Calculate nice tick spacing based on range
function niceStep(range: number): number {
  const roughStep = range / 10; // Aim for about 10 ticks
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const residual = roughStep / magnitude;

  // Round to nice values: 1, 2, 5, 10
  if (residual < 1.5) return magnitude;
  if (residual < 3) return 2 * magnitude;
  if (residual < 7) return 5 * magnitude;
  return 10 * magnitude;
}

// Format tick labels to avoid floating point precision issues
function formatTickLabel(value: number, step: number): string {
  // Determine decimal places based on step size
  const decimals = step < 1 ? Math.ceil(-Math.log10(step)) : 0;
  const rounded = Math.round(value / step) * step;
  const str = rounded.toFixed(decimals);
  // Only strip trailing zeros if there's a decimal point (don't turn "10" into "1")
  if (decimals > 0) {
    return str.replace(/\.?0+$/, '') || '0';
  }
  return str;
}

export function GraphCalcTool() {
  const [functions, setFunctions] = useState<FunctionEntry[]>([
    { id: "1", expression: "x^2", color: COLORS[0], visible: true, operator: "=" },
  ]);
  const [xMin, setXMin] = useState(-10);
  const [xMax, setXMax] = useState(10);
  const [yMin, setYMin] = useState(-10);
  const [yMax, setYMax] = useState(10);
  const containerRef = useRef<HTMLDivElement>(null);

  // Trace functionality
  const [traceInput, setTraceInput] = useState("");
  const [traceResults, setTraceResults] = useState<Array<{ x: number; results: Array<{ expression: string; y: number; color: string }> }>>([]);

  // Display toggles
  const [showGrid, setShowGrid] = useState(true);
  const [showAxes, setShowAxes] = useState(true);
  const [showNumbers, setShowNumbers] = useState(true);

  // Approximate graph dimensions
  const graphWidth = 800;
  const graphHeight = 400;

  // Calculate adaptive tick spacing with minimum pixel density
  const minPixelsPerLine = 30; // Minimum pixels between grid lines
  const xStep = useMemo(() => {
    const baseStep = niceStep(xMax - xMin);
    const minStep = ((xMax - xMin) / graphWidth) * minPixelsPerLine;
    // If baseStep is too small, double it until it's large enough
    let step = baseStep;
    while (step < minStep) {
      step *= 2;
    }
    return step;
  }, [xMin, xMax]);

  const yStep = useMemo(() => {
    const baseStep = niceStep(yMax - yMin);
    const minStep = ((yMax - yMin) / graphHeight) * minPixelsPerLine;
    let step = baseStep;
    while (step < minStep) {
      step *= 2;
    }
    return step;
  }, [yMin, yMax]);

  // Determine if labels would be too dense (target: at least certain px between labels)
  const xLabelCount = (xMax - xMin) / xStep;
  const yLabelCount = (yMax - yMin) / yStep;
  const showXLabels = graphWidth / xLabelCount > 50;
  const showYLabels = graphHeight / yLabelCount > 30;

  // Panning state
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number; xMin: number; xMax: number; yMin: number; yMax: number } | null>(null);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isPanning || !panStart.current) return;

      const svgElement = containerRef.current?.querySelector('.MafsView');
      if (!svgElement) return;

      const rect = svgElement.getBoundingClientRect();

      // Calculate how much the mouse moved in graph coordinates
      const dx = (e.clientX - panStart.current.x) / rect.width * (panStart.current.xMax - panStart.current.xMin);
      const dy = (e.clientY - panStart.current.y) / rect.height * (panStart.current.yMax - panStart.current.yMin);

      // Update view (subtract because dragging right should move view left)
      setXMin(panStart.current.xMin - dx);
      setXMax(panStart.current.xMax - dx);
      setYMin(panStart.current.yMin + dy); // Y is inverted
      setYMax(panStart.current.yMax + dy);
    },
    [isPanning]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button === 0) {
        setIsPanning(true);
        panStart.current = {
          x: e.clientX,
          y: e.clientY,
          xMin,
          xMax,
          yMin,
          yMax,
        };
      }
    },
    [xMin, xMax, yMin, yMax]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    panStart.current = null;
  }, []);

  // Global mouseup listener in case mouse is released outside container
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isPanning) {
        setIsPanning(false);
        panStart.current = null;
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isPanning]);

  const handleMouseLeave = useCallback(() => {
    setIsPanning(false);
    panStart.current = null;
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();

      if (!containerRef.current) return;

      // Find the actual Mafs SVG element
      const svgElement = containerRef.current.querySelector('.MafsView');
      if (!svgElement) return;

      const rect = svgElement.getBoundingClientRect();
      const relativeX = (e.clientX - rect.left) / rect.width;
      const relativeY = (e.clientY - rect.top) / rect.height;

      // Clamp to graph area
      const clampedRelativeX = Math.max(0, Math.min(1, relativeX));
      const clampedRelativeY = Math.max(0, Math.min(1, relativeY));

      // Calculate cursor position in graph coordinates
      const cursorGraphX = xMin + clampedRelativeX * (xMax - xMin);
      const cursorGraphY = yMax - clampedRelativeY * (yMax - yMin); // Inverted Y

      // Zoom factor (scroll up = zoom in, scroll down = zoom out)
      const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;

      // Calculate new ranges, keeping cursor position fixed
      const newXMin = cursorGraphX - (cursorGraphX - xMin) * zoomFactor;
      const newXMax = cursorGraphX + (xMax - cursorGraphX) * zoomFactor;
      const newYMin = cursorGraphY - (cursorGraphY - yMin) * zoomFactor;
      const newYMax = cursorGraphY + (yMax - cursorGraphY) * zoomFactor;

      // Enforce zoom limits
      const newXRange = newXMax - newXMin;
      const newYRange = newYMax - newYMin;
      if (newXRange < MIN_RANGE || newYRange < MIN_RANGE) return; // Too zoomed in
      if (newXRange > MAX_RANGE || newYRange > MAX_RANGE) return; // Too zoomed out

      setXMin(newXMin);
      setXMax(newXMax);
      setYMin(newYMin);
      setYMax(newYMax);
    },
    [xMin, xMax, yMin, yMax]
  );

  // Trace function - calculate Y values for a given X
  const handleTrace = useCallback(() => {
    const x = parseFloat(traceInput);
    if (!Number.isFinite(x)) return;

    const results: Array<{ expression: string; y: number; color: string }> = [];

    for (const f of functions) {
      if (!f.visible || !f.expression.trim()) continue;
      const evaluator = createEvaluator(f.expression);
      if (!evaluator) continue;

      const y = evaluator(x);
      if (Number.isFinite(y)) {
        results.push({ expression: f.expression, y, color: f.color });
      }
    }

    if (results.length > 0) {
      setTraceResults((prev) => [{ x, results }, ...prev].slice(0, 10)); // Keep last 10
    }
  }, [traceInput, functions]);

  const clearTraceResults = useCallback(() => {
    setTraceResults([]);
  }, []);

  const addFunction = () => {
    const newId = String(Date.now());
    const colorIndex = functions.length % COLORS.length;
    setFunctions((prev) => [
      ...prev,
      { id: newId, expression: "", color: COLORS[colorIndex], visible: true, operator: "=" },
    ]);
  };

  const updateFunction = (id: string, updates: Partial<FunctionEntry>) => {
    setFunctions((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates } : f))
    );
  };

  const removeFunction = (id: string) => {
    setFunctions((prev) => prev.filter((f) => f.id !== id));
  };

  const toggleVisibility = (id: string) => {
    setFunctions((prev) =>
      prev.map((f) => (f.id === id ? { ...f, visible: !f.visible } : f))
    );
  };

  const cycleColor = (id: string) => {
    setFunctions((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const currentIndex = COLORS.indexOf(f.color);
        const nextIndex = (currentIndex + 1) % COLORS.length;
        return { ...f, color: COLORS[nextIndex] };
      })
    );
  };

  const cycleOperator = (id: string) => {
    setFunctions((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const currentIndex = OPERATORS.indexOf(f.operator);
        const nextIndex = (currentIndex + 1) % OPERATORS.length;
        return { ...f, operator: OPERATORS[nextIndex] };
      })
    );
  };

  const resetView = () => {
    setXMin(-10);
    setXMax(10);
    setYMin(-10);
    setYMax(10);
  };

  // TI-84 style zoom presets
  const zoomStandard = () => {
    setXMin(-10);
    setXMax(10);
    setYMin(-10);
    setYMax(10);
  };

  const zoomTrig = () => {
    setXMin(-2 * Math.PI);
    setXMax(2 * Math.PI);
    setYMin(-4);
    setYMax(4);
  };

  const zoomDecimal = () => {
    setXMin(-1);
    setXMax(1);
    setYMin(-1);
    setYMax(1);
  };

  const zoomSquare = () => {
    // Adjust Y range to match aspect ratio (graph is 800x400, so 2:1)
    const xRange = xMax - xMin;
    const yRange = xRange / 2; // Half because graph is twice as wide as tall
    const yCenter = (yMax + yMin) / 2;
    setYMin(yCenter - yRange / 2);
    setYMax(yCenter + yRange / 2);
  };

  const handleError = useCallback(
    (id: string) => (hasError: boolean) => {
      setFunctions((prev) => {
        const fn = prev.find((f) => f.id === id);
        if (!fn) return prev;
        const newError = hasError ? "Invalid expression" : undefined;
        if (fn.error === newError) return prev;
        return prev.map((f) => (f.id === id ? { ...f, error: newError } : f));
      });
    },
    []
  );

  const formatNumber = (n: number) => {
    if (Math.abs(n) < 0.0001 && n !== 0) return n.toExponential(3);
    return n.toFixed(4).replace(/\.?0+$/, "");
  };

  // Build CSS classes for styling
  const mafsClasses = [
    "border rounded-lg overflow-hidden relative",
    "[&_.MafsView]:!bg-card",
    // Remove text stroke (outline) and make numbers black with 50% opacity
    "[&_.mafs-shadow]:!stroke-none",
    "[&_.MafsView_text]:!fill-black/50",
    // Grid lines at 10% opacity (targets lines from Coordinates.Cartesian)
    "[&_.MafsView_g_line]:stroke-black/10",
    // Hide numbers if toggled off
    !showNumbers && "[&_.MafsView_text]:!opacity-0",
  ].filter(Boolean).join(" ");

  return (
    <div className="space-y-4">
      {/* Function Inputs */}
      <div className="space-y-3">
        {functions.map((f, index) => (
          <div key={f.id} className="flex items-center gap-2">
            {/* Colour indicator */}
            <div className="border rounded-md p-1.5 shrink-0">
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: f.color }}
              />
            </div>
            {/* Function name */}
            <div className="border rounded-md px-2 py-1.5 text-sm text-muted-foreground shrink-0 font-mono">
              y<sub>{index + 1}</sub>
            </div>
            {/* Operator button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => cycleOperator(f.id)}
              className="shrink-0 font-mono text-base w-10"
              title="Click to change operator"
            >
              {f.operator}
            </Button>
            {/* Expression input */}
            <div className="flex-1 relative">
              <Input
                value={f.expression}
                onChange={(e) =>
                  updateFunction(f.id, { expression: e.target.value })
                }
                placeholder="x^2, sin(x), etc."
                className={`font-mono ${
                  f.error ? "border-destructive" : ""
                }`}
              />
              {f.error && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-destructive">
                  {f.error}
                </span>
              )}
            </div>
            {/* Change colour */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => cycleColor(f.id)}
              title="Change colour"
            >
              <Palette className="size-4" style={{ color: f.color }} />
            </Button>
            {/* Toggle visibility */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => toggleVisibility(f.id)}
              title={f.visible ? "Hide" : "Show"}
            >
              {f.visible ? (
                <Eye className="size-4" />
              ) : (
                <EyeOff className="size-4 text-muted-foreground" />
              )}
            </Button>
            {functions.length > 1 && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => removeFunction(f.id)}
                title="Remove"
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            )}
          </div>
        ))}

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={addFunction}>
            <Plus className="size-4 mr-2" />
            Add function
          </Button>

          <div className="flex-1" />

          {/* Display toggles */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showGrid ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setShowGrid(!showGrid)}
                className="size-8"
              >
                <Grid3X3 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle grid</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showAxes ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setShowAxes(!showAxes)}
                className="size-8"
              >
                <Axis3D className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle axes</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showNumbers ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setShowNumbers(!showNumbers)}
                className="size-8"
              >
                <Hash className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle numbers</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Graph Container */}
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        className={`${mafsClasses} ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
      >
        <Mafs
          height={400}
          viewBox={{
            x: [xMin, xMax],
            y: [yMin, yMax],
          }}
          preserveAspectRatio={false}
          pan={false}
        >
          {/* Grid and labels - grid lines at 10% opacity */}
          {showGrid && (
            <Coordinates.Cartesian
              xAxis={{
                lines: xStep,
                labels: showXLabels ? (n) => formatTickLabel(n, xStep) : () => "",
              }}
              yAxis={{
                lines: yStep,
                labels: showYLabels ? (n) => formatTickLabel(n, yStep) : () => "",
              }}
            />
          )}

          {/* Custom axes with full opacity - extend far beyond visible range */}
          {showAxes && (
            <>
              <Line.Segment
                point1={[-1e9, 0]}
                point2={[1e9, 0]}
                color="rgba(0,0,0,0.6)"
                weight={1.5}
              />
              <Line.Segment
                point1={[0, -1e9]}
                point2={[0, 1e9]}
                color="rgba(0,0,0,0.6)"
                weight={1.5}
              />
            </>
          )}

          {functions
            .filter((f) => f.visible && f.expression.trim())
            .map((f) => (
              <FunctionPlot
                key={f.id}
                expression={f.expression}
                color={f.color}
                xMin={xMin}
                xMax={xMax}
                operator={f.operator}
                onError={handleError(f.id)}
              />
            ))}
        </Mafs>

        {/* Debug: zoom range display */}
        <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs font-mono px-2 py-1 rounded">
          X: {(xMax - xMin).toFixed(3)} | Y: {(yMax - yMin).toFixed(3)}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="space-y-1">
          <Label className="text-xs">X Range</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={Math.round(xMin * 10) / 10}
              onChange={(e) => setXMin(parseFloat(e.target.value) || -10)}
              className="w-20 text-center"
              step="0.1"
            />
            <span className="text-muted-foreground">to</span>
            <Input
              type="number"
              value={Math.round(xMax * 10) / 10}
              onChange={(e) => setXMax(parseFloat(e.target.value) || 10)}
              className="w-20 text-center"
              step="0.1"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Y Range</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={Math.round(yMin * 10) / 10}
              onChange={(e) => setYMin(parseFloat(e.target.value) || -10)}
              className="w-20 text-center"
              step="0.1"
            />
            <span className="text-muted-foreground">to</span>
            <Input
              type="number"
              value={Math.round(yMax * 10) / 10}
              onChange={(e) => setYMax(parseFloat(e.target.value) || 10)}
              className="w-20 text-center"
              step="0.1"
            />
          </div>
        </div>

        {/* Zoom presets */}
        <div className="space-y-1">
          <Label className="text-xs">Zoom</Label>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={zoomStandard} className="text-xs">
                  ZStandard
                </Button>
              </TooltipTrigger>
              <TooltipContent>-10 to 10</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={zoomTrig} className="text-xs">
                  ZTrig
                </Button>
              </TooltipTrigger>
              <TooltipContent>-2π to 2π, -4 to 4</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={zoomDecimal} className="text-xs">
                  ZDecimal
                </Button>
              </TooltipTrigger>
              <TooltipContent>-1 to 1</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={zoomSquare} className="text-xs">
                  ZSquare
                </Button>
              </TooltipTrigger>
              <TooltipContent>1:1 aspect ratio</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <Button variant="outline" size="sm" onClick={resetView}>
          <RotateCcw className="size-4 mr-1" />
          Reset
        </Button>

        <div className="flex-1" />

        {/* Trace input */}
        <div className="space-y-1">
          <Label className="text-xs">Trace</Label>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">x =</span>
            <Input
              type="number"
              value={traceInput}
              onChange={(e) => setTraceInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTrace()}
              placeholder="0"
              className="w-24 text-center font-mono"
            />
            <Button variant="secondary" size="sm" onClick={handleTrace}>
              <Crosshair className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Trace Results Stack */}
      {traceResults.length > 0 && (
        <div className="border rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">Trace Results</Label>
            <Button variant="ghost" size="sm" onClick={clearTraceResults} className="h-6 px-2">
              <X className="size-3 mr-1" />
              Clear
            </Button>
          </div>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {traceResults.map((trace, traceIdx) => (
              <div key={traceIdx} className="text-sm font-mono bg-muted/50 rounded px-2 py-1">
                <span className="text-muted-foreground">x = {formatNumber(trace.x)}</span>
                {trace.results.map((result, resultIdx) => (
                  <div key={resultIdx} className="flex items-center gap-2 ml-2">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: result.color }}
                    />
                    <span className="text-muted-foreground truncate">{result.expression}</span>
                    <span>=</span>
                    <span>{formatNumber(result.y)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Syntax Help */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p className="font-medium">Syntax examples:</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <code className="bg-muted px-2 py-1 rounded">x^2</code>
          <code className="bg-muted px-2 py-1 rounded">sin(x)</code>
          <code className="bg-muted px-2 py-1 rounded">sqrt(x)</code>
          <code className="bg-muted px-2 py-1 rounded">log(x)</code>
          <code className="bg-muted px-2 py-1 rounded">abs(x)</code>
          <code className="bg-muted px-2 py-1 rounded">2*x + 1</code>
          <code className="bg-muted px-2 py-1 rounded">exp(x)</code>
          <code className="bg-muted px-2 py-1 rounded">tan(x)</code>
        </div>
      </div>
    </div>
  );
}
