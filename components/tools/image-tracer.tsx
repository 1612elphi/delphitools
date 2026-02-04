"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Upload, Download, Copy, Check, Trash2, Loader2, ChevronDown, RefreshCw, ArrowRight } from "lucide-react"
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

const PRESET_NAMES = [
  "default",
  "posterized1",
  "posterized2",
  "posterized3",
  "curvy",
  "sharp",
  "detailed",
  "smoothed",
  "grayscale",
  "fixedpalette",
  "randomsampling1",
  "randomsampling2",
  "artistic1",
  "artistic2",
  "artistic3",
  "artistic4",
] as const

const PRESET_LABELS: Record<string, string> = {
  default: "Default",
  posterized1: "Posterised 1",
  posterized2: "Posterised 2",
  posterized3: "Posterised 3",
  curvy: "Curvy",
  sharp: "Sharp",
  detailed: "Detailed",
  smoothed: "Smoothed",
  grayscale: "Greyscale",
  fixedpalette: "Fixed Palette",
  randomsampling1: "Random Sampling 1",
  randomsampling2: "Random Sampling 2",
  artistic1: "Artistic 1",
  artistic2: "Artistic 2",
  artistic3: "Artistic 3",
  artistic4: "Artistic 4",
}

function OptionSlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  displayValue,
}: {
  label: string
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
        <Label className="text-sm">{label}</Label>
        <span className="text-sm font-mono text-muted-foreground">
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

export function ImageTracerTool() {
  const router = useRouter()
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [svgString, setSvgString] = useState<string | null>(null)
  const [tracing, setTracing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [options, setOptions] = useState<TracerOptions>({ ...DEFAULT_OPTIONS })
  const [preset, setPreset] = useState<string>("default")
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [dirty, setDirty] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageDataRef = useRef<ImageData | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const tracerRef = useRef<typeof import("imagetracerjs").default | null>(null)

  // Lazily load imagetracerjs (it uses `window` so must run client-side)
  const getTracer = useCallback(async () => {
    if (tracerRef.current) return tracerRef.current
    const mod = await import("imagetracerjs")
    tracerRef.current = mod.default
    return mod.default
  }, [])

  // Extract ImageData from a loaded image
  const extractImageData = useCallback((file: File): Promise<ImageData> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = canvasRef.current
        if (!canvas) {
          reject(new Error("Canvas not available"))
          return
        }
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext("2d")
        if (!ctx) {
          reject(new Error("Canvas 2D context unavailable"))
          return
        }
        ctx.drawImage(img, 0, 0)
        const imgData = ctx.getImageData(0, 0, img.width, img.height)
        resolve(imgData)
      }
      img.onerror = () => reject(new Error("Failed to load image"))
      img.src = URL.createObjectURL(file)
    })
  }, [])

  // Run the trace
  const runTrace = useCallback(async (imgd: ImageData, opts: TracerOptions) => {
    setTracing(true)
    try {
      const ImageTracer = await getTracer()
      // imagedataToSVG is synchronous, but we wrap in a microtask
      // to let React paint the spinner first
      await new Promise(resolve => setTimeout(resolve, 10))
      const svg = ImageTracer.imagedataToSVG(imgd, { ...opts })
      setSvgString(svg)
    } catch (err) {
      console.error("Tracing failed:", err)
    } finally {
      setTracing(false)
    }
  }, [getTracer])

  // When image loads, extract data and trace
  useEffect(() => {
    if (!imageFile) return
    let cancelled = false

    extractImageData(imageFile).then((imgd) => {
      if (cancelled) return
      imageDataRef.current = imgd
      runTrace(imgd, options)
    })

    return () => { cancelled = true }
    // Only re-run when the image file changes, not when options change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageFile, extractImageData, runTrace])

  // Manual retrace when user clicks the Retrace button
  const handleRetrace = useCallback(() => {
    if (!imageDataRef.current) return
    setDirty(false)
    runTrace(imageDataRef.current, options)
  }, [options, runTrace])

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return
    setSvgString(null)
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
      const ImageTracer = await getTracer()
      const presetOpts = ImageTracer.optionpresets[name]
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
  }, [getTracer])

  const updateOption = useCallback(<K extends keyof TracerOptions>(key: K, value: TracerOptions[K]) => {
    setPreset("custom")
    setDirty(true)
    setOptions(prev => ({ ...prev, [key]: value }))
  }, [])

  const handleDownload = useCallback(() => {
    if (!svgString || !imageFile) return
    const blob = new Blob([svgString], { type: "image/svg+xml" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    const baseName = imageFile.name.replace(/\.[^.]+$/, "")
    a.download = `${baseName}-traced.svg`
    a.href = url
    a.click()
    URL.revokeObjectURL(url)
  }, [svgString, imageFile])

  const handleCopy = useCallback(async () => {
    if (!svgString) return
    try {
      await navigator.clipboard.writeText(svgString)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error("Copy failed:", err)
    }
  }, [svgString])

  const handleClear = useCallback(() => {
    setImageFile(null)
    setImageSrc(null)
    setSvgString(null)
    setTracing(false)
    imageDataRef.current = null
    setOptions({ ...DEFAULT_OPTIONS })
    setPreset("default")
    setCopied(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }, [])

  const sendToOptimiser = () => {
    if (!svgString) return
    sessionStorage.setItem("svg-optimiser-input", svgString)
    router.push("/tools/svg-optimiser")
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // No image loaded: show drop zone
  if (!imageFile) {
    return (
      <div className="space-y-4">
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
          onDragLeave={() => setIsDragOver(false)}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
            isDragOver
              ? "border-primary bg-primary/5"
              : "hover:border-primary/50"
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

  // Image loaded: show two-pane layout
  return (
    <div className="space-y-4">
      {/* Hidden canvas for ImageData extraction */}
      <canvas ref={canvasRef} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Two-pane layout */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Controls panel — on mobile appears below preview via order */}
        <div className="w-full lg:w-80 shrink-0 order-2 lg:order-1 space-y-6">
          {/* Image info */}
          <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
            {imageSrc && (
              <div className="size-10 rounded bg-muted overflow-hidden shrink-0">
                <img src={imageSrc} alt="" className="size-full object-cover" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{imageFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatSize(imageFile.size)}
              </p>
            </div>
          </div>

          {/* Preset selector */}
          <div className="space-y-2">
            <Label>Preset</Label>
            <Select value={preset} onValueChange={applyPreset}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a preset" />
              </SelectTrigger>
              <SelectContent>
                {PRESET_NAMES.map((name) => (
                  <SelectItem key={name} value={name}>
                    {PRESET_LABELS[name]}
                  </SelectItem>
                ))}
                {preset === "custom" && (
                  <SelectItem value="custom">Custom</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Retrace button */}
          {imageDataRef.current && (
            <Button
              onClick={handleRetrace}
              disabled={!dirty || tracing}
              className="w-full"
            >
              {tracing ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Tracing&hellip;
                </>
              ) : (
                <>
                  <RefreshCw className="size-4 mr-2" />
                  Retrace
                </>
              )}
            </Button>
          )}

          {/* Core sliders */}
          <div className="space-y-4">
            <OptionSlider
              label="Number of colours"
              value={options.numberofcolors}
              onChange={(v) => updateOption("numberofcolors", v)}
              min={2}
              max={64}
              step={1}
            />
            <OptionSlider
              label="Colour quantisation cycles"
              value={options.colorquantcycles}
              onChange={(v) => updateOption("colorquantcycles", v)}
              min={1}
              max={20}
              step={1}
            />
            <OptionSlider
              label="Path smoothing (ltres)"
              value={options.ltres}
              onChange={(v) => updateOption("ltres", v)}
              min={0.1}
              max={10}
              step={0.1}
              displayValue={options.ltres.toFixed(1)}
            />
            <OptionSlider
              label="Curve smoothing (qtres)"
              value={options.qtres}
              onChange={(v) => updateOption("qtres", v)}
              min={0.1}
              max={10}
              step={0.1}
              displayValue={options.qtres.toFixed(1)}
            />
            <OptionSlider
              label="Min path size (pathomit)"
              value={options.pathomit}
              onChange={(v) => updateOption("pathomit", v)}
              min={0}
              max={200}
              step={1}
            />
            <OptionSlider
              label="Stroke width"
              value={options.strokewidth}
              onChange={(v) => updateOption("strokewidth", v)}
              min={0}
              max={10}
              step={0.1}
              displayValue={options.strokewidth.toFixed(1)}
            />
            <OptionSlider
              label="Scale"
              value={options.scale}
              onChange={(v) => updateOption("scale", v)}
              min={0.5}
              max={10}
              step={0.1}
              displayValue={options.scale.toFixed(1)}
            />
          </div>

          {/* Advanced section */}
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between px-0 hover:bg-transparent">
                <span className="text-sm font-medium">Advanced options</span>
                <ChevronDown
                  className={`size-4 transition-transform ${
                    advancedOpen ? "rotate-180" : ""
                  }`}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-2">
              <OptionSlider
                label="Blur radius"
                value={options.blurradius}
                onChange={(v) => updateOption("blurradius", v)}
                min={0}
                max={20}
                step={1}
              />
              <OptionSlider
                label="Blur delta"
                value={options.blurdelta}
                onChange={(v) => updateOption("blurdelta", v)}
                min={0}
                max={256}
                step={1}
              />
              <div className="space-y-2">
                <Label className="text-sm">Colour sampling</Label>
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
              <OptionSlider
                label="Min colour ratio"
                value={options.mincolorratio}
                onChange={(v) => updateOption("mincolorratio", v)}
                min={0}
                max={1}
                step={0.01}
                displayValue={options.mincolorratio.toFixed(2)}
              />
              <OptionSlider
                label="Coordinate rounding"
                value={options.roundcoords}
                onChange={(v) => updateOption("roundcoords", v)}
                min={0}
                max={5}
                step={1}
              />
              <OptionSlider
                label="Line control point ratio"
                value={options.lcpr}
                onChange={(v) => updateOption("lcpr", v)}
                min={0}
                max={1}
                step={0.01}
                displayValue={options.lcpr.toFixed(2)}
              />
              <OptionSlider
                label="Quad control point ratio"
                value={options.qcpr}
                onChange={(v) => updateOption("qcpr", v)}
                min={0}
                max={1}
                step={0.01}
                displayValue={options.qcpr.toFixed(2)}
              />
              <div className="space-y-2">
                <Label className="text-sm">Layering mode</Label>
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
            </CollapsibleContent>
          </Collapsible>

          {/* Action buttons */}
          <div className="space-y-2 pt-2">
            <div className="flex gap-2">
              <Button
                onClick={handleDownload}
                disabled={!svgString || tracing}
                className="flex-1"
              >
                <Download className="size-4 mr-2" />
                Download SVG
              </Button>
              <Button
                variant="outline"
                onClick={handleCopy}
                disabled={!svgString || tracing}
                className="flex-1"
              >
                {copied ? (
                  <>
                    <Check className="size-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="size-4 mr-2" />
                    Copy SVG
                  </>
                )}
              </Button>
            </div>
            <Button
              variant="outline"
              onClick={sendToOptimiser}
              disabled={!svgString || tracing}
              className="w-full"
            >
              <ArrowRight className="size-4 mr-2" />
              Send to SVG Optimiser
            </Button>
            <Button
              variant="ghost"
              onClick={handleClear}
              className="w-full text-muted-foreground"
            >
              <Trash2 className="size-4 mr-2" />
              Clear
            </Button>
          </div>

          {/* SVG size info */}
          {svgString && !tracing && (
            <p className="text-xs text-muted-foreground text-center">
              SVG output: {formatSize(new Blob([svgString]).size)}
            </p>
          )}
        </div>

        {/* Preview pane */}
        <div className="flex-1 order-1 lg:order-2 min-w-0">
          <div className="rounded-xl border bg-card overflow-hidden">
            {tracing ? (
              <div className="flex flex-col items-center justify-center p-12 min-h-[300px]">
                <Loader2 className="size-8 animate-spin text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">Tracing image&hellip;</p>
              </div>
            ) : svgString ? (
              <div
                className="w-full [&>svg]:max-w-full [&>svg]:h-auto [&>svg]:block [&>svg]:mx-auto"
                dangerouslySetInnerHTML={{ __html: svgString }}
              />
            ) : imageSrc ? (
              <img
                src={imageSrc}
                alt="Source"
                className="w-full h-auto block"
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
