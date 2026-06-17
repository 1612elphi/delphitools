"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Upload, Trash2, Palette, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useColourNotation } from "@/hooks/use-colour-notation";
import { formatColour } from "@/lib/colour-notation";
import { useFilePaste } from "@/hooks/use-file-paste";

// Colour blindness simulation matrices
// Based on research by Machado, Oliveira and Fernandes (2009)
type SimulationType =
  | "normal"
  | "protanopia"
  | "deuteranopia"
  | "tritanopia"
  | "protanomaly"
  | "deuteranomaly"
  | "tritanomaly"
  | "achromatopsia"
  | "achromatomaly";

interface SimulationInfo {
  name: string;
  description: string;
  severity: "none" | "partial" | "full";
  prevalence: string;
}

const SIMULATIONS: Record<SimulationType, SimulationInfo> = {
  normal: {
    name: "Normal Vision",
    description: "No colour vision deficiency",
    severity: "none",
    prevalence: "~92% of population",
  },
  protanopia: {
    name: "Protanopia",
    description: "Red-blind, cannot perceive red light",
    severity: "full",
    prevalence: "~1% of AMAB",
  },
  deuteranopia: {
    name: "Deuteranopia",
    description: "Green-blind, cannot perceive green light",
    severity: "full",
    prevalence: "~1% of AMAB",
  },
  tritanopia: {
    name: "Tritanopia",
    description: "Blue-blind, cannot perceive blue light",
    severity: "full",
    prevalence: "~0.003% of population",
  },
  protanomaly: {
    name: "Protanomaly",
    description: "Red-weak, reduced sensitivity to red",
    severity: "partial",
    prevalence: "~1% of AMAB",
  },
  deuteranomaly: {
    name: "Deuteranomaly",
    description: "Green-weak, reduced sensitivity to green",
    severity: "partial",
    prevalence: "~5% of AMAB",
  },
  tritanomaly: {
    name: "Tritanomaly",
    description: "Blue-weak, reduced sensitivity to blue",
    severity: "partial",
    prevalence: "~0.01% of population",
  },
  achromatopsia: {
    name: "Achromatopsia",
    description: "Total colour blindness, sees only grayscale",
    severity: "full",
    prevalence: "~0.003% of population",
  },
  achromatomaly: {
    name: "Achromatomaly",
    description: "Partial colour blindness, reduced colour perception",
    severity: "partial",
    prevalence: "Very rare",
  },
};

// Transformation matrices for each type
const MATRICES: Record<SimulationType, number[][]> = {
  normal: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  protanopia: [
    [0.567, 0.433, 0],
    [0.558, 0.442, 0],
    [0, 0.242, 0.758],
  ],
  deuteranopia: [
    [0.625, 0.375, 0],
    [0.7, 0.3, 0],
    [0, 0.3, 0.7],
  ],
  tritanopia: [
    [0.95, 0.05, 0],
    [0, 0.433, 0.567],
    [0, 0.475, 0.525],
  ],
  protanomaly: [
    [0.817, 0.183, 0],
    [0.333, 0.667, 0],
    [0, 0.125, 0.875],
  ],
  deuteranomaly: [
    [0.8, 0.2, 0],
    [0.258, 0.742, 0],
    [0, 0.142, 0.858],
  ],
  tritanomaly: [
    [0.967, 0.033, 0],
    [0, 0.733, 0.267],
    [0, 0.183, 0.817],
  ],
  achromatopsia: [
    [0.299, 0.587, 0.114],
    [0.299, 0.587, 0.114],
    [0.299, 0.587, 0.114],
  ],
  achromatomaly: [
    [0.618, 0.320, 0.062],
    [0.163, 0.775, 0.062],
    [0.163, 0.320, 0.516],
  ],
};

function hexToRgb(hex: string): [number, number, number] | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
}

function simulateColorBlindness(r: number, g: number, b: number, type: SimulationType): [number, number, number] {
  const matrix = MATRICES[type];
  return [
    Math.round(matrix[0][0] * r + matrix[0][1] * g + matrix[0][2] * b),
    Math.round(matrix[1][0] * r + matrix[1][1] * g + matrix[1][2] * b),
    Math.round(matrix[2][0] * r + matrix[2][1] * g + matrix[2][2] * b),
  ];
}

function simulateHex(hex: string, type: SimulationType): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const simulated = simulateColorBlindness(...rgb, type);
  return rgbToHex(...simulated);
}

type Mode = "colour" | "image";

export function ColorblindSimTool() {
  const [mode, setMode] = useState<Mode>("colour");
  const [colour, setColour] = useState("#e63946");
  const [selectedSim, setSelectedSim] = useState<SimulationType>("normal");
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [simulatedImage, setSimulatedImage] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { notation } = useColourNotation();

  const isValidHex = (hex: string) => /^#[0-9A-Fa-f]{6}$/.test(hex);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      readFile(file);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      readFile(file);
    }
  };

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setSourceImage(e.target?.result as string);
      setSimulatedImage(null);
    };
    reader.readAsDataURL(file);
  };

  useFilePaste(readFile, "image/*");

  const clearImage = () => {
    setSourceImage(null);
    setSimulatedImage(null);
  };

  // Process image when simulation type changes
  useEffect(() => {
    if (mode !== "image" || !sourceImage) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      if (selectedSim === "normal") {
        setSimulatedImage(sourceImage);
        return;
      }

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const [r, g, b] = simulateColorBlindness(data[i], data[i + 1], data[i + 2], selectedSim);
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
      }

      ctx.putImageData(imageData, 0, 0);
      setSimulatedImage(canvas.toDataURL("image/png"));
    };
    img.src = sourceImage;
    return () => {
      cancelled = true;
    };
  }, [sourceImage, selectedSim, mode]);

  const simulationTypes = Object.keys(SIMULATIONS) as SimulationType[];

  return (
    <div className="space-y-6">
      <canvas ref={canvasRef} className="hidden" />

      <div className="border-2 border-border">
        {/* Mode Toggle */}
        <div className="border-b-2 border-border">
          <div className="segmented grid-cols-2 -mx-0 border-x-0 border-t-0 border-b-0">
            <Button
              variant={mode === "colour" ? "default" : "outline"}
              onClick={() => setMode("colour")}
              className="h-12 font-bold"
            >
              <Palette className="size-4 mr-2" />
              Colour Mode
            </Button>
            <Button
              variant={mode === "image" ? "default" : "outline"}
              onClick={() => setMode("image")}
              className="h-12 font-bold"
            >
              <ImageIcon className="size-4 mr-2" />
              Image Mode
            </Button>
          </div>
        </div>

        {/* Colour Mode */}
        {mode === "colour" && (
          <>
            {/* Colour Input */}
            <div className="border-b-2 border-border p-4">
              <label className="font-bold block mb-3">Select Colour</label>
              {/* Colour swatch + hex input as a flush table row */}
              <div className="flex items-stretch border border-border -mx-4 border-x-0">
                <div className="relative w-16 shrink-0">
                  <div
                    className="size-full"
                    style={{ backgroundColor: isValidHex(colour) ? colour : "#000000" }}
                    aria-hidden
                  />
                  <input
                    type="color"
                    value={isValidHex(colour) ? colour : "#000000"}
                    onChange={(e) => setColour(e.target.value)}
                    className="absolute inset-0 size-full cursor-pointer opacity-0"
                  />
                </div>
                <Input
                  value={colour}
                  onChange={(e) => setColour(e.target.value)}
                  placeholder="#e63946"
                  className="flex-1 border-0 border-l border-border bg-transparent"
                  style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                />
              </div>
            </div>

            {/* Simulation Grid — 3-col table of all 9 types */}
            <div className="border-b-2 border-border">
              <div className="p-4 pb-0">
                <label className="font-bold block mb-3">Vision Types</label>
              </div>
              {/* 3-column grid, 3 rows = 9 cells, full-bleed */}
              <div className="grid grid-cols-3 border-t border-border -mx-0">
                {simulationTypes.map((type, i) => {
                  const info = SIMULATIONS[type];
                  const simHex = simulateHex(colour, type);
                  const isSelected = selectedSim === type;
                  const isLastRow = i >= 6; // last 3 items

                  return (
                    <button
                      key={type}
                      onClick={() => setSelectedSim(type)}
                      className={cn(
                        "flex flex-col gap-2 p-3 text-left transition-colors border-b border-border border-l first:border-l-0",
                        i % 3 === 0 && "border-l-0",
                        isLastRow && "border-b-0",
                        isSelected ? "bg-muted" : "hover:bg-muted/50"
                      )}
                    >
                      {/* Swatch row */}
                      <div className="flex items-center gap-2">
                        <div
                          className="size-8 shrink-0 border border-border"
                          style={{ backgroundColor: simHex }}
                        />
                        <div className="min-w-0">
                          <div className={cn("text-xs font-bold truncate", isSelected && "text-primary")}>{info.name}</div>
                          <div
                            className="text-xs text-muted-foreground"
                            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                          >
                            {formatColour(simHex, notation)}
                          </div>
                        </div>
                      </div>
                      {/* Severity badge */}
                      <div className={cn(
                        "self-start text-xs px-1.5 py-0.5 border",
                        info.severity === "none" && "border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400",
                        info.severity === "partial" && "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
                        info.severity === "full" && "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400"
                      )}>
                        {info.severity === "none" ? "Normal" : info.severity === "partial" ? "Partial" : "Full"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Comparison — flush two-column preview */}
            <div className="p-4 pb-0">
              <label className="font-bold block mb-3">Comparison</label>
            </div>
            <div className="grid grid-cols-2 border-t border-border">
              <div className="border-r border-border">
                <p className="text-xs text-muted-foreground text-center p-2 border-b border-border">Original</p>
                <div
                  className="h-24"
                  style={{ backgroundColor: colour }}
                />
                <p
                  className="text-xs text-center p-2 border-t border-border text-muted-foreground"
                  style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                >
                  {colour}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground text-center p-2 border-b border-border truncate px-3">{SIMULATIONS[selectedSim].name}</p>
                <div
                  className="h-24"
                  style={{ backgroundColor: simulateHex(colour, selectedSim) }}
                />
                <p
                  className="text-xs text-center p-2 border-t border-border text-muted-foreground"
                  style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                >
                  {simulateHex(colour, selectedSim)}
                </p>
              </div>
            </div>
            {/* Selected sim description */}
            <div className="border-t border-border p-4">
              <div className="font-bold text-sm">{SIMULATIONS[selectedSim].name}</div>
              <div className="text-sm text-muted-foreground mt-0.5">
                {SIMULATIONS[selectedSim].description} — {SIMULATIONS[selectedSim].prevalence}
              </div>
            </div>
          </>
        )}

        {/* Image Mode */}
        {mode === "image" && (
          <>
            {/* Drop Zone */}
            {!sourceImage && (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="border-2 border-dashed m-4 p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => document.getElementById("colorblind-input")?.click()}
              >
                <input
                  id="colorblind-input"
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Upload className="size-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium">Drop image here</p>
                <p className="text-sm text-muted-foreground mt-1">
                  or click to select, or paste
                </p>
              </div>
            )}

            {/* Image loaded — simulation type selector + preview */}
            {sourceImage && (
              <>
                {/* Header bar with Clear */}
                <div className="flex min-h-14 items-stretch border-b-2 border-border">
                  <h3 className="flex flex-1 items-center px-4 font-bold">Simulation Preview</h3>
                  <Button
                    variant="ghost"
                    onClick={clearImage}
                    className="h-auto gap-2 self-stretch rounded-none border-l border-border px-5"
                  >
                    <Trash2 className="size-4" />
                    Clear
                  </Button>
                </div>

                {/* Simulation Type Segmented — 3 cols × 3 rows = 9 */}
                <div className="border-b-2 border-border">
                  <div className="p-4 pb-3">
                    <label className="font-bold block">Vision Type</label>
                  </div>
                  <div className="segmented grid-cols-3 -mx-0 border-x-0 border-b-0">
                    {simulationTypes.map((type) => {
                      const info = SIMULATIONS[type];
                      const isSelected = selectedSim === type;
                      return (
                        <Button
                          key={type}
                          variant={isSelected ? "default" : "outline"}
                          onClick={() => setSelectedSim(type)}
                          className="text-xs font-medium py-2 h-auto"
                        >
                          {info.name}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                {/* Current Simulation Info */}
                <div className="p-4 border-b border-border bg-muted/30">
                  <div className="font-bold">{SIMULATIONS[selectedSim].name}</div>
                  <div className="text-sm text-muted-foreground">
                    {SIMULATIONS[selectedSim].description} — {SIMULATIONS[selectedSim].prevalence}
                  </div>
                </div>

                {/* Side by Side Images — flush 2-col grid */}
                <div className="grid grid-cols-2">
                  <div className="border-r border-border">
                    <p className="text-xs text-muted-foreground text-center p-2 border-b border-border">Original</p>
                    <div className="overflow-hidden bg-muted/30">
                      <img
                        src={sourceImage}
                        alt="Original"
                        className="w-full h-auto"
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground text-center p-2 border-b border-border truncate px-3">{SIMULATIONS[selectedSim].name}</p>
                    <div className="overflow-hidden bg-muted/30">
                      {simulatedImage ? (
                        <img
                          src={simulatedImage}
                          alt={`Simulated ${SIMULATIONS[selectedSim].name}`}
                          className="w-full h-auto"
                        />
                      ) : (
                        <div className="aspect-video flex items-center justify-center">
                          <span className="text-muted-foreground text-sm">Processing...</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Info */}
      <div className="border border-border p-4 bg-card">
        <div className="font-bold mb-2">About Colour Blindness</div>
        <div className="text-sm text-muted-foreground space-y-2">
          <p>
            Colour blindness affects approximately 8% of AMAB and 0.5% of AFAB people worldwide.
            The most common types are red-green deficiencies (protanopia/deuteranopia).
          </p>
          <p>
            When designing, ensure sufficient contrast and don&apos;t rely solely on colour
            to convey information. Use patterns, labels, or icons as additional indicators.
          </p>
        </div>
      </div>
    </div>
  );
}
