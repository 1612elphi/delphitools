"use client";

import { useState, useMemo } from "react";
import { Search, Copy, Check, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface CheatSheetItem {
  class: string;
  css: string;
  example?: string;
}

interface CheatSheetCategory {
  name: string;
  items: CheatSheetItem[];
}

const CHEATSHEET: CheatSheetCategory[] = [
  {
    name: "Breakpoints",
    items: [
      { class: "sm:", css: "@media (min-width: 640px)", example: "sm:flex" },
      { class: "md:", css: "@media (min-width: 768px)", example: "md:grid-cols-2" },
      { class: "lg:", css: "@media (min-width: 1024px)", example: "lg:px-8" },
      { class: "xl:", css: "@media (min-width: 1280px)", example: "xl:max-w-6xl" },
      { class: "2xl:", css: "@media (min-width: 1536px)", example: "2xl:text-lg" },
    ],
  },
  {
    name: "Display",
    items: [
      { class: "block", css: "display: block" },
      { class: "inline-block", css: "display: inline-block" },
      { class: "inline", css: "display: inline" },
      { class: "flex", css: "display: flex" },
      { class: "inline-flex", css: "display: inline-flex" },
      { class: "grid", css: "display: grid" },
      { class: "inline-grid", css: "display: inline-grid" },
      { class: "hidden", css: "display: none" },
      { class: "contents", css: "display: contents" },
    ],
  },
  {
    name: "Position",
    items: [
      { class: "static", css: "position: static" },
      { class: "fixed", css: "position: fixed" },
      { class: "absolute", css: "position: absolute" },
      { class: "relative", css: "position: relative" },
      { class: "sticky", css: "position: sticky" },
      { class: "inset-0", css: "inset: 0" },
      { class: "inset-x-0", css: "left: 0; right: 0" },
      { class: "inset-y-0", css: "top: 0; bottom: 0" },
      { class: "top-0", css: "top: 0" },
      { class: "right-0", css: "right: 0" },
      { class: "bottom-0", css: "bottom: 0" },
      { class: "left-0", css: "left: 0" },
    ],
  },
  {
    name: "Flexbox",
    items: [
      { class: "flex-row", css: "flex-direction: row" },
      { class: "flex-col", css: "flex-direction: column" },
      { class: "flex-wrap", css: "flex-wrap: wrap" },
      { class: "flex-nowrap", css: "flex-wrap: nowrap" },
      { class: "flex-1", css: "flex: 1 1 0%" },
      { class: "flex-auto", css: "flex: 1 1 auto" },
      { class: "flex-none", css: "flex: none" },
      { class: "grow", css: "flex-grow: 1" },
      { class: "grow-0", css: "flex-grow: 0" },
      { class: "shrink", css: "flex-shrink: 1" },
      { class: "shrink-0", css: "flex-shrink: 0" },
    ],
  },
  {
    name: "Grid",
    items: [
      { class: "grid-cols-1", css: "grid-template-columns: repeat(1, minmax(0, 1fr))" },
      { class: "grid-cols-2", css: "grid-template-columns: repeat(2, minmax(0, 1fr))" },
      { class: "grid-cols-3", css: "grid-template-columns: repeat(3, minmax(0, 1fr))" },
      { class: "grid-cols-4", css: "grid-template-columns: repeat(4, minmax(0, 1fr))" },
      { class: "grid-cols-12", css: "grid-template-columns: repeat(12, minmax(0, 1fr))" },
      { class: "col-span-1", css: "grid-column: span 1 / span 1" },
      { class: "col-span-2", css: "grid-column: span 2 / span 2" },
      { class: "col-span-full", css: "grid-column: 1 / -1" },
      { class: "grid-rows-1", css: "grid-template-rows: repeat(1, minmax(0, 1fr))" },
      { class: "grid-rows-2", css: "grid-template-rows: repeat(2, minmax(0, 1fr))" },
    ],
  },
  {
    name: "Alignment",
    items: [
      { class: "justify-start", css: "justify-content: flex-start" },
      { class: "justify-center", css: "justify-content: center" },
      { class: "justify-end", css: "justify-content: flex-end" },
      { class: "justify-between", css: "justify-content: space-between" },
      { class: "justify-around", css: "justify-content: space-around" },
      { class: "justify-evenly", css: "justify-content: space-evenly" },
      { class: "items-start", css: "align-items: flex-start" },
      { class: "items-center", css: "align-items: center" },
      { class: "items-end", css: "align-items: flex-end" },
      { class: "items-baseline", css: "align-items: baseline" },
      { class: "items-stretch", css: "align-items: stretch" },
      { class: "self-auto", css: "align-self: auto" },
      { class: "self-start", css: "align-self: flex-start" },
      { class: "self-center", css: "align-self: center" },
      { class: "self-end", css: "align-self: flex-end" },
    ],
  },
  {
    name: "Spacing",
    items: [
      { class: "p-0", css: "padding: 0" },
      { class: "p-1", css: "padding: 0.25rem (4px)" },
      { class: "p-2", css: "padding: 0.5rem (8px)" },
      { class: "p-4", css: "padding: 1rem (16px)" },
      { class: "p-6", css: "padding: 1.5rem (24px)" },
      { class: "p-8", css: "padding: 2rem (32px)" },
      { class: "px-*", css: "padding-left & padding-right" },
      { class: "py-*", css: "padding-top & padding-bottom" },
      { class: "pt/pr/pb/pl-*", css: "padding-[side]" },
      { class: "m-0", css: "margin: 0" },
      { class: "m-1", css: "margin: 0.25rem (4px)" },
      { class: "m-2", css: "margin: 0.5rem (8px)" },
      { class: "m-4", css: "margin: 1rem (16px)" },
      { class: "m-auto", css: "margin: auto" },
      { class: "-m-1", css: "margin: -0.25rem" },
      { class: "mx-auto", css: "margin-left: auto; margin-right: auto" },
      { class: "gap-0", css: "gap: 0" },
      { class: "gap-1", css: "gap: 0.25rem (4px)" },
      { class: "gap-2", css: "gap: 0.5rem (8px)" },
      { class: "gap-4", css: "gap: 1rem (16px)" },
      { class: "gap-x-*", css: "column-gap" },
      { class: "gap-y-*", css: "row-gap" },
    ],
  },
  {
    name: "Sizing",
    items: [
      { class: "w-0", css: "width: 0" },
      { class: "w-1", css: "width: 0.25rem (4px)" },
      { class: "w-4", css: "width: 1rem (16px)" },
      { class: "w-full", css: "width: 100%" },
      { class: "w-screen", css: "width: 100vw" },
      { class: "w-auto", css: "width: auto" },
      { class: "w-1/2", css: "width: 50%" },
      { class: "w-1/3", css: "width: 33.333%" },
      { class: "w-fit", css: "width: fit-content" },
      { class: "min-w-0", css: "min-width: 0" },
      { class: "min-w-full", css: "min-width: 100%" },
      { class: "max-w-sm", css: "max-width: 24rem (384px)" },
      { class: "max-w-md", css: "max-width: 28rem (448px)" },
      { class: "max-w-lg", css: "max-width: 32rem (512px)" },
      { class: "max-w-xl", css: "max-width: 36rem (576px)" },
      { class: "max-w-2xl", css: "max-width: 42rem (672px)" },
      { class: "max-w-full", css: "max-width: 100%" },
      { class: "max-w-screen-sm", css: "max-width: 640px" },
      { class: "max-w-screen-md", css: "max-width: 768px" },
      { class: "max-w-screen-lg", css: "max-width: 1024px" },
      { class: "h-0", css: "height: 0" },
      { class: "h-4", css: "height: 1rem (16px)" },
      { class: "h-full", css: "height: 100%" },
      { class: "h-screen", css: "height: 100vh" },
      { class: "h-auto", css: "height: auto" },
      { class: "min-h-0", css: "min-height: 0" },
      { class: "min-h-full", css: "min-height: 100%" },
      { class: "min-h-screen", css: "min-height: 100vh" },
      { class: "size-4", css: "width: 1rem; height: 1rem" },
      { class: "size-6", css: "width: 1.5rem; height: 1.5rem" },
      { class: "size-full", css: "width: 100%; height: 100%" },
    ],
  },
  {
    name: "Typography",
    items: [
      { class: "text-xs", css: "font-size: 0.75rem (12px)" },
      { class: "text-sm", css: "font-size: 0.875rem (14px)" },
      { class: "text-base", css: "font-size: 1rem (16px)" },
      { class: "text-lg", css: "font-size: 1.125rem (18px)" },
      { class: "text-xl", css: "font-size: 1.25rem (20px)" },
      { class: "text-2xl", css: "font-size: 1.5rem (24px)" },
      { class: "text-3xl", css: "font-size: 1.875rem (30px)" },
      { class: "text-4xl", css: "font-size: 2.25rem (36px)" },
      { class: "font-thin", css: "font-weight: 100" },
      { class: "font-light", css: "font-weight: 300" },
      { class: "font-normal", css: "font-weight: 400" },
      { class: "font-medium", css: "font-weight: 500" },
      { class: "font-semibold", css: "font-weight: 600" },
      { class: "font-bold", css: "font-weight: 700" },
      { class: "font-sans", css: "font-family: ui-sans-serif, system-ui, sans-serif" },
      { class: "font-serif", css: "font-family: ui-serif, Georgia, serif" },
      { class: "font-mono", css: "font-family: ui-monospace, monospace" },
      { class: "italic", css: "font-style: italic" },
      { class: "not-italic", css: "font-style: normal" },
      { class: "leading-none", css: "line-height: 1" },
      { class: "leading-tight", css: "line-height: 1.25" },
      { class: "leading-normal", css: "line-height: 1.5" },
      { class: "leading-relaxed", css: "line-height: 1.625" },
      { class: "leading-loose", css: "line-height: 2" },
      { class: "tracking-tight", css: "letter-spacing: -0.025em" },
      { class: "tracking-normal", css: "letter-spacing: 0" },
      { class: "tracking-wide", css: "letter-spacing: 0.025em" },
    ],
  },
  {
    name: "Text",
    items: [
      { class: "text-left", css: "text-align: left" },
      { class: "text-center", css: "text-align: center" },
      { class: "text-right", css: "text-align: right" },
      { class: "text-justify", css: "text-align: justify" },
      { class: "uppercase", css: "text-transform: uppercase" },
      { class: "lowercase", css: "text-transform: lowercase" },
      { class: "capitalize", css: "text-transform: capitalize" },
      { class: "normal-case", css: "text-transform: none" },
      { class: "underline", css: "text-decoration: underline" },
      { class: "line-through", css: "text-decoration: line-through" },
      { class: "no-underline", css: "text-decoration: none" },
      { class: "truncate", css: "overflow: hidden; text-overflow: ellipsis; white-space: nowrap" },
      { class: "text-ellipsis", css: "text-overflow: ellipsis" },
      { class: "text-clip", css: "text-overflow: clip" },
      { class: "whitespace-normal", css: "white-space: normal" },
      { class: "whitespace-nowrap", css: "white-space: nowrap" },
      { class: "whitespace-pre", css: "white-space: pre" },
      { class: "break-normal", css: "word-break: normal" },
      { class: "break-words", css: "word-break: break-word" },
      { class: "break-all", css: "word-break: break-all" },
      { class: "line-clamp-1", css: "-webkit-line-clamp: 1" },
      { class: "line-clamp-2", css: "-webkit-line-clamp: 2" },
      { class: "line-clamp-3", css: "-webkit-line-clamp: 3" },
    ],
  },
  {
    name: "Backgrounds",
    items: [
      { class: "bg-transparent", css: "background-color: transparent" },
      { class: "bg-current", css: "background-color: currentColor" },
      { class: "bg-white", css: "background-color: #fff" },
      { class: "bg-black", css: "background-color: #000" },
      { class: "bg-slate-500", css: "background-color: #64748b" },
      { class: "bg-[#hex]", css: "background-color: #hex", example: "bg-[#1da1f2]" },
      { class: "bg-cover", css: "background-size: cover" },
      { class: "bg-contain", css: "background-size: contain" },
      { class: "bg-center", css: "background-position: center" },
      { class: "bg-no-repeat", css: "background-repeat: no-repeat" },
      { class: "bg-repeat", css: "background-repeat: repeat" },
      { class: "bg-fixed", css: "background-attachment: fixed" },
      { class: "bg-gradient-to-r", css: "background-image: linear-gradient(to right, ...)" },
      { class: "bg-gradient-to-b", css: "background-image: linear-gradient(to bottom, ...)" },
      { class: "from-blue-500", css: "gradient start color" },
      { class: "via-purple-500", css: "gradient middle color" },
      { class: "to-pink-500", css: "gradient end color" },
    ],
  },
  {
    name: "Borders",
    items: [
      { class: "border", css: "border-width: 1px" },
      { class: "border-0", css: "border-width: 0" },
      { class: "border-2", css: "border-width: 2px" },
      { class: "border-4", css: "border-width: 4px" },
      { class: "border-t", css: "border-top-width: 1px" },
      { class: "border-r", css: "border-right-width: 1px" },
      { class: "border-b", css: "border-bottom-width: 1px" },
      { class: "border-l", css: "border-left-width: 1px" },
      { class: "border-solid", css: "border-style: solid" },
      { class: "border-dashed", css: "border-style: dashed" },
      { class: "border-dotted", css: "border-style: dotted" },
      { class: "border-none", css: "border-style: none" },
      { class: "rounded", css: "border-radius: 0.25rem (4px)" },
      { class: "rounded-md", css: "border-radius: 0.375rem (6px)" },
      { class: "rounded-lg", css: "border-radius: 0.5rem (8px)" },
      { class: "rounded-xl", css: "border-radius: 0.75rem (12px)" },
      { class: "rounded-2xl", css: "border-radius: 1rem (16px)" },
      { class: "rounded-full", css: "border-radius: 9999px" },
      { class: "rounded-none", css: "border-radius: 0" },
      { class: "rounded-t-lg", css: "border-top-left/right-radius: 0.5rem" },
      { class: "divide-x", css: "border between horizontal children" },
      { class: "divide-y", css: "border between vertical children" },
    ],
  },
  {
    name: "Effects",
    items: [
      { class: "shadow-sm", css: "box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05)" },
      { class: "shadow", css: "box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1)" },
      { class: "shadow-md", css: "box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1)" },
      { class: "shadow-lg", css: "box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1)" },
      { class: "shadow-xl", css: "box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1)" },
      { class: "shadow-2xl", css: "box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25)" },
      { class: "shadow-inner", css: "box-shadow: inset 0 2px 4px 0 rgb(0 0 0 / 0.05)" },
      { class: "shadow-none", css: "box-shadow: none" },
      { class: "opacity-0", css: "opacity: 0" },
      { class: "opacity-50", css: "opacity: 0.5" },
      { class: "opacity-100", css: "opacity: 1" },
      { class: "blur", css: "filter: blur(8px)" },
      { class: "blur-sm", css: "filter: blur(4px)" },
      { class: "blur-lg", css: "filter: blur(16px)" },
      { class: "blur-none", css: "filter: blur(0)" },
      { class: "backdrop-blur", css: "backdrop-filter: blur(8px)" },
      { class: "backdrop-blur-sm", css: "backdrop-filter: blur(4px)" },
    ],
  },
  {
    name: "Transitions",
    items: [
      { class: "transition", css: "transition: all 150ms ease" },
      { class: "transition-none", css: "transition: none" },
      { class: "transition-colors", css: "transition: color, background-color, border-color" },
      { class: "transition-opacity", css: "transition: opacity 150ms" },
      { class: "transition-transform", css: "transition: transform 150ms" },
      { class: "duration-75", css: "transition-duration: 75ms" },
      { class: "duration-150", css: "transition-duration: 150ms" },
      { class: "duration-300", css: "transition-duration: 300ms" },
      { class: "duration-500", css: "transition-duration: 500ms" },
      { class: "ease-linear", css: "transition-timing-function: linear" },
      { class: "ease-in", css: "transition-timing-function: ease-in" },
      { class: "ease-out", css: "transition-timing-function: ease-out" },
      { class: "ease-in-out", css: "transition-timing-function: ease-in-out" },
      { class: "delay-150", css: "transition-delay: 150ms" },
      { class: "delay-300", css: "transition-delay: 300ms" },
      { class: "animate-spin", css: "animation: spin 1s linear infinite" },
      { class: "animate-ping", css: "animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite" },
      { class: "animate-pulse", css: "animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" },
      { class: "animate-bounce", css: "animation: bounce 1s infinite" },
    ],
  },
  {
    name: "Transforms",
    items: [
      { class: "scale-0", css: "transform: scale(0)" },
      { class: "scale-50", css: "transform: scale(0.5)" },
      { class: "scale-100", css: "transform: scale(1)" },
      { class: "scale-150", css: "transform: scale(1.5)" },
      { class: "rotate-0", css: "transform: rotate(0deg)" },
      { class: "rotate-45", css: "transform: rotate(45deg)" },
      { class: "rotate-90", css: "transform: rotate(90deg)" },
      { class: "rotate-180", css: "transform: rotate(180deg)" },
      { class: "-rotate-45", css: "transform: rotate(-45deg)" },
      { class: "translate-x-0", css: "transform: translateX(0)" },
      { class: "translate-x-4", css: "transform: translateX(1rem)" },
      { class: "translate-x-full", css: "transform: translateX(100%)" },
      { class: "-translate-x-4", css: "transform: translateX(-1rem)" },
      { class: "translate-y-4", css: "transform: translateY(1rem)" },
      { class: "skew-x-3", css: "transform: skewX(3deg)" },
      { class: "skew-y-3", css: "transform: skewY(3deg)" },
      { class: "origin-center", css: "transform-origin: center" },
      { class: "origin-top", css: "transform-origin: top" },
    ],
  },
  {
    name: "Interactivity",
    items: [
      { class: "cursor-pointer", css: "cursor: pointer" },
      { class: "cursor-default", css: "cursor: default" },
      { class: "cursor-not-allowed", css: "cursor: not-allowed" },
      { class: "cursor-wait", css: "cursor: wait" },
      { class: "cursor-grab", css: "cursor: grab" },
      { class: "pointer-events-none", css: "pointer-events: none" },
      { class: "pointer-events-auto", css: "pointer-events: auto" },
      { class: "select-none", css: "user-select: none" },
      { class: "select-text", css: "user-select: text" },
      { class: "select-all", css: "user-select: all" },
      { class: "resize", css: "resize: both" },
      { class: "resize-none", css: "resize: none" },
      { class: "resize-x", css: "resize: horizontal" },
      { class: "resize-y", css: "resize: vertical" },
      { class: "scroll-smooth", css: "scroll-behavior: smooth" },
      { class: "scroll-auto", css: "scroll-behavior: auto" },
    ],
  },
  {
    name: "States",
    items: [
      { class: "hover:", css: "on mouse hover", example: "hover:bg-blue-600" },
      { class: "focus:", css: "on focus", example: "focus:ring-2" },
      { class: "focus-visible:", css: "on keyboard focus", example: "focus-visible:outline-none" },
      { class: "active:", css: "on active/pressed", example: "active:bg-blue-700" },
      { class: "disabled:", css: "when disabled", example: "disabled:opacity-50" },
      { class: "first:", css: "first child", example: "first:mt-0" },
      { class: "last:", css: "last child", example: "last:mb-0" },
      { class: "odd:", css: "odd children", example: "odd:bg-gray-100" },
      { class: "even:", css: "even children", example: "even:bg-white" },
      { class: "group-hover:", css: "when parent .group is hovered", example: "group-hover:visible" },
      { class: "peer-focus:", css: "when sibling .peer is focused", example: "peer-focus:ring" },
      { class: "dark:", css: "dark mode", example: "dark:bg-gray-900" },
      { class: "motion-safe:", css: "if user allows motion", example: "motion-safe:animate-spin" },
      { class: "motion-reduce:", css: "if user prefers reduced motion", example: "motion-reduce:animate-none" },
    ],
  },
  {
    name: "Overflow & Z-Index",
    items: [
      { class: "overflow-auto", css: "overflow: auto" },
      { class: "overflow-hidden", css: "overflow: hidden" },
      { class: "overflow-visible", css: "overflow: visible" },
      { class: "overflow-scroll", css: "overflow: scroll" },
      { class: "overflow-x-auto", css: "overflow-x: auto" },
      { class: "overflow-y-auto", css: "overflow-y: auto" },
      { class: "overflow-x-hidden", css: "overflow-x: hidden" },
      { class: "overflow-y-hidden", css: "overflow-y: hidden" },
      { class: "z-0", css: "z-index: 0" },
      { class: "z-10", css: "z-index: 10" },
      { class: "z-20", css: "z-index: 20" },
      { class: "z-30", css: "z-index: 30" },
      { class: "z-40", css: "z-index: 40" },
      { class: "z-50", css: "z-index: 50" },
      { class: "z-auto", css: "z-index: auto" },
      { class: "-z-10", css: "z-index: -10" },
    ],
  },
];

const ALL_CATEGORIES = CHEATSHEET.map(c => c.name);

export function TailwindCheatsheetTool() {
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(ALL_CATEGORIES));
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filteredCategories = useMemo(() => {
    let cats = CHEATSHEET;

    if (activeCategory) {
      cats = cats.filter(c => c.name === activeCategory);
    }

    if (!search) return cats;

    const lower = search.toLowerCase();
    return cats.map(category => ({
      ...category,
      items: category.items.filter(
        item =>
          item.class.toLowerCase().includes(lower) ||
          item.css.toLowerCase().includes(lower) ||
          item.example?.toLowerCase().includes(lower)
      ),
    })).filter(category => category.items.length > 0);
  }, [search, activeCategory]);

  const copyClass = async (className: string) => {
    await navigator.clipboard.writeText(className);
    setCopied(className);
    setTimeout(() => setCopied(null), 1500);
  };

  const toggleCategory = (name: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const totalClasses = CHEATSHEET.reduce((sum, cat) => sum + cat.items.length, 0);

  const monoStyle = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };

  return (
    <div className="border-2 border-border">
      {/* Search row */}
      <div className="flex items-stretch border-b-2 border-border">
        <div className="flex items-center px-4 text-muted-foreground border-r border-border">
          <Search className="size-4" />
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${totalClasses} classes…`}
          className="flex-1 h-12 bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="px-4 text-sm text-muted-foreground hover:text-foreground border-l border-border transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Category filter — flush scrollable strip */}
      <div className="border-b-2 border-border flex items-stretch overflow-x-auto">
        <button
          onClick={() => setActiveCategory(null)}
          className={cn(
            "shrink-0 px-4 py-3 text-sm font-bold transition-colors border-r border-border",
            activeCategory === null
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          All
        </button>
        {ALL_CATEGORIES.map(name => (
          <button
            key={name}
            onClick={() => setActiveCategory(activeCategory === name ? null : name)}
            className={cn(
              "shrink-0 px-4 py-3 text-sm transition-colors border-r border-border last:border-r-0",
              activeCategory === name
                ? "bg-primary text-primary-foreground font-bold"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {name}
          </button>
        ))}
      </div>

      {/* Categories */}
      {filteredCategories.length === 0 ? (
        <div className="px-4 py-12 text-center text-muted-foreground text-sm">
          No classes found matching &ldquo;{search}&rdquo;
        </div>
      ) : (
        filteredCategories.map((category) => {
          const isExpanded = expandedCategories.has(category.name);

          return (
            <div key={category.name} className="border-b border-border last:border-b-0">
              {/* Category header */}
              <button
                onClick={() => toggleCategory(category.name)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
              >
                <span className="font-bold">{category.name}</span>
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{category.items.length} classes</span>
                  {isExpanded
                    ? <ChevronDown className="size-4" />
                    : <ChevronRight className="size-4" />
                  }
                </span>
              </button>

              {/* Rows table — bleeds to panel edges */}
              {isExpanded && (
                <div className="border-t border-border">
                  {/* Table header */}
                  <div className="flex items-stretch bg-muted/30 border-b border-border">
                    <div className="flex-1 px-4 py-2 text-xs font-bold text-muted-foreground uppercase tracking-wide">Class</div>
                    <div className="flex-1 px-4 py-2 text-xs font-bold text-muted-foreground uppercase tracking-wide border-l border-border">CSS</div>
                    <div className="w-12 border-l border-border" />
                  </div>
                  {/* Rows */}
                  {category.items.map((item) => (
                    <div
                      key={item.class}
                      className="flex items-stretch border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors"
                    >
                      {/* Class cell */}
                      <div className="flex-1 flex items-center px-4 py-2 min-w-0">
                        <code
                          className="text-sm text-primary"
                          style={monoStyle}
                        >
                          {item.class}
                        </code>
                        {item.example && (
                          <span className="text-xs text-muted-foreground ml-3 shrink-0">
                            e.g. <span style={monoStyle}>{item.example}</span>
                          </span>
                        )}
                      </div>
                      {/* CSS cell */}
                      <div className="flex-1 flex items-center px-4 py-2 border-l border-border min-w-0">
                        <span
                          className="text-xs text-muted-foreground truncate"
                          style={monoStyle}
                        >
                          {item.css}
                        </span>
                      </div>
                      {/* Copy action cell */}
                      <button
                        onClick={() => copyClass(item.class)}
                        title="Copy class"
                        className="flex w-12 items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground shrink-0"
                      >
                        {copied === item.class ? (
                          <Check className="size-4 text-primary" />
                        ) : (
                          <Copy className="size-4" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Tip footer */}
      <div className="px-4 py-3 border-t-2 border-border bg-muted/30 text-sm text-muted-foreground">
        <strong className="text-foreground">Tip:</strong> Use arbitrary values with square brackets:{" "}
        <code style={monoStyle} className="text-primary text-xs">w-[200px]</code>,{" "}
        <code style={monoStyle} className="text-primary text-xs">text-[#1da1f2]</code>,{" "}
        <code style={monoStyle} className="text-primary text-xs">grid-cols-[1fr_2fr]</code>
      </div>
    </div>
  );
}
