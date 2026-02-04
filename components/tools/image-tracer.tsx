"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import {
  Upload, Download, Copy, Check, Loader2, ChevronDown,
  RefreshCw, ArrowRight, Info, Minus, Plus, X, ChevronsUpDown,
  // Preset icons
  Settings2, Layers, Spline, Triangle, Scan, Waves, Moon,
  Grid3X3, Shuffle, Paintbrush, Palette, Sparkles, Brush,
  LucideIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

// ── Types ────────────────────────────────────────────────────────────

interface TracerOptions {
  numberofcolors: number
  colorquantcycles: number
  ltres: number
  qtres: number
  pathomit: number
  strokewidth: number
  scale: number
  blurradius: number
  blurdelta: number
  colorsampling: number
  mincolorratio: number
  roundcoords: number
  lcpr: number
  qcpr: number
  layering: number
  rightangleenhance: boolean
  linefilter: boolean
}

const DEFAULT_OPTIONS: TracerOptions = {
  numberofcolors: 16,
  colorquantcycles: 3,
  ltres: 1,
  qtres: 1,
  pathomit: 8,
  strokewidth: 1,
  scale: 1,
  blurradius: 0,
  blurdelta: 20,
  colorsampling: 2,
  mincolorratio: 0,
  roundcoords: 1,
  lcpr: 0,
  qcpr: 0,
  layering: 0,
  rightangleenhance: true,
  linefilter: false,
}

// ── Preset config ────────────────────────────────────────────────────

interface PresetConfig {
  id: string
  label: string
  icon: LucideIcon
  description: string
}

const PRESETS: PresetConfig[] = [
  { id: "default",        label: "Default",     icon: Settings2,   description: "Balanced tracing" },
  { id: "posterized1",    label: "Poster 1",    icon: Layers,      description: "Light posterisation" },
  { id: "posterized2",    label: "Poster 2",    icon: Layers,      description: "Medium posterisation" },
  { id: "posterized3",    label: "Poster 3",    icon: Layers,      description: "Heavy posterisation" },
  { id: "curvy",          label: "Curvy",        icon: Spline,      description: "Smooth organic curves" },
  { id: "sharp",          label: "Sharp",        icon: Triangle,    description: "Precise angular lines" },
  { id: "detailed",       label: "Detailed",     icon: Scan,        description: "High detail, many colours" },
  { id: "smoothed",       label: "Smoothed",     icon: Waves,       description: "Gaussian blur pre-pass" },
  { id: "grayscale",      label: "Greyscale",    icon: Moon,        description: "7-tone greyscale" },
  { id: "fixedpalette",   label: "Fixed",        icon: Grid3X3,     description: "27-colour RGB cube" },
  { id: "randomsampling1",label: "Random 1",     icon: Shuffle,     description: "Random palette sampling" },
  { id: "randomsampling2",label: "Random 2",     icon: Shuffle,     description: "Random palette variant" },
  { id: "artistic1",      label: "Art 1",        icon: Paintbrush,  description: "Stylised output" },
  { id: "artistic2",      label: "Art 2",        icon: Brush,       description: "Stylised variant" },
  { id: "artistic3",      label: "Art 3",        icon: Palette,     description: "Artistic colour mix" },
  { id: "artistic4",      label: "Art 4",        icon: Sparkles,    description: "Abstract artistic" },
]

// ── Extracted sub-components ─────────────────────────────────────────

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="text-muted-foreground/60 hover:text-muted-foreground transition-colors">
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[200px]">
        {text}
      </TooltipContent>
    </Tooltip>
  )
}

function OptionSlider({
  label,
  tip,
  value,
  onChange,
  min,
  max,
  step,
  displayValue,
}: {
  label: string
  tip: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step: number
  displayValue?: string
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <Label className="text-sm">{label}</Label>
          <InfoTip text={tip} />
        </span>
        <span className="text-sm font-mono text-muted-foreground tabular-nums">
          {displayValue ?? value}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  )
}

function Stepper({
  label,
  tip,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string
  tip: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5">
        <Label className="text-sm">{label}</Label>
        <InfoTip text={tip} />
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - step))}
          disabled={value <= min}
          className="flex items-center justify-center size-7 rounded-md border bg-card hover:bg-accent disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <Minus className="size-3" />
        </button>
        <span className="w-8 text-center text-sm font-mono tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + step))}
          disabled={value >= max}
          className="flex items-center justify-center size-7 rounded-md border bg-card hover:bg-accent disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <Plus className="size-3" />
        </button>
      </div>
    </div>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{children}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}

// ── Stroke width visual picker ───────────────────────────────────────

const STROKE_OPTIONS = [0, 0.5, 1, 2, 3, 5]

function StrokeWidthPicker({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  // Find the closest preset, or null if custom
  const activeIdx = STROKE_OPTIONS.indexOf(value)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <Label className="text-sm">Stroke width</Label>
          <InfoTip text="Width of the outline drawn around each traced shape. 0 means no stroke." />
        </span>
        <span className="text-sm font-mono text-muted-foreground tabular-nums">{value}</span>
      </div>
      <div className="flex gap-1.5">
        {STROKE_OPTIONS.map((sw, i) => (
          <button
            key={sw}
            type="button"
            onClick={() => onChange(sw)}
            className={`flex-1 h-9 rounded-md border flex items-center justify-center transition-colors ${
              i === activeIdx
                ? "border-primary bg-primary/10"
                : "bg-card hover:bg-accent"
            }`}
          >
            {sw === 0 ? (
              <span className="text-[10px] text-muted-foreground">None</span>
            ) : (
              <div
                className="rounded-full bg-foreground"
                style={{ width: `${Math.min(sw * 6, 24)}px`, height: `${Math.max(sw, 1)}px` }}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Scale quick-pick ─────────────────────────────────────────────────

const SCALE_OPTIONS = [0.5, 1, 2, 3, 5]

function ScalePicker({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  const activeIdx = SCALE_OPTIONS.indexOf(value)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <Label className="text-sm">Scale</Label>
          <InfoTip text="Multiplier for the output SVG size relative to the source image." />
        </span>
        <span className="text-sm font-mono text-muted-foreground tabular-nums">{value}x</span>
      </div>
      <div className="flex gap-1.5">
        {SCALE_OPTIONS.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={`flex-1 h-9 rounded-md border text-xs font-medium transition-colors ${
              i === activeIdx
                ? "border-primary bg-primary/10 text-primary"
                : "bg-card hover:bg-accent text-muted-foreground"
            }`}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Number of colours card ───────────────────────────────────────────

function ColourCountCard({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1.5">
          <Label className="text-sm font-medium">Colours</Label>
          <InfoTip text="Number of colours used to quantise the image before tracing. Fewer colours = simpler, bolder result." />
        </span>
      </div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => onChange(Math.max(2, value - 1))}
          disabled={value <= 2}
          className="flex items-center justify-center size-9 rounded-lg border bg-background hover:bg-accent disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <Minus className="size-4" />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-3xl font-bold tabular-nums leading-none">{value}</span>
        </div>
        <button
          type="button"
          onClick={() => onChange(Math.min(64, value + 1))}
          disabled={value >= 64}
          className="flex items-center justify-center size-9 rounded-lg border bg-background hover:bg-accent disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <Plus className="size-4" />
        </button>
      </div>
      <Slider
        min={2}
        max={64}
        step={1}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        className="mt-3"
      />
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────

// Create an inline Web Worker that runs imagetracerjs off the main thread.
// Fetches the library source from public/ and injects it into a Blob-based worker.
async function createTracerWorker(): Promise<Worker | null> {
  try {
    const resp = await fetch("/lib/imagetracer_v1.2.6.js")
    if (!resp.ok) return null
    const libSource = await resp.text()
    const workerCode = `
      ${libSource}
      self.onmessage = function(e) {
        var imgd = new ImageData(
          new Uint8ClampedArray(e.data.buffer),
          e.data.width,
          e.data.height
        );
        var svg = self.ImageTracer.imagedataToSVG(imgd, e.data.opts);
        self.postMessage(svg);
      };
    `
    const blob = new Blob([workerCode], { type: "application/javascript" })
    return new Worker(URL.createObjectURL(blob))
  } catch {
    return null
  }
}

export function ImageTracerTool() {
  const router = useRouter()
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [tracing, setTracing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [options, setOptions] = useState<TracerOptions>({ ...DEFAULT_OPTIONS })
  const [preset, setPreset] = useState<string>("default")
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [presetsOpen, setPresetsOpen] = useState(false)
  const [hasResult, setHasResult] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageDataRef = useRef<ImageData | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const rawSvgRef = useRef<string | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const workerInitRef = useRef<Promise<Worker | null> | null>(null)
  const prevPreviewUrlRef = useRef<string | null>(null)

  // Lazily initialise the worker (async, cached after first call)
  const getWorker = useCallback(async () => {
    if (workerRef.current) return workerRef.current
    if (!workerInitRef.current) {
      workerInitRef.current = createTracerWorker()
    }
    const worker = await workerInitRef.current
    workerRef.current = worker
    return worker
  }, [])

  // Clean up worker on unmount
  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
      if (prevPreviewUrlRef.current) URL.revokeObjectURL(prevPreviewUrlRef.current)
    }
  }, [])

  const extractImageData = useCallback((file: File): Promise<ImageData> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = canvasRef.current
        if (!canvas) { reject(new Error("Canvas not available")); return }
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext("2d")
        if (!ctx) { reject(new Error("Canvas 2D context unavailable")); return }
        ctx.drawImage(img, 0, 0)
        resolve(ctx.getImageData(0, 0, img.width, img.height))
      }
      img.onerror = () => reject(new Error("Failed to load image"))
      img.src = URL.createObjectURL(file)
    })
  }, [])

  // Make the SVG responsive for preview display
  const makeResponsive = (svg: string): string => {
    const widthMatch = svg.match(/<svg[^>]*\swidth="([^"]+)"/)
    const heightMatch = svg.match(/<svg[^>]*\sheight="([^"]+)"/)
    const hasViewBox = /<svg[^>]*\sviewBox="/.test(svg)
    let result = svg
    if (!hasViewBox && widthMatch && heightMatch) {
      result = result.replace(/<svg/, `<svg viewBox="0 0 ${widthMatch[1]} ${heightMatch[1]}"`)
    }
    result = result
      .replace(/(<svg[^>]*)\swidth="[^"]*"/, '$1 width="100%"')
      .replace(/(<svg[^>]*)\sheight="[^"]*"/, '$1 height="auto"')
    return result
  }

  // Convert SVG string to a blob URL for <img> rendering (avoids DOM thrashing)
  const svgToBlobUrl = (svg: string): string => {
    const blob = new Blob([svg], { type: "image/svg+xml" })
    return URL.createObjectURL(blob)
  }

  const handleTraceResult = useCallback((rawSvg: string) => {
    rawSvgRef.current = rawSvg
    // Revoke previous preview blob URL
    if (prevPreviewUrlRef.current) URL.revokeObjectURL(prevPreviewUrlRef.current)
    const url = svgToBlobUrl(makeResponsive(rawSvg))
    prevPreviewUrlRef.current = url
    setPreviewUrl(url)
    setHasResult(true)
    setTracing(false)
  }, [])

  const runTrace = useCallback(async (imgd: ImageData, opts: TracerOptions) => {
    setTracing(true)

    const worker = await getWorker()
    if (worker) {
      // Transfer ImageData buffer to worker (off main thread)
      const buffer = imgd.data.buffer.slice(0)
      worker.onmessage = (e: MessageEvent<string>) => handleTraceResult(e.data)
      worker.onerror = () => {
        console.error("Worker tracing failed")
        setTracing(false)
      }
      worker.postMessage(
        { buffer, width: imgd.width, height: imgd.height, opts: { ...opts } },
        [buffer]
      )
    } else {
      // Fallback: run on main thread
      try {
        const mod = await import("imagetracerjs")
        await new Promise(resolve => setTimeout(resolve, 10))
        const rawSvg = mod.default.imagedataToSVG(imgd, { ...opts })
        handleTraceResult(rawSvg)
      } catch (err) {
        console.error("Tracing failed:", err)
        setTracing(false)
      }
    }
  }, [getWorker, handleTraceResult])

  useEffect(() => {
    if (!imageFile) return
    let cancelled = false
    extractImageData(imageFile).then((imgd) => {
      if (cancelled) return
      imageDataRef.current = imgd
      runTrace(imgd, options)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageFile, extractImageData, runTrace])

  const handleRetrace = useCallback(() => {
    if (!imageDataRef.current) return
    setDirty(false)
    runTrace(imageDataRef.current, options)
  }, [options, runTrace])

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return
    setPreviewUrl(null)
    setHasResult(false)
    rawSvgRef.current = null
    imageDataRef.current = null
    setImageFile(file)
    setImageSrc(URL.createObjectURL(file))
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  const applyPreset = useCallback(async (name: string) => {
    setPreset(name)
    setDirty(true)
    try {
      const mod = await import("imagetracerjs")
      const presetOpts = mod.default.optionpresets[name]
      if (presetOpts) {
        setOptions(prev => ({
          ...DEFAULT_OPTIONS,
          ...presetOpts,
          scale: presetOpts.scale ?? prev.scale,
        }))
      }
    } catch {
      setOptions({ ...DEFAULT_OPTIONS })
    }
  }, [])

  const updateOption = useCallback(<K extends keyof TracerOptions>(key: K, value: TracerOptions[K]) => {
    setPreset("custom")
    setDirty(true)
    setOptions(prev => ({ ...prev, [key]: value }))
  }, [])

  const handleDownload = useCallback(() => {
    const raw = rawSvgRef.current
    if (!raw || !imageFile) return
    const blob = new Blob([raw], { type: "image/svg+xml" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.download = `${imageFile.name.replace(/\.[^.]+$/, "")}-traced.svg`
    a.href = url
    a.click()
    URL.revokeObjectURL(url)
  }, [imageFile])

  const handleCopy = useCallback(async () => {
    const raw = rawSvgRef.current
    if (!raw) return
    try {
      await navigator.clipboard.writeText(raw)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error("Copy failed:", err)
    }
  }, [])

  const handleClear = useCallback(() => {
    setImageFile(null)
    setImageSrc(null)
    if (prevPreviewUrlRef.current) URL.revokeObjectURL(prevPreviewUrlRef.current)
    prevPreviewUrlRef.current = null
    setPreviewUrl(null)
    setHasResult(false)
    setTracing(false)
    setDirty(false)
    imageDataRef.current = null
    rawSvgRef.current = null
    setOptions({ ...DEFAULT_OPTIONS })
    setPreset("default")
    setCopied(false)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [])

  const sendToOptimiser = () => {
    const raw = rawSvgRef.current
    if (!raw) return
    sessionStorage.setItem("svg-optimiser-input", raw)
    router.push("/tools/svg-optimiser")
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // ── Drop zone (no image) ────────────────────────────────────────────

  if (!imageFile) {
    return (
      <div className="space-y-4">
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
          onDragLeave={() => setIsDragOver(false)}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
            isDragOver ? "border-primary bg-primary/5" : "hover:border-primary/50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Upload className="size-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium">Drop an image here</p>
          <p className="text-sm text-muted-foreground mt-1">
            or click to select &mdash; PNG, JPG, WebP, GIF
          </p>
        </div>
        <canvas ref={canvasRef} className="hidden" />
      </div>
    )
  }

  // ── Main layout: preview on top, controls underneath ────────────────

  return (
    <div className="space-y-4">
      <canvas ref={canvasRef} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* ── Toolbar ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* File info */}
        <div className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5">
          {imageSrc && (
            <div className="size-7 rounded bg-muted overflow-hidden shrink-0">
              <img src={imageSrc} alt="" className="size-full object-cover" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate max-w-[140px]">{imageFile.name}</p>
          </div>
          <span className="text-xs text-muted-foreground">{formatSize(imageFile.size)}</span>
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 flex items-center justify-center size-6 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {hasResult && !tracing && (
          <span className="text-xs text-muted-foreground">
            SVG: {formatSize(new Blob([rawSvgRef.current || ""]).size)}
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Inline actions */}
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            onClick={handleDownload}
            disabled={!hasResult || tracing}
          >
            <Download className="size-3.5 mr-1.5" />
            Download
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            disabled={!hasResult || tracing}
          >
            {copied ? (
              <><Check className="size-3.5 mr-1.5" />Copied</>
            ) : (
              <><Copy className="size-3.5 mr-1.5" />Copy</>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={sendToOptimiser}
            disabled={!hasResult || tracing}
          >
            <ArrowRight className="size-3.5 mr-1.5" />
            Optimise
          </Button>
        </div>
      </div>

      {/* ── Preview ──────────────────────────────────────────────── */}
      <div className="rounded-xl border bg-card p-4 min-h-[280px] flex items-center justify-center">
        {tracing ? (
          <div className="flex flex-col items-center justify-center p-8">
            <Loader2 className="size-8 animate-spin text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Tracing image&hellip;</p>
          </div>
        ) : previewUrl ? (
          <img
            src={previewUrl}
            alt="Traced SVG preview"
            className="max-w-full max-h-[60vh] object-contain block mx-auto"
          />
        ) : imageSrc ? (
          <img
            src={imageSrc}
            alt="Source"
            className="max-w-full max-h-[60vh] object-contain block mx-auto"
          />
        ) : null}
      </div>

      {/* ── Preset + Retrace row ────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <Popover open={presetsOpen} onOpenChange={setPresetsOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm hover:bg-accent transition-colors"
            >
              {(() => {
                const active = PRESETS.find(p => p.id === preset)
                if (active) {
                  const Icon = active.icon
                  return <><Icon className="size-4 text-primary" /><span className="font-medium">{active.label}</span></>
                }
                return <span className="font-medium">Custom</span>
              })()}
              <ChevronsUpDown className="size-3.5 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[340px] p-2">
            <div className="grid grid-cols-4 gap-1">
              {PRESETS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => { applyPreset(id); setPresetsOpen(false) }}
                  className={`flex flex-col items-center gap-1 rounded-md px-1 py-2.5 transition-colors ${
                    preset === id
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-accent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="size-4" />
                  <span className="text-[10px] leading-tight font-medium">{label}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {imageDataRef.current && (
          <Button
            size="sm"
            onClick={handleRetrace}
            disabled={!dirty || tracing}
          >
            {tracing ? (
              <><Loader2 className="size-3.5 mr-1.5 animate-spin" />Tracing&hellip;</>
            ) : (
              <><RefreshCw className="size-3.5 mr-1.5" />Retrace</>
            )}
          </Button>
        )}
      </div>

      {/* ── Controls grid ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* ── Colours ──────────────────────────────────────────── */}
        <div className="rounded-xl border bg-card p-4 space-y-4">
          <SectionHeader>Colours</SectionHeader>
          <ColourCountCard
            value={options.numberofcolors}
            onChange={(v) => updateOption("numberofcolors", v)}
          />
          <Stepper
            label="Quantisation cycles"
            tip="Number of k-means iterations for colour clustering. More cycles = more accurate colours, slower trace."
            value={options.colorquantcycles}
            onChange={(v) => updateOption("colorquantcycles", v)}
            min={1}
            max={20}
          />
        </div>

        {/* ── Smoothing ────────────────────────────────────────── */}
        <div className="rounded-xl border bg-card p-4 space-y-4">
          <SectionHeader>Smoothing</SectionHeader>
          <OptionSlider
            label="Path smoothing"
            tip="Controls how aggressively straight lines replace curves. Higher = smoother with fewer curves."
            value={options.ltres}
            onChange={(v) => updateOption("ltres", v)}
            min={0.1}
            max={10}
            step={0.1}
            displayValue={options.ltres.toFixed(1)}
          />
          <OptionSlider
            label="Curve smoothing"
            tip="Controls quadratic spline fitting. Higher = smoother curves with less detail."
            value={options.qtres}
            onChange={(v) => updateOption("qtres", v)}
            min={0.1}
            max={10}
            step={0.1}
            displayValue={options.qtres.toFixed(1)}
          />
          <OptionSlider
            label="Min path size"
            tip="Paths with fewer than this many nodes are removed. Raise to filter out noise and small artifacts."
            value={options.pathomit}
            onChange={(v) => updateOption("pathomit", v)}
            min={0}
            max={200}
            step={1}
          />
        </div>

        {/* ── Output ───────────────────────────────────────────── */}
        <div className="rounded-xl border bg-card p-4 space-y-4">
          <SectionHeader>Output</SectionHeader>
          <StrokeWidthPicker
            value={options.strokewidth}
            onChange={(v) => updateOption("strokewidth", v)}
          />
          <ScalePicker
            value={options.scale}
            onChange={(v) => updateOption("scale", v)}
          />
        </div>
      </div>

      {/* ── Advanced ──────────────────────────────────────────────── */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex items-center justify-between w-full pt-1 group"
          >
            <span className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">Advanced</span>
              <div className="flex-1 h-px bg-border" />
            </span>
            <ChevronDown className={`size-3.5 text-muted-foreground/70 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="rounded-xl border bg-card p-4 space-y-4">
              <Stepper
                label="Blur radius"
                tip="Gaussian blur pre-processing. Smooths the image before tracing to reduce noise."
                value={options.blurradius}
                onChange={(v) => updateOption("blurradius", v)}
                min={0}
                max={20}
              />
              <OptionSlider
                label="Blur delta"
                tip="Threshold for the blur difference. Only relevant when blur radius > 0."
                value={options.blurdelta}
                onChange={(v) => updateOption("blurdelta", v)}
                min={0}
                max={256}
                step={1}
              />
              <div className="space-y-2">
                <span className="flex items-center gap-1.5">
                  <Label className="text-sm">Colour sampling</Label>
                  <InfoTip text="How initial colours are sampled. Generated uses k-means, Random picks randomly, Deterministic uses a fixed grid." />
                </span>
                <Select
                  value={String(options.colorsampling)}
                  onValueChange={(v) => updateOption("colorsampling", Number(v))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Generated</SelectItem>
                    <SelectItem value="1">Random</SelectItem>
                    <SelectItem value="2">Deterministic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="rounded-xl border bg-card p-4 space-y-4">
              <OptionSlider
                label="Min colour ratio"
                tip="Minimum proportion a colour must occupy to be kept. Raise to eliminate rare colours."
                value={options.mincolorratio}
                onChange={(v) => updateOption("mincolorratio", v)}
                min={0}
                max={1}
                step={0.01}
                displayValue={options.mincolorratio.toFixed(2)}
              />
              <Stepper
                label="Coordinate rounding"
                tip="Decimal places for SVG path coordinates. Lower = smaller file, less precise."
                value={options.roundcoords}
                onChange={(v) => updateOption("roundcoords", v)}
                min={0}
                max={5}
              />
              <div className="space-y-2">
                <span className="flex items-center gap-1.5">
                  <Label className="text-sm">Layering mode</Label>
                  <InfoTip text="Sequential stacks colour layers back-to-front. Parallel creates independent layers per colour." />
                </span>
                <Select
                  value={String(options.layering)}
                  onValueChange={(v) => updateOption("layering", Number(v))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Sequential</SelectItem>
                    <SelectItem value="1">Parallel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="rounded-xl border bg-card p-4 space-y-4">
              <OptionSlider
                label="Line control point ratio"
                tip="Adjusts control points on straight line segments. 0 = default placement."
                value={options.lcpr}
                onChange={(v) => updateOption("lcpr", v)}
                min={0}
                max={1}
                step={0.01}
                displayValue={options.lcpr.toFixed(2)}
              />
              <OptionSlider
                label="Quad control point ratio"
                tip="Adjusts control points on quadratic curves. 0 = default placement."
                value={options.qcpr}
                onChange={(v) => updateOption("qcpr", v)}
                min={0}
                max={1}
                step={0.01}
                displayValue={options.qcpr.toFixed(2)}
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
