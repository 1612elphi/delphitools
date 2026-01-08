"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getColourName } from "@/lib/colour-names";
import {
  DndContext,
  useDraggable,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  Download,
  Copy,
  Check,
  Plus,
  Trash2,
  GripVertical,
  Droplets,
} from "lucide-react";

// Types
type GradientMode = "linear" | "corners" | "mesh";

interface ColourStop {
  id: string;
  colour: string;
  position: number;
}

interface CornerColours {
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
}

interface MeshPoint {
  id: string;
  x: number;
  y: number;
  colour: string;
}

interface MeshConfig {
  gridSize: 2 | 3;
  points: MeshPoint[];
}

type CornerKey = keyof CornerColours;

// Utility functions
function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function hexToRgb(hex: string): [number, number, number] | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  return [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16),
  ];
}

function lerpColor(
  c1: [number, number, number],
  c2: [number, number, number],
  t: number
): [number, number, number] {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ];
}

function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((c) => c / 255);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const clamped = Math.max(0, Math.min(255, Math.round(n)));
    return clamped.toString(16).padStart(2, "0");
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// OKLab colour space conversions for perceptually uniform blending
// This produces vibrant intermediate colours like real pigments
function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, v)) * 255);
}

function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}

function oklabToRgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return [linearToSrgb(lr), linearToSrgb(lg), linearToSrgb(lb)];
}

function lerpOklab(
  hex1: string,
  hex2: string,
  t: number
): string {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  if (!rgb1 || !rgb2) return hex1;

  const lab1 = rgbToOklab(rgb1[0], rgb1[1], rgb1[2]);
  const lab2 = rgbToOklab(rgb2[0], rgb2[1], rgb2[2]);

  const L = lab1[0] + (lab2[0] - lab1[0]) * t;
  const a = lab1[1] + (lab2[1] - lab1[1]) * t;
  const b = lab1[2] + (lab2[2] - lab1[2]) * t;

  const [r, g, bl] = oklabToRgb(L, a, b);
  return rgbToHex(r, g, bl);
}

function generateInitialMeshPoints(gridSize: 2 | 3): MeshPoint[] {
  const points: MeshPoint[] = [];
  const colours =
    gridSize === 2
      ? ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b"]
      : [
          "#3b82f6",
          "#8b5cf6",
          "#ec4899",
          "#10b981",
          "#6366f1",
          "#f59e0b",
          "#06b6d4",
          "#84cc16",
          "#ef4444",
        ];

  let idx = 0;
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      points.push({
        id: generateId(),
        x: x / (gridSize - 1),
        y: y / (gridSize - 1),
        colour: colours[idx % colours.length],
      });
      idx++;
    }
  }
  return points;
}

// Corner positions for overlay dots (inset for tooltip visibility)
const CORNER_POSITIONS: { key: CornerKey; x: string; y: string }[] = [
  { key: "topLeft", x: "12%", y: "15%" },
  { key: "topRight", x: "88%", y: "15%" },
  { key: "bottomLeft", x: "12%", y: "85%" },
  { key: "bottomRight", x: "88%", y: "85%" },
];

// Interactive colour dot component (non-draggable, for corners)
function ColourDot({
  colour,
  x,
  y,
  onColourChange,
  isHovered,
  onHover,
  onLeave,
}: {
  colour: string;
  x: string;
  y: string;
  onColourChange: (colour: string) => void;
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const colourName = getColourName(colour);
  const isLight = getLuminance(colour) > 0.5;

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 group"
      style={{ left: x, top: y }}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      {/* Tooltip */}
      <div
        className={`
          absolute left-1/2 -translate-x-1/2 bottom-full mb-2
          px-2 py-1 rounded-md text-xs whitespace-nowrap
          pointer-events-none z-20
          transition-all duration-200
          ${isHovered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"}
        `}
        style={{
          backgroundColor: colour,
          color: isLight ? "#000" : "#fff",
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        }}
      >
        <div className="font-medium">{colourName}</div>
        <div className="font-mono opacity-80">{colour.toUpperCase()}</div>
      </div>

      {/* Dot */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`
          w-6 h-6 rounded-full border-2 border-white cursor-pointer
          transition-all duration-200 ease-out
          hover:scale-125 hover:shadow-lg
          ${isHovered ? "scale-125 shadow-lg" : "shadow-md"}
        `}
        style={{
          backgroundColor: colour,
          boxShadow: isHovered
            ? `0 0 0 3px ${colour}40, 0 4px 12px rgba(0,0,0,0.3)`
            : "0 2px 6px rgba(0,0,0,0.3)",
        }}
      />

      {/* Hidden colour input */}
      <input
        ref={inputRef}
        type="color"
        value={colour}
        onChange={(e) => onColourChange(e.target.value)}
        className="sr-only"
      />
    </div>
  );
}

// Draggable mesh dot component
function DraggableMeshDot({
  id,
  colour,
  x,
  y,
  index,
  onColourChange,
  isHovered,
  onHover,
  onLeave,
  isDragging,
}: {
  id: string;
  colour: string;
  x: string;
  y: string;
  index: number;
  onColourChange: (colour: string) => void;
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
  isDragging: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const colourName = getColourName(colour);
  const isLight = getLuminance(colour) > 0.5;

  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id,
  });

  const style = transform
    ? {
        left: x,
        top: y,
        transform: `translate(calc(-50% + ${transform.x}px), calc(-50% + ${transform.y}px))`,
      }
    : {
        left: x,
        top: y,
      };

  return (
    <div
      ref={setNodeRef}
      className={`absolute group ${isDragging ? "z-50" : "z-10"}`}
      style={style}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      {/* Tooltip */}
      <div
        className={`
          absolute left-1/2 -translate-x-1/2 bottom-full mb-2
          px-2 py-1 rounded-md text-xs whitespace-nowrap
          pointer-events-none z-20
          transition-all duration-200
          ${isHovered && !isDragging ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"}
        `}
        style={{
          backgroundColor: colour,
          color: isLight ? "#000" : "#fff",
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        }}
      >
        <div className="font-medium">{colourName}</div>
        <div className="font-mono opacity-80">{colour.toUpperCase()}</div>
      </div>

      {/* Draggable dot with number */}
      <button
        type="button"
        {...listeners}
        {...attributes}
        onClick={() => inputRef.current?.click()}
        className={`
          -translate-x-1/2 -translate-y-1/2
          w-7 h-7 rounded-full border-2 border-white
          cursor-grab active:cursor-grabbing
          transition-all duration-200 ease-out flex items-center justify-center
          hover:scale-110
          ${isDragging ? "scale-125 shadow-xl" : "shadow-md"}
          ${isHovered && !isDragging ? "scale-110 shadow-lg" : ""}
        `}
        style={{
          backgroundColor: colour,
          boxShadow: isDragging
            ? `0 0 0 4px ${colour}40, 0 8px 24px rgba(0,0,0,0.4)`
            : isHovered
              ? `0 0 0 3px ${colour}40, 0 4px 12px rgba(0,0,0,0.3)`
              : "0 2px 6px rgba(0,0,0,0.3)",
        }}
      >
        {/* Number label */}
        <span
          className={`
            text-xs font-bold pointer-events-none
            ${isLight ? "text-black/70" : "text-white/90"}
          `}
        >
          {index + 1}
        </span>
      </button>

      {/* Hidden colour input */}
      <input
        ref={inputRef}
        type="color"
        value={colour}
        onChange={(e) => onColourChange(e.target.value)}
        className="sr-only"
      />
    </div>
  );
}

// Sortable colour stop item for linear gradient
function SortableColourStop({
  stop,
  index,
  onUpdate,
  onRemove,
  canRemove,
}: {
  stop: ColourStop;
  index: number;
  onUpdate: (updates: Partial<ColourStop>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stop.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
      >
        <GripVertical className="size-4" />
      </button>
      <input
        type="color"
        value={stop.colour}
        onChange={(e) => onUpdate({ colour: e.target.value })}
        className="w-10 h-10 rounded-lg cursor-pointer border-0"
      />
      <Input
        value={stop.colour}
        onChange={(e) => onUpdate({ colour: e.target.value })}
        className="w-28 font-mono text-sm"
      />
      <div className="flex items-center gap-1">
        <Input
          type="number"
          value={stop.position}
          onChange={(e) =>
            onUpdate({
              position: Math.max(0, Math.min(100, Number(e.target.value))),
            })
          }
          className="w-20"
          min={0}
          max={100}
        />
        <span className="text-muted-foreground">%</span>
      </div>
      <Button
        size="icon"
        variant="ghost"
        onClick={onRemove}
        disabled={!canRemove}
        className="ml-auto"
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

// Sortable mesh point item
function SortableMeshPoint({
  point,
  index,
  onColourChange,
  isHovered,
  onHover,
  onLeave,
}: {
  point: MeshPoint;
  index: number;
  onColourChange: (colour: string) => void;
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: point.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
        isHovered ? "bg-muted/50 border-primary/50" : "bg-muted/30"
      }`}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
      >
        <GripVertical className="size-4" />
      </button>

      {/* Number badge */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 border-white shrink-0"
        style={{
          backgroundColor: point.colour,
          color: getLuminance(point.colour) > 0.5 ? "#000" : "#fff",
        }}
      >
        {index + 1}
      </div>

      {/* Colour picker */}
      <input
        type="color"
        value={point.colour}
        onChange={(e) => onColourChange(e.target.value)}
        className="w-10 h-10 rounded-lg cursor-pointer border-0 shrink-0"
      />

      {/* Colour info */}
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-sm font-medium truncate">
          {getColourName(point.colour)}
        </span>
        <span className="text-xs font-mono text-muted-foreground">
          {point.colour}
        </span>
      </div>

      {/* Position */}
      <div className="text-xs text-muted-foreground whitespace-nowrap">
        ({Math.round(point.x * 100)}%, {Math.round(point.y * 100)}%)
      </div>
    </div>
  );
}

export function GradientGennyTool() {
  // State
  const [mode, setMode] = useState<GradientMode>("linear");
  const [angle, setAngle] = useState(90);
  const [colourStops, setColourStops] = useState<ColourStop[]>([
    { id: generateId(), colour: "#3b82f6", position: 0 },
    { id: generateId(), colour: "#8b5cf6", position: 100 },
  ]);
  const [corners, setCorners] = useState<CornerColours>({
    topLeft: "#3b82f6",
    topRight: "#8b5cf6",
    bottomLeft: "#10b981",
    bottomRight: "#f59e0b",
  });
  const [meshConfig, setMeshConfig] = useState<MeshConfig>({
    gridSize: 2,
    points: generateInitialMeshPoints(2),
  });
  const [copied, setCopied] = useState<string | null>(null);
  const [exportWidth, setExportWidth] = useState(800);
  const [exportHeight, setExportHeight] = useState(600);
  const [hoveredCorner, setHoveredCorner] = useState<CornerKey | null>(null);
  const [hoveredMeshPoint, setHoveredMeshPoint] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [noise, setNoise] = useState(0);

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const meshContainerRef = useRef<HTMLDivElement>(null);

  // DnD sensors - require a small movement before starting drag
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  // Colour stop management
  const addColourStop = useCallback(() => {
    const sortedStops = [...colourStops].sort((a, b) => a.position - b.position);
    let maxGap = 0;
    let insertPosition = 50;

    for (let i = 0; i < sortedStops.length - 1; i++) {
      const gap = sortedStops[i + 1].position - sortedStops[i].position;
      if (gap > maxGap) {
        maxGap = gap;
        insertPosition = sortedStops[i].position + gap / 2;
      }
    }

    const randomColour = `#${Math.floor(Math.random() * 16777215)
      .toString(16)
      .padStart(6, "0")}`;

    setColourStops((prev) => [
      ...prev,
      {
        id: generateId(),
        colour: randomColour,
        position: Math.round(insertPosition),
      },
    ]);
  }, [colourStops]);

  const removeColourStop = useCallback((id: string) => {
    setColourStops((prev) => {
      if (prev.length <= 2) return prev;
      return prev.filter((stop) => stop.id !== id);
    });
  }, []);

  const updateColourStop = useCallback(
    (id: string, updates: Partial<ColourStop>) => {
      setColourStops((prev) =>
        prev.map((stop) => (stop.id === id ? { ...stop, ...updates } : stop))
      );
    },
    []
  );

  // Handle colour stop reordering via drag and drop
  const handleColourStopDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setColourStops((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }, []);

  // Pigment blend - insert intermediate stops using OKLab interpolation
  const pigmentBlend = useCallback((stepsPerGap: number = 3) => {
    const sortedStops = [...colourStops].sort((a, b) => a.position - b.position);
    const newStops: ColourStop[] = [];

    for (let i = 0; i < sortedStops.length; i++) {
      newStops.push(sortedStops[i]);

      if (i < sortedStops.length - 1) {
        const current = sortedStops[i];
        const next = sortedStops[i + 1];
        const posGap = next.position - current.position;

        for (let step = 1; step <= stepsPerGap; step++) {
          const t = step / (stepsPerGap + 1);
          const blendedColour = lerpOklab(current.colour, next.colour, t);
          const position = current.position + posGap * t;

          newStops.push({
            id: generateId(),
            colour: blendedColour,
            position: Math.round(position),
          });
        }
      }
    }

    setColourStops(newStops);
  }, [colourStops]);

  // Mesh grid size change
  const setMeshGridSize = useCallback((size: 2 | 3) => {
    setMeshConfig({
      gridSize: size,
      points: generateInitialMeshPoints(size),
    });
  }, []);

  const updateMeshPointColour = useCallback((id: string, colour: string) => {
    setMeshConfig((prev) => ({
      ...prev,
      points: prev.points.map((p) => (p.id === id ? { ...p, colour } : p)),
    }));
  }, []);

  const updateMeshPointPosition = useCallback(
    (id: string, x: number, y: number) => {
      setMeshConfig((prev) => ({
        ...prev,
        points: prev.points.map((p) => (p.id === id ? { ...p, x, y } : p)),
      }));
    },
    []
  );

  // Handle mesh point reordering via drag and drop
  const handleMeshPointDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setMeshConfig((prev) => {
        const oldIndex = prev.points.findIndex((p) => p.id === active.id);
        const newIndex = prev.points.findIndex((p) => p.id === over.id);
        return {
          ...prev,
          points: arrayMove(prev.points, oldIndex, newIndex),
        };
      });
    }
  }, []);

  // Handle drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, delta } = event;
      setDraggingId(null);

      if (!meshContainerRef.current) return;

      const container = meshContainerRef.current;
      const rect = container.getBoundingClientRect();

      // Find the point being dragged
      const point = meshConfig.points.find((p) => p.id === active.id);
      if (!point) return;

      // Calculate display position in pixels
      const displayX = (12 + point.x * 76) / 100;
      const displayY = (15 + point.y * 70) / 100;

      // Current pixel position
      const currentPxX = displayX * rect.width;
      const currentPxY = displayY * rect.height;

      // New pixel position after drag
      const newPxX = currentPxX + delta.x;
      const newPxY = currentPxY + delta.y;

      // Convert back to display percentage (12-88% range)
      const newDisplayX = (newPxX / rect.width) * 100;
      const newDisplayY = (newPxY / rect.height) * 100;

      // Convert display percentage to normalized 0-1 (reverse the inset)
      const newX = Math.max(0, Math.min(1, (newDisplayX - 12) / 76));
      const newY = Math.max(0, Math.min(1, (newDisplayY - 15) / 70));

      updateMeshPointPosition(active.id as string, newX, newY);
    },
    [meshConfig.points, updateMeshPointPosition]
  );

  const handleDragStart = useCallback((event: { active: { id: string | number } }) => {
    setDraggingId(event.active.id as string);
  }, []);

  // CSS generation
  const generateCSS = useCallback((): string => {
    switch (mode) {
      case "linear": {
        const sortedStops = [...colourStops].sort(
          (a, b) => a.position - b.position
        );
        const stopsStr = sortedStops
          .map((stop) => `${stop.colour} ${stop.position}%`)
          .join(", ");
        return `linear-gradient(${angle}deg, ${stopsStr})`;
      }
      case "corners": {
        return `background:
  radial-gradient(ellipse at top left, ${corners.topLeft}, transparent 70%),
  radial-gradient(ellipse at top right, ${corners.topRight}, transparent 70%),
  radial-gradient(ellipse at bottom left, ${corners.bottomLeft}, transparent 70%),
  radial-gradient(ellipse at bottom right, ${corners.bottomRight}, transparent 70%);`;
      }
      case "mesh": {
        return `/* Mesh gradients cannot be perfectly replicated in CSS.
   Use image export for accurate results.
   Below is a rough approximation: */
background: ${meshConfig.points.map((p) => `radial-gradient(circle at ${Math.round(p.x * 100)}% ${Math.round(p.y * 100)}%, ${p.colour}, transparent 60%)`).join(",\n  ")};`;
      }
      default:
        return "";
    }
  }, [mode, colourStops, angle, corners, meshConfig]);

  // Canvas rendering
  const renderLinearGradient = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const angleRad = ((angle - 90) * Math.PI) / 180;
      const diagonal = Math.sqrt(width * width + height * height);

      const x1 = width / 2 - (Math.cos(angleRad) * diagonal) / 2;
      const y1 = height / 2 - (Math.sin(angleRad) * diagonal) / 2;
      const x2 = width / 2 + (Math.cos(angleRad) * diagonal) / 2;
      const y2 = height / 2 + (Math.sin(angleRad) * diagonal) / 2;

      const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
      const sortedStops = [...colourStops].sort(
        (a, b) => a.position - b.position
      );
      sortedStops.forEach((stop) => {
        gradient.addColorStop(stop.position / 100, stop.colour);
      });

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    },
    [angle, colourStops]
  );

  const renderCornersGradient = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const imageData = ctx.createImageData(width, height);
      const tl = hexToRgb(corners.topLeft);
      const tr = hexToRgb(corners.topRight);
      const bl = hexToRgb(corners.bottomLeft);
      const br = hexToRgb(corners.bottomRight);

      if (!tl || !tr || !bl || !br) return;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const u = x / (width - 1);
          const v = y / (height - 1);

          const top = lerpColor(tl, tr, u);
          const bottom = lerpColor(bl, br, u);
          const pixel = lerpColor(top, bottom, v);

          const idx = (y * width + x) * 4;
          imageData.data[idx] = pixel[0];
          imageData.data[idx + 1] = pixel[1];
          imageData.data[idx + 2] = pixel[2];
          imageData.data[idx + 3] = 255;
        }
      }
      ctx.putImageData(imageData, 0, 0);
    },
    [corners]
  );

  const renderMeshGradient = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const imageData = ctx.createImageData(width, height);
      const colours = meshConfig.points.map((p) => ({
        ...p,
        rgb: hexToRgb(p.colour),
      }));

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const u = x / (width - 1);
          const v = y / (height - 1);

          let totalWeight = 0;
          let r = 0,
            g = 0,
            b = 0;

          colours.forEach((point) => {
            if (!point.rgb) return;
            const dx = u - point.x;
            const dy = v - point.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const weight = 1 / (Math.pow(dist, 2) + 0.01);
            totalWeight += weight;
            r += point.rgb[0] * weight;
            g += point.rgb[1] * weight;
            b += point.rgb[2] * weight;
          });

          const idx = (y * width + x) * 4;
          imageData.data[idx] = Math.round(r / totalWeight);
          imageData.data[idx + 1] = Math.round(g / totalWeight);
          imageData.data[idx + 2] = Math.round(b / totalWeight);
          imageData.data[idx + 3] = 255;
        }
      }
      ctx.putImageData(imageData, 0, 0);
    },
    [meshConfig]
  );

  // Apply noise overlay to canvas
  const applyNoise = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      if (noise === 0) return;

      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      const intensity = noise / 100;

      for (let i = 0; i < data.length; i += 4) {
        const noiseValue = (Math.random() - 0.5) * 2 * intensity * 50;
        data[i] = Math.max(0, Math.min(255, data[i] + noiseValue));
        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noiseValue));
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noiseValue));
      }

      ctx.putImageData(imageData, 0, 0);
    },
    [noise]
  );

  const renderToCanvas = useCallback(
    (canvas: HTMLCanvasElement, width: number, height: number) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = width;
      canvas.height = height;

      switch (mode) {
        case "linear":
          renderLinearGradient(ctx, width, height);
          break;
        case "corners":
          renderCornersGradient(ctx, width, height);
          break;
        case "mesh":
          renderMeshGradient(ctx, width, height);
          break;
      }

      // Apply noise after rendering gradient
      applyNoise(ctx, width, height);
    },
    [mode, renderLinearGradient, renderCornersGradient, renderMeshGradient, applyNoise]
  );

  // Update preview canvas
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (canvas) {
      renderToCanvas(canvas, 400, 300);
    }
  }, [renderToCanvas]);

  // Export functions
  const downloadImage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    renderToCanvas(canvas, exportWidth, exportHeight);

    const link = document.createElement("a");
    link.download = `gradient-${mode}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, [mode, exportWidth, exportHeight, renderToCanvas]);

  const copyCSS = useCallback(async () => {
    const css = generateCSS();
    await navigator.clipboard.writeText(css);
    setCopied("css");
    setTimeout(() => setCopied(null), 1500);
  }, [generateCSS]);

  return (
    <div className="space-y-8">
      {/* Mode Selector */}
      <Tabs
        value={mode}
        onValueChange={(v) => setMode(v as GradientMode)}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="linear">Linear</TabsTrigger>
          <TabsTrigger value="corners">Corners</TabsTrigger>
          <TabsTrigger value="mesh">Mesh</TabsTrigger>
        </TabsList>

        {/* Preview with interactive dots */}
        <div className="mt-6 rounded-lg border overflow-hidden relative">
          <canvas
            ref={previewCanvasRef}
            className="w-full h-[300px] object-cover"
            style={{ display: "block" }}
          />

          {/* Corner dots overlay */}
          {mode === "corners" && (
            <div className="absolute inset-3 pointer-events-none">
              <div className="relative w-full h-full pointer-events-auto">
                {CORNER_POSITIONS.map(({ key, x, y }) => (
                  <ColourDot
                    key={key}
                    colour={corners[key]}
                    x={x}
                    y={y}
                    onColourChange={(colour) =>
                      setCorners((prev) => ({ ...prev, [key]: colour }))
                    }
                    isHovered={hoveredCorner === key}
                    onHover={() => setHoveredCorner(key)}
                    onLeave={() => setHoveredCorner(null)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Mesh dots overlay with drag support */}
          {mode === "mesh" && (
            <DndContext
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div
                ref={meshContainerRef}
                className="absolute inset-3 pointer-events-none"
              >
                <div className="relative w-full h-full pointer-events-auto">
                  {meshConfig.points.map((point, index) => {
                    const displayX = 12 + point.x * 76;
                    const displayY = 15 + point.y * 70;
                    return (
                      <DraggableMeshDot
                        key={point.id}
                        id={point.id}
                        colour={point.colour}
                        x={`${displayX}%`}
                        y={`${displayY}%`}
                        index={index}
                        onColourChange={(colour) =>
                          updateMeshPointColour(point.id, colour)
                        }
                        isHovered={hoveredMeshPoint === point.id}
                        onHover={() => setHoveredMeshPoint(point.id)}
                        onLeave={() => setHoveredMeshPoint(null)}
                        isDragging={draggingId === point.id}
                      />
                    );
                  })}
                </div>
              </div>
            </DndContext>
          )}

          {/* Hint text for corners/mesh modes */}
          {mode === "corners" && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-white/70 bg-black/30 px-2 py-1 rounded-full backdrop-blur-sm">
              Click dots to change colours
            </div>
          )}
          {mode === "mesh" && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-white/70 bg-black/30 px-2 py-1 rounded-full backdrop-blur-sm">
              Drag dots to reposition, click to change colour
            </div>
          )}
        </div>

        {/* Linear Controls */}
        <TabsContent value="linear" className="space-y-6 mt-6">
          <div className="space-y-6">
            {/* Colour Stops */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Colour Stops</Label>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => pigmentBlend(3)}
                    title="Add intermediate colours using OKLab blending for vibrant, paint-like transitions"
                  >
                    <Droplets className="size-4 mr-1" />
                    Pigment Blend
                  </Button>
                  <Button size="sm" variant="outline" onClick={addColourStop}>
                    <Plus className="size-4 mr-1" />
                    Add Stop
                  </Button>
                </div>
              </div>

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleColourStopDragEnd}
                modifiers={[restrictToVerticalAxis]}
              >
                <SortableContext
                  items={colourStops.map((s) => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {colourStops.map((stop, index) => (
                      <SortableColourStop
                        key={stop.id}
                        stop={stop}
                        index={index}
                        onUpdate={(updates) => updateColourStop(stop.id, updates)}
                        onRemove={() => removeColourStop(stop.id)}
                        canRemove={colourStops.length > 2}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>

            {/* Angle Control */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Angle</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={angle}
                    onChange={(e) => setAngle(Math.max(0, Math.min(360, Number(e.target.value))))}
                    className="w-20 text-center"
                    min={0}
                    max={360}
                  />
                  <span className="text-sm text-muted-foreground">deg</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* Visual angle dial */}
                <div
                  className="relative w-12 h-12 rounded-full border-2 border-muted bg-muted/30 shrink-0"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left - rect.width / 2;
                    const y = e.clientY - rect.top - rect.height / 2;
                    const newAngle = Math.round((Math.atan2(y, x) * 180 / Math.PI + 90 + 360) % 360);
                    setAngle(newAngle);
                  }}
                  style={{ cursor: "crosshair" }}
                >
                  <div
                    className="absolute top-1/2 left-1/2 w-1 h-5 bg-primary rounded-full origin-bottom"
                    style={{
                      transform: `translate(-50%, -100%) rotate(${angle}deg)`,
                    }}
                  />
                  <div className="absolute top-1/2 left-1/2 w-2 h-2 bg-primary rounded-full -translate-x-1/2 -translate-y-1/2" />
                </div>
                {/* Slider */}
                <Slider
                  value={[angle]}
                  onValueChange={([v]) => setAngle(v)}
                  min={0}
                  max={360}
                  step={1}
                  className="flex-1"
                />
              </div>
              {/* Quick angle presets */}
              <div className="flex gap-1 flex-wrap">
                {[0, 45, 90, 135, 180, 225, 270, 315].map((preset) => (
                  <Button
                    key={preset}
                    size="sm"
                    variant={angle === preset ? "default" : "outline"}
                    onClick={() => setAngle(preset)}
                    className="h-7 px-2 text-xs"
                  >
                    {preset}°
                  </Button>
                ))}
              </div>
            </div>

            {/* Noise Control */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Noise</Label>
                <span className="text-sm text-muted-foreground">{noise}%</span>
              </div>
              <Slider
                value={[noise]}
                onValueChange={([v]) => setNoise(v)}
                min={0}
                max={100}
                step={1}
              />
              <p className="text-xs text-muted-foreground">
                Adds grain texture to reduce banding. Only applies to image export, not CSS.
              </p>
            </div>
          </div>
        </TabsContent>

        {/* Corners Controls */}
        <TabsContent value="corners" className="mt-6">
          <div className="grid grid-cols-2 gap-4">
            {(
              [
                ["topLeft", "Top Left"],
                ["topRight", "Top Right"],
                ["bottomLeft", "Bottom Left"],
                ["bottomRight", "Bottom Right"],
              ] as const
            ).map(([key, label]) => (
              <div
                key={key}
                className={`space-y-2 p-3 rounded-lg border transition-colors ${
                  hoveredCorner === key ? "bg-muted/50 border-primary/50" : ""
                }`}
                onMouseEnter={() => setHoveredCorner(key)}
                onMouseLeave={() => setHoveredCorner(null)}
              >
                <div className="flex items-center justify-between">
                  <Label>{label}</Label>
                  <span className="text-xs text-muted-foreground">
                    {getColourName(corners[key])}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={corners[key]}
                    onChange={(e) =>
                      setCorners((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    className="w-12 h-12 rounded-lg cursor-pointer border-0"
                  />
                  <Input
                    value={corners[key]}
                    onChange={(e) =>
                      setCorners((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Noise Control */}
          <div className="space-y-3 mt-6">
            <div className="flex items-center justify-between">
              <Label>Noise</Label>
              <span className="text-sm text-muted-foreground">{noise}%</span>
            </div>
            <Slider
              value={[noise]}
              onValueChange={([v]) => setNoise(v)}
              min={0}
              max={100}
              step={1}
            />
            <p className="text-xs text-muted-foreground">
              Adds grain texture to reduce banding in smooth gradients
            </p>
          </div>
        </TabsContent>

        {/* Mesh Controls */}
        <TabsContent value="mesh" className="space-y-6 mt-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Grid Size</Label>
              <div className="flex gap-2">
                <Button
                  variant={meshConfig.gridSize === 2 ? "default" : "outline"}
                  onClick={() => setMeshGridSize(2)}
                >
                  2x2
                </Button>
                <Button
                  variant={meshConfig.gridSize === 3 ? "default" : "outline"}
                  onClick={() => setMeshGridSize(3)}
                >
                  3x3
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Control Points (drag on preview or reorder below)</Label>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleMeshPointDragEnd}
                modifiers={[restrictToVerticalAxis]}
              >
                <SortableContext
                  items={meshConfig.points.map((p) => p.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {meshConfig.points.map((point, index) => (
                      <SortableMeshPoint
                        key={point.id}
                        point={point}
                        index={index}
                        onColourChange={(colour) =>
                          updateMeshPointColour(point.id, colour)
                        }
                        isHovered={hoveredMeshPoint === point.id}
                        onHover={() => setHoveredMeshPoint(point.id)}
                        onLeave={() => setHoveredMeshPoint(null)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>

            {/* Noise Control */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Noise</Label>
                <span className="text-sm text-muted-foreground">{noise}%</span>
              </div>
              <Slider
                value={[noise]}
                onValueChange={([v]) => setNoise(v)}
                min={0}
                max={100}
                step={1}
              />
              <p className="text-xs text-muted-foreground">
                Adds grain texture to reduce banding. Only applies to image export, not CSS.
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Export Panel */}
      <div className="border-t pt-6">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Image Export */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Image Export</Label>
              <Button onClick={downloadImage} size="sm">
                <Download className="size-4 mr-2" />
                Download PNG
              </Button>
            </div>

            <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="number"
                  value={exportWidth}
                  onChange={(e) => setExportWidth(Number(e.target.value))}
                  className="w-20 h-8 text-sm"
                  min={100}
                  max={8192}
                />
                <span className="text-muted-foreground text-sm">×</span>
                <Input
                  type="number"
                  value={exportHeight}
                  onChange={(e) => setExportHeight(Number(e.target.value))}
                  className="w-20 h-8 text-sm"
                  min={100}
                  max={8192}
                />
                <span className="text-muted-foreground text-sm">px</span>
              </div>

              <div className="flex flex-wrap gap-1">
                {[
                  { label: "512", w: 512, h: 512 },
                  { label: "1K", w: 1024, h: 1024 },
                  { label: "2K", w: 2048, h: 2048 },
                  { label: "4K", w: 4096, h: 4096 },
                  { label: "HD", w: 1920, h: 1080 },
                  { label: "4K HD", w: 3840, h: 2160 },
                  { label: "Insta", w: 1080, h: 1080 },
                  { label: "Story", w: 1080, h: 1920 },
                ].map((preset) => (
                  <Button
                    key={preset.label}
                    size="sm"
                    variant={
                      exportWidth === preset.w && exportHeight === preset.h
                        ? "default"
                        : "outline"
                    }
                    onClick={() => {
                      setExportWidth(preset.w);
                      setExportHeight(preset.h);
                    }}
                    className="h-7 px-2 text-xs"
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>

              {noise > 0 && (
                <p className="text-xs text-muted-foreground">
                  {noise}% noise will be applied to the exported image
                </p>
              )}
            </div>
          </div>

          {/* CSS Export */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">CSS</Label>
              <Button variant="outline" onClick={copyCSS} size="sm">
                {copied === "css" ? (
                  <Check className="size-4 mr-2" />
                ) : (
                  <Copy className="size-4 mr-2" />
                )}
                {copied === "css" ? "Copied!" : "Copy CSS"}
              </Button>
            </div>

            <pre className="p-4 rounded-lg border bg-muted/30 text-sm font-mono overflow-x-auto whitespace-pre-wrap min-h-[120px]">
              {generateCSS()}
            </pre>

            {mode === "mesh" && (
              <p className="text-xs text-muted-foreground">
                Mesh gradients can&apos;t be perfectly replicated in CSS. Use image export for accurate results.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Hidden canvas for export */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
