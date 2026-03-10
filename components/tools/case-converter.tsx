"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy, Trash2 } from "lucide-react";

type ConversionMode =
  | "camel"
  | "snake"
  | "kebab"
  | "pascal"
  | "constant"
  | "slug";

const MODE_LABELS: Record<ConversionMode, string> = {
  camel: "camelCase",
  snake: "snake_case",
  kebab: "kebab-case",
  pascal: "PascalCase",
  constant: "CONSTANT_CASE",
  slug: "slugify",
};

function splitIntoWords(input: string): string[] {
  const separated = input
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .replace(/[\s_\-.]+/g, " ")
    .trim();

  if (!separated) {
    return [];
  }

  return separated
    .split(" ")
    .map((word) => word.toLowerCase())
    .filter(Boolean);
}

function toSlug(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function slugifyFilename(value: string): string {
  const trimmed = value.trim();

  if (!trimmed.includes(".")) {
    return toSlug(trimmed);
  }

  const extensionMatch = trimmed.match(/\.([a-zA-Z0-9]{1,10})$/);

  if (!extensionMatch) {
    return toSlug(trimmed);
  }

  const extension = extensionMatch[1].toLowerCase();
  const baseName = trimmed.slice(0, -extensionMatch[0].length);
  const slugBase = toSlug(baseName);

  return slugBase ? `${slugBase}.${extension}` : `.${extension}`;
}

function convertCase(
  value: string,
  mode: ConversionMode,
  preserveFileExtension: boolean
): string {
  if (!value.trim()) {
    return "";
  }

  if (mode === "slug") {
    return preserveFileExtension ? slugifyFilename(value) : toSlug(value);
  }

  const words = splitIntoWords(value);
  if (words.length === 0) {
    return "";
  }

  switch (mode) {
    case "camel":
      return words
        .map((word, index) =>
          index === 0 ? word : word[0].toUpperCase() + word.slice(1)
        )
        .join("");
    case "snake":
      return words.join("_");
    case "kebab":
      return words.join("-");
    case "pascal":
      return words.map((word) => word[0].toUpperCase() + word.slice(1)).join("");
    case "constant":
      return words.join("_").toUpperCase();
    default:
      return value;
  }
}

export function CaseConverterTool() {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ConversionMode>("camel");
  const [lineByLine, setLineByLine] = useState(true);
  const [preserveFileExtension, setPreserveFileExtension] = useState(true);
  const [copied, setCopied] = useState(false);

  const output = useMemo(() => {
    if (!input) {
      return "";
    }

    if (lineByLine) {
      return input
        .split("\n")
        .map((line) => convertCase(line, mode, preserveFileExtension))
        .join("\n");
    }

    return convertCase(input, mode, preserveFileExtension);
  }, [input, lineByLine, mode, preserveFileExtension]);

  const copyOutput = async () => {
    if (!output) {
      return;
    }

    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="conversion-mode" className="text-sm font-medium">
            Convert to
          </label>
          <select
            id="conversion-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as ConversionMode)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            {Object.entries(MODE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Options</p>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={lineByLine}
              onChange={(e) => setLineByLine(e.target.checked)}
            />
            Convert each line separately (bulk mode)
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={preserveFileExtension}
              onChange={(e) => setPreserveFileExtension(e.target.checked)}
              disabled={mode !== "slug"}
            />
            Preserve filename extension when slugifying
          </label>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="case-input" className="text-sm font-medium">
            Input
          </label>
          <textarea
            id="case-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste text, variable names, or filenames..."
            className="min-h-[260px] w-full resize-y rounded-lg border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="case-output" className="text-sm font-medium">
            Output
          </label>
          <textarea
            id="case-output"
            value={output}
            readOnly
            placeholder="Converted result appears here..."
            className="min-h-[260px] w-full resize-y rounded-lg border bg-muted/20 p-3 text-sm focus:outline-none"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => setInput("")} disabled={!input}>
          <Trash2 className="mr-2 size-4" />
          Clear
        </Button>
        <Button variant="outline" onClick={copyOutput} disabled={!output}>
          {copied ? (
            <>
              <Check className="mr-2 size-4" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="mr-2 size-4" />
              Copy output
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
