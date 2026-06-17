"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Check, ClipboardPaste, Copy, FolderOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DiffLine =
  | { type: "same"; text: string; oldLine: number; newLine: number }
  | { type: "del"; text: string; oldLine: number }
  | { type: "add"; text: string; newLine: number };

function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const n = a.length;
  const m = b.length;

  const lcs = new Int32Array((n + 1) * (m + 1));
  const w = m + 1;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * w + j] = a[i] === b[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i], oldLine: i + 1, newLine: j + 1 });
      i++;
      j++;
    } else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) {
      out.push({ type: "del", text: a[i], oldLine: i + 1 });
      i++;
    } else {
      out.push({ type: "add", text: b[j], newLine: j + 1 });
      j++;
    }
  }
  while (i < n) out.push({ type: "del", text: a[i], oldLine: ++i });
  while (j < m) out.push({ type: "add", text: b[j], newLine: ++j });
  return out;
}

interface TextPaneProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  wrap: boolean;
  isRight?: boolean;
}

function TextPane({ label, value, onChange, wrap, isRight }: TextPaneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const lines = useMemo(() => (value ? value.split("\n") : [""]), [value]);
  const [lineHeights, setLineHeights] = useState<number[]>([]);

  useEffect(() => {
    if (!wrap) {
      setLineHeights([]);
      return;
    }

    const measure = () => {
      const mirror = mirrorRef.current;
      const textarea = textareaRef.current;
      if (!mirror || !textarea) return;

      mirror.style.width = `${textarea.clientWidth}px`;
      mirror.innerHTML = "";

      const divs = lines.map((line) => {
        const div = document.createElement("div");
        div.textContent = line || " ";
        mirror.appendChild(div);
        return div;
      });

      setLineHeights(divs.map((d) => d.offsetHeight));
    };

    measure();

    const ro = new ResizeObserver(measure);
    if (textareaRef.current) ro.observe(textareaRef.current);
    return () => ro.disconnect();
  }, [lines, wrap]);

  const openFile = () => fileInputRef.current?.click();

  const handleFile = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) return;
    const text = await file.text();
    onChange(text);
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      onChange(text);
    } catch {
      // clipboard read blocked; silently ignore
    }
  };

  const copyToClipboard = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const syncScroll = () => {
    if (gutterRef.current && textareaRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  return (
    <div className={cn("flex flex-col min-w-0", isRight && "border-l-2 border-border")}>
      {/* Pane header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <label className="font-bold text-sm">{label}</label>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={openFile}
            className="h-8 border-l border-border"
            aria-label="Open file"
          >
            <FolderOpen className="size-4" />
            <span className="hidden sm:inline ml-1">Open</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 border-l border-border"
            onClick={pasteFromClipboard}
            aria-label="Paste from clipboard"
          >
            <ClipboardPaste className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 border-l border-border"
            onClick={copyToClipboard}
            disabled={!value}
            aria-label={`Copy ${label.toLowerCase()} to clipboard`}
          >
            {copied ? (
              <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Copy className="size-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 border-l border-border"
            onClick={() => onChange("")}
            disabled={!value}
            aria-label="Clear"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Textarea with gutter */}
      <div className="relative flex overflow-hidden h-[300px]">
        {wrap && (
          <div
            ref={mirrorRef}
            className="absolute invisible overflow-hidden text-sm leading-6 whitespace-pre-wrap break-words"
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            aria-hidden="true"
          />
        )}
        <div
          ref={gutterRef}
          className="select-none overflow-hidden bg-muted/40 text-muted-foreground text-right text-sm py-3 px-3 leading-6 shrink-0"
          style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
          aria-hidden
        >
          {lines.map((_, i) => (
            <div
              key={i}
              style={wrap && lineHeights[i] ? { height: lineHeights[i] } : undefined}
            >
              {i + 1}
            </div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          wrap={wrap ? "soft" : "off"}
          spellCheck={false}
          placeholder={`Paste ${label.toLowerCase()} here...`}
          className="flex-1 min-w-0 h-full resize-none text-sm py-3 px-3 leading-6 bg-transparent focus:outline-none border-l border-border"
          style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="text/*,.txt,.md,.json,.csv,.log,.xml,.yaml,.yml,.html,.css,.js,.ts,.tsx,.jsx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function TextDiffTool() {
  const [oldText, setOldText] = useState("");
  const [newText, setNewText] = useState("");
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(false);

  const deferredOld = useDeferredValue(oldText);
  const deferredNew = useDeferredValue(newText);
  const diff = useMemo(() => diffLines(deferredOld, deferredNew), [deferredOld, deferredNew]);

  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const d of diff) {
      if (d.type === "add") added++;
      else if (d.type === "del") removed++;
    }
    return { added, removed };
  }, [diff]);

  const hasContent = oldText.length > 0 || newText.length > 0;
  const allSame = hasContent && stats.added === 0 && stats.removed === 0;

  const copyDiff = useCallback(async () => {
    const patch = diff
      .map((d) => {
        if (d.type === "same") return `  ${d.text}`;
        if (d.type === "add") return `+ ${d.text}`;
        return `- ${d.text}`;
      })
      .join("\n");
    await navigator.clipboard.writeText(patch);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [diff]);

  return (
    <div className="space-y-0">
      {/* Main frame */}
      <div className="border-2 border-border">

        {/* Options bar — word wrap toggle + stats */}
        <div className="flex items-center justify-between border-b-2 border-border px-4 py-2 min-h-12">
          <div className="flex items-center gap-3">
            {hasContent && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block size-2 bg-emerald-500/70" />
                  {stats.added} added
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block size-2 bg-rose-500/70" />
                  {stats.removed} removed
                </span>
              </div>
            )}
          </div>
          {/* Word wrap segmented toggle */}
          <div className="segmented grid-cols-2" style={{ width: "12rem" }}>
            <Button
              variant={!wrap ? "default" : "outline"}
              size="sm"
              onClick={() => setWrap(false)}
              className="h-8 text-xs"
            >
              No wrap
            </Button>
            <Button
              variant={wrap ? "default" : "outline"}
              size="sm"
              onClick={() => setWrap(true)}
              className="h-8 text-xs"
            >
              Word wrap
            </Button>
          </div>
        </div>

        {/* Two-column input panes */}
        <div className="grid grid-cols-1 md:grid-cols-2 border-b-2 border-border">
          <TextPane label="Old Text" value={oldText} onChange={setOldText} wrap={wrap} />
          <TextPane label="New Text" value={newText} onChange={setNewText} wrap={wrap} isRight />
        </div>

        {/* Diff output header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <label className="font-bold text-sm">Differences</label>
          <Button
            variant="ghost"
            size="sm"
            onClick={copyDiff}
            disabled={!hasContent}
            className="h-8 border-l border-border"
          >
            {copied ? (
              <>
                <Check className="size-4" /> Copied
              </>
            ) : (
              <>
                <Copy className="size-4" /> Copy patch
              </>
            )}
          </Button>
        </div>

        {/* Diff output body */}
        <div className="bg-background">
          {!hasContent ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Paste text on both sides to see the differences.
            </div>
          ) : allSame ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Texts are identical.
            </div>
          ) : (
            <div className="text-sm leading-6 overflow-x-auto" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
              {diff.map((d) => (
                <DiffRow
                  key={`${d.type}-${"oldLine" in d ? d.oldLine : ""}-${"newLine" in d ? d.newLine : ""}`}
                  line={d}
                  wrap={wrap}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground/60 pt-3">
        contributed by{" "}
        <a href="https://github.com/Pranavk-official" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">
          Pranav K
        </a>
        {" "}with some tweaks: word wrap toggle with synced line numbers, flat typed array for the lcs table, deferred diff computation, file size cap, and a few accessibility fixes.
      </p>
    </div>
  );
}

function DiffRow({ line, wrap }: { line: DiffLine; wrap: boolean }) {
  const marker = line.type === "add" ? "+" : line.type === "del" ? "−" : " ";
  const oldNum = line.type === "add" ? "" : line.oldLine;
  const newNum = line.type === "del" ? "" : line.newLine;

  return (
    <div className={cn("flex border-b border-border last:border-b-0", line.type === "add" && "bg-emerald-500/10", line.type === "del" && "bg-rose-500/10")}>
      <div className="select-none px-2 w-10 text-right text-muted-foreground/70 shrink-0 border-r border-border">
        {oldNum}
      </div>
      <div className="select-none px-2 w-10 text-right text-muted-foreground/70 shrink-0 border-r border-border">
        {newNum}
      </div>
      <div className={cn("select-none px-2 shrink-0 border-r border-border", line.type === "add" ? "text-emerald-600 dark:text-emerald-400" : line.type === "del" ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>{marker}</div>
      <div className={cn("flex-1 px-3", wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre")}>{line.text || " "}</div>
    </div>
  );
}
