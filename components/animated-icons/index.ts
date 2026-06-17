import type { ForwardRefExoticComponent, HTMLAttributes, RefAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Clock,
  Contrast,
  Eye,
  FileText,
  GitCompare,
  Languages,
  Layers,
  LayoutGrid,
  RefreshCw,
  Sparkles,
  Stamp,
  Wind,
} from "lucide-react";

import { ClockIcon } from "./clock";
import { ContrastIcon } from "./contrast";
import { EyeIcon } from "./eye";
import { FileTextIcon } from "./file-text";
import { GitCompareIcon } from "./git-compare";
import { LanguagesIcon } from "./languages";
import { LayersIcon } from "./layers";
import { LayoutGridIcon } from "./layout-grid";
import { RefreshCWIcon } from "./refresh-cw";
import { SparklesIcon } from "./sparkles";
import { StampIcon } from "./stamp";
import { WindIcon } from "./wind";

/** Imperative handle every pqoqubbw animated icon exposes via forwardRef. */
export interface AnimatedIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

export interface AnimatedIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

export type AnimatedIcon = ForwardRefExoticComponent<
  AnimatedIconProps & RefAttributes<AnimatedIconHandle>
>;

/**
 * Maps a lucide-react icon component to its bespoke animated counterpart.
 * Tools whose icon isn't a key here fall back to the static lucide icon
 * (with a CSS "draw-in" on hover). Keyed by component identity, which is safe
 * because both this file and lib/tools.ts import from the same lucide-react.
 */
export const ANIMATED_ICONS = new Map<LucideIcon, AnimatedIcon>([
  [Clock, ClockIcon],
  [Contrast, ContrastIcon],
  [Eye, EyeIcon],
  [FileText, FileTextIcon],
  [GitCompare, GitCompareIcon],
  [Languages, LanguagesIcon],
  [Layers, LayersIcon],
  [LayoutGrid, LayoutGridIcon],
  [RefreshCw, RefreshCWIcon],
  [Sparkles, SparklesIcon],
  [Stamp, StampIcon],
  [Wind, WindIcon],
]);
