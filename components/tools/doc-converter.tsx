"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  Download,
  Copy,
  Check,
  ArrowLeftRight,
  Loader2,
  AlertTriangle,
  ClipboardPaste,
  FileText,
  ChevronsUpDown,
  Info,
  Printer,
  X,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  convert,
  getEngineState,
  loadEngine,
  type EngineState,
  type LoadProgress,
} from "@/lib/pandoc/client";
import type { PandocConvertResult } from "@/lib/pandoc/pandoc-core";
import {
  AUTO_DETECT,
  getFormat,
  guessFormatFromContent,
  guessFormatFromFilename,
  inputFormats,
  outputFormats,
  unreadableInputLabel,
  type PandocFormat,
} from "@/lib/pandoc/formats";
import { downloadBlob, downloadText } from "@/lib/download";
import { injectPrintStyles, printHtmlInIframe } from "@/lib/print-pdf";

const SCRATCHPAD_KEY = "delphitools-scratchpad";
const PANDOC_VERSION = "3.9";

type InputMode = "paste" | "upload";

type ConvResult =
  | { kind: "text"; text: string; ext: string }
  | { kind: "binary"; blob: Blob; filename: string }
  | { kind: "pdf"; html: string };

function baseName(filename: string): string {
  const slash = filename.lastIndexOf("/");
  const name = slash >= 0 ? filename.slice(slash + 1) : filename;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extractWarnings(res: PandocConvertResult): string[] {
  const out: string[] = [];
  if (Array.isArray(res.warnings)) {
    for (const w of res.warnings) {
      if (typeof w === "string") out.push(w);
      else if (w && typeof w === "object") {
        const message = (w as { message?: unknown }).message;
        out.push(typeof message === "string" ? message : JSON.stringify(w));
      }
    }
  }
  return out;
}

/** Searchable format picker (Popover + Command) with a subtitle per format. */
function FormatCombobox({
  value,
  onValueChange,
  formats,
  includeAuto = false,
  autoDetectedLabel = null,
  ariaLabel,
}: {
  value: string;
  onValueChange: (id: string) => void;
  formats: PandocFormat[];
  includeAuto?: boolean;
  autoDetectedLabel?: string | null;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const tier1 = formats.filter((f) => f.tier === 1);
  const tier2 = formats.filter((f) => f.tier === 2);

  const triggerLabel =
    value === AUTO_DETECT
      ? autoDetectedLabel
        ? `Auto-detect · ${autoDetectedLabel}`
        : "Auto-detect"
      : getFormat(value)?.label ?? value;

  const choose = (id: string) => {
    onValueChange(id);
    setOpen(false);
  };

  const renderItem = (f: PandocFormat) => (
    <CommandItem key={f.id} value={`${f.label} ${f.id} ${f.ext} ${f.subtitle}`} onSelect={() => choose(f.id)}>
      <Check className={cn("mr-2 size-4 shrink-0", value === f.id ? "opacity-100" : "opacity-0")} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate">{f.label}</span>
        <span className="truncate text-xs text-muted-foreground">{f.subtitle}</span>
      </div>
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className="h-10 w-full justify-between font-normal"
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search formats…" />
          <CommandList>
            <CommandEmpty>No format found.</CommandEmpty>
            {includeAuto && (
              <>
                <CommandGroup>
                  <CommandItem value="auto detect automatic guess" onSelect={() => choose(AUTO_DETECT)}>
                    <Check className={cn("mr-2 size-4 shrink-0", value === AUTO_DETECT ? "opacity-100" : "opacity-0")} />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">Auto-detect</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {autoDetectedLabel ? `Looks like ${autoDetectedLabel}` : "Guess from the input"}
                      </span>
                    </div>
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            <CommandGroup heading="Common">{tier1.map(renderItem)}</CommandGroup>
            {tier2.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="More formats">{tier2.map(renderItem)}</CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function DocConverterTool() {
  const [inputMode, setInputMode] = useState<InputMode>("upload");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  const [from, setFrom] = useState<string>(AUTO_DETECT);
  const [to, setTo] = useState<string>("html");

  const [standalone, setStandalone] = useState(true);
  const [toc, setToc] = useState(false);
  const [numberSections, setNumberSections] = useState(false);

  const [engineState, setEngineState] = useState<EngineState>("idle");
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [converting, setConverting] = useState(false);

  const [result, setResult] = useState<ConvResult | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reflect engine state if it was already loaded earlier this session.
  useEffect(() => {
    setEngineState(getEngineState());
  }, []);

  const fromFormat = from === AUTO_DETECT ? null : getFormat(from);
  const toFormat = getFormat(to);
  const canSwap = from !== AUTO_DETECT && !!getFormat(from)?.output && !!getFormat(to)?.input;

  // What "Auto-detect" currently resolves to, for the From picker's hint.
  const autoDetectedLabel = useMemo(() => {
    const id =
      inputMode === "upload" && file
        ? guessFormatFromFilename(file.name)
        : inputMode === "paste" && text.trim()
          ? guessFormatFromContent(text)
          : null;
    return id ? getFormat(id)?.label ?? null : null;
  }, [inputMode, file, text]);

  const selectFile = useCallback((f: File) => {
    setFile(f);
    setInputMode("upload");
    setResult(null);
    setError(null);

    // Reject files pandoc can't read (PDF, images, …) with a clear message.
    const unreadable = unreadableInputLabel(f.name);
    if (unreadable) {
      setFileError(
        `Pandoc can't read ${unreadable}s. It converts text and word-processor documents (Word, ODT, EPUB, Markdown, HTML…). Paste the text instead, or pick a different file.`
      );
      return;
    }
    setFileError(null);
    // Auto-set the source format from the filename when we recognise it.
    const guessed = guessFormatFromFilename(f.name);
    if (guessed) setFrom(guessed);
  }, []);

  const clearFile = useCallback(() => {
    setFile(null);
    setFileError(null);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) selectFile(f);
    },
    [selectFile]
  );

  const loadScratchpad = useCallback(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(SCRATCHPAD_KEY) : null;
    if (saved && saved.trim()) {
      setText(saved);
      setInputMode("paste");
      setResult(null);
      setError(null);
    } else {
      setError("Your Text Scratchpad is empty — nothing to load.");
    }
  }, []);

  const swap = useCallback(() => {
    if (!canSwap) return;
    setFrom(to);
    setTo(from);
    setResult(null);
  }, [canSwap, from, to]);

  const doConvert = useCallback(async () => {
    setError(null);
    setResult(null);
    setWarnings([]);

    const hasFile = inputMode === "upload" && !!file;
    const hasText = inputMode === "paste" && text.trim().length > 0;
    if (!hasFile && !hasText) {
      setError("Add some text or upload a file to convert.");
      return;
    }
    if (hasFile && fileError) {
      setError(fileError);
      return;
    }
    if (!toFormat) {
      setError("Choose an output format.");
      return;
    }

    // Resolve the source format.
    let fromId = from;
    if (fromId === AUTO_DETECT) {
      fromId = hasFile && file ? guessFormatFromFilename(file.name) ?? "markdown" : guessFormatFromContent(text);
    }
    if (getFormat(fromId)?.kind === "binary" && !hasFile) {
      setError(`${getFormat(fromId)?.label} input must be uploaded as a file.`);
      return;
    }

    // Assemble the input + the options shared across output kinds.
    let stdin: string | null = null;
    const files: Record<string, Blob | string> = {};
    if (hasFile && file) files[file.name] = file;
    else stdin = text;

    const base: Record<string, unknown> = { from: fromId };
    if (hasFile && file) base["input-files"] = [file.name];
    if (toc) base["table-of-contents"] = true;
    if (numberSections) base["number-sections"] = true;

    // Make sure the engine is loaded (fetches ~16 MB from a CDN on first use).
    if (getEngineState() !== "ready") {
      setEngineState("loading");
      try {
        await loadEngine((p) => setProgress(p));
        setEngineState("ready");
      } catch (e) {
        setEngineState("error");
        setError(e instanceof Error ? e.message : String(e));
        return;
      }
    }

    setConverting(true);
    try {
      if (toFormat.id === "pdf") {
        // Render a standalone, self-contained HTML document, then hand it to the
        // browser's own print engine — a real vector PDF with no extra library.
        const res = await convert(
          { ...base, to: "html", standalone: true, "embed-resources": true },
          stdin,
          files
        );
        setWarnings(extractWarnings(res));
        if (res.stdout?.trim()) {
          const html = injectPrintStyles(res.stdout);
          setResult({ kind: "pdf", html });
          printHtmlInIframe(html);
        } else {
          setError(res.stderr?.trim() || "Conversion produced no output.");
        }
      } else if (toFormat.kind === "binary") {
        const outName = `output.${toFormat.ext}`;
        const res = await convert({ ...base, to, "output-file": outName }, stdin, files);
        setWarnings(extractWarnings(res));
        const blob = res.files[outName];
        if (blob instanceof Blob && blob.size > 0) {
          const name = baseName(hasFile && file ? file.name : "document");
          setResult({ kind: "binary", blob, filename: `${name}.${toFormat.ext}` });
        } else {
          setError(res.stderr?.trim() || "Conversion produced no output.");
        }
      } else {
        const options: Record<string, unknown> = { ...base, to };
        if (standalone) options.standalone = true;
        const res = await convert(options, stdin, files);
        setWarnings(extractWarnings(res));
        if (res.stdout && res.stdout.length > 0) {
          setResult({ kind: "text", text: res.stdout, ext: toFormat.ext });
        } else if (res.stderr?.trim()) {
          setError(res.stderr.trim());
        } else {
          setResult({ kind: "text", text: "", ext: toFormat.ext });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConverting(false);
    }
  }, [inputMode, file, fileError, text, from, to, toFormat, standalone, toc, numberSections]);

  const copyOutput = useCallback(async () => {
    if (result?.kind !== "text") return;
    await navigator.clipboard.writeText(result.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [result]);

  const downloadResult = useCallback(() => {
    if (!result) return;
    if (result.kind === "binary") downloadBlob(result.blob, result.filename);
    else if (result.kind === "text") downloadText(result.text, `converted.${result.ext}`);
  }, [result]);

  const loading = engineState === "loading";
  const busy = loading || converting;
  const downloadingMb = progress ? (progress.receivedBytes / (1024 * 1024)).toFixed(1) : "0.0";
  const pct = progress?.ratio != null ? Math.round(progress.ratio * 100) : null;

  const sourceNeedsFile = !!fromFormat && fromFormat.kind === "binary";

  return (
    <div className="space-y-6">
      <div className="border-2 border-border">
        {/* Input */}
        <div className="border-b-2 border-border p-4">
          <div className="flex min-h-9 items-center justify-between">
            <Label className="font-bold">Input</Label>
            <Button variant="ghost" size="sm" onClick={loadScratchpad} title="Load from the Text Scratchpad">
              <ClipboardPaste className="size-4 mr-1" /> From Scratchpad
            </Button>
          </div>

          {inputMode === "upload" ? (
            <>
              <div
                onDrop={onDrop}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                className={cn(
                  "mt-3 flex flex-col items-center justify-center gap-2 border-2 border-dashed p-8 text-center transition-colors",
                  dragging ? "border-primary bg-primary/5" : "border-border"
                )}
              >
                {file ? (
                  <div className="flex items-center gap-3">
                    <FileText className="size-5 text-primary" />
                    <div className="text-left">
                      <p className="text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={clearFile} title="Remove file">
                      <X className="size-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <Upload className="size-6 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Drag &amp; drop a file here, or</p>
                    <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                      Choose file
                    </Button>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) selectFile(f);
                    e.target.value = "";
                  }}
                />
              </div>
              {fileError && (
                <p className="mt-3 flex items-center justify-center gap-1.5 px-2 text-center text-xs text-destructive">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  {fileError}
                </p>
              )}
              <button
                type="button"
                onClick={() => setInputMode("paste")}
                className="mx-auto mt-3 block text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                No file? Paste text instead
              </button>
            </>
          ) : (
            <>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste or type the document you want to convert…"
                className="mt-3 min-h-[200px] font-mono text-sm leading-relaxed"
              />
              <button
                type="button"
                onClick={() => setInputMode("upload")}
                className="mx-auto mt-3 block text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Upload a file instead
              </button>
            </>
          )}
        </div>

        {/* Format selector — the core control */}
        <div className="border-b-2 border-border p-4">
          <Label className="font-bold">Format</Label>
          <div className="-mx-4 -mb-4 mt-3 grid grid-cols-1 border-t border-border sm:grid-cols-[1fr_auto_1fr]">
            <div className="border-border sm:border-r">
              <Label className="block px-4 pt-3 text-xs text-muted-foreground">Convert from</Label>
              <div className="px-4 pb-3 pt-1.5">
                <FormatCombobox
                  value={from}
                  onValueChange={setFrom}
                  formats={inputFormats}
                  includeAuto
                  autoDetectedLabel={autoDetectedLabel}
                  ariaLabel="Source format"
                />
              </div>
            </div>

            <div className="flex items-center justify-center border-t border-border sm:border-l-0 sm:border-t-0">
              <Button
                variant="outline"
                size="icon"
                onClick={swap}
                disabled={!canSwap}
                title={canSwap ? "Swap formats" : "Swap unavailable for this pair"}
                className="shrink-0"
              >
                <ArrowLeftRight className="size-4" />
              </Button>
            </div>

            <div className="border-t border-border sm:border-l sm:border-t-0">
              <Label className="block px-4 pt-3 text-xs text-muted-foreground">Convert to</Label>
              <div className="px-4 pb-3 pt-1.5">
                <FormatCombobox value={to} onValueChange={setTo} formats={outputFormats} ariaLabel="Target format" />
              </div>
            </div>
          </div>

          {sourceNeedsFile && inputMode === "paste" && (
            <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
              {fromFormat?.label} is a binary format — switch to <strong>Upload file</strong>.
            </p>
          )}
        </div>

        {/* Options */}
        <Accordion type="single" collapsible>
          <AccordionItem value="options" className="border-b-2 border-border">
            <AccordionTrigger className="px-4 font-bold">Options</AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="space-y-4 pt-1">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="standalone" className="text-sm">Standalone document</Label>
                    <p className="text-xs text-muted-foreground">Emit a complete file with header/footer, not a fragment.</p>
                  </div>
                  <Switch id="standalone" checked={standalone} onCheckedChange={setStandalone} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="toc" className="text-sm">Table of contents</Label>
                    <p className="text-xs text-muted-foreground">Generate a TOC from the headings.</p>
                  </div>
                  <Switch id="toc" checked={toc} onCheckedChange={setToc} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="numsec" className="text-sm">Number sections</Label>
                    <p className="text-xs text-muted-foreground">Prefix headings with section numbers.</p>
                  </div>
                  <Switch id="numsec" checked={numberSections} onCheckedChange={setNumberSections} />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Convert */}
        <Button
          onClick={doConvert}
          disabled={
            busy ||
            (inputMode === "upload" && !!file && !!fileError) ||
            (inputMode === "paste" && sourceNeedsFile)
          }
          className="h-14 w-full rounded-none border-0 text-lg font-bold"
        >
          {busy ? (
            <>
              <Loader2 className="size-4 mr-2 animate-spin" />
              {loading ? "Downloading engine…" : "Converting…"}
            </>
          ) : (
            <>Convert{toFormat ? ` to ${toFormat.label}` : ""}</>
          )}
        </Button>

        {loading && (
          <div className="space-y-1.5 border-t-2 border-border p-4">
            <div className="h-2 w-full overflow-hidden bg-muted">
              <div
                className={cn("h-full bg-primary transition-all", pct == null && "animate-pulse")}
                style={{ width: pct == null ? "100%" : `${pct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Fetching Pandoc engine — {downloadingMb} MB{pct != null ? ` (${pct}%)` : ""}…
            </p>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="size-4 mt-0.5 shrink-0" />
          <pre className="whitespace-pre-wrap break-words font-sans">{error}</pre>
        </div>
      )}

      {/* Output */}
      {result && (
        <div className="border-2 border-border">
          <div className="flex min-h-14 items-stretch border-b-2 border-border">
            <Label className="flex flex-1 items-center px-4 font-bold">Output</Label>
            {result.kind === "text" && (
              <Button
                variant="ghost"
                onClick={copyOutput}
                className="h-auto gap-2 self-stretch rounded-none border-l border-border px-5"
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            )}
            {result.kind === "pdf" ? (
              <Button
                onClick={() => printHtmlInIframe(result.html)}
                className="h-auto gap-2 self-stretch rounded-none border-l border-border px-6 font-semibold"
              >
                <Printer className="size-4" /> Save as PDF
              </Button>
            ) : (
              <Button
                onClick={downloadResult}
                className="h-auto gap-2 self-stretch rounded-none border-l border-border px-6 font-semibold"
              >
                <Download className="size-4" /> Download
              </Button>
            )}
          </div>

          {result.kind === "text" ? (
            <Textarea
              readOnly
              value={result.text}
              className="min-h-[220px] rounded-none border-0 font-mono text-sm leading-relaxed"
            />
          ) : result.kind === "pdf" ? (
            <div className="flex items-center gap-3 p-4">
              <Printer className="size-6 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">Print dialog opened</p>
                <p className="text-xs text-muted-foreground">
                  Choose &ldquo;Save as PDF&rdquo; as the destination. Didn&apos;t see it? Use the button.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4">
              <FileText className="size-6 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">{result.filename}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(result.blob.size)}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <p className="mb-1 flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
            <AlertTriangle className="size-4" /> {warnings.length} warning{warnings.length > 1 ? "s" : ""}
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
            {warnings.slice(0, 8).map((w, i) => (
              <li key={i} className="break-words">{w}</li>
            ))}
            {warnings.length > 8 && <li>…and {warnings.length - 8} more</li>}
          </ul>
        </div>
      )}

      {/* Privacy + engine + licence notice (single box) */}
      <div className="flex items-start gap-2 border border-border bg-muted/50 p-3">
        <Info className="size-4 shrink-0 mt-0.5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Conversion runs entirely in your browser — your documents are never uploaded. On first use the ~16 MB Pandoc
          engine is fetched from a CDN and cached for the rest of your visit. Powered by{" "}
          <Link
            href={`https://github.com/jgm/pandoc/tree/${PANDOC_VERSION}`}
            target="_blank"
            rel="noreferrer noopener"
            className="underline hover:text-foreground"
          >
            Pandoc {PANDOC_VERSION}
          </Link>{" "}
          (GPL-2.0-or-later).
        </p>
      </div>
    </div>
  );
}
