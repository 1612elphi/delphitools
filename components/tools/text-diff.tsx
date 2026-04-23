"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Check, ClipboardPaste, Copy, Delete, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

type DiffLine =
  | { type: "same"; text: string; oldLine: number; newLine: number }
  | { type: "del"; text: string; oldLine: number }
  | { type: "add"; text: string; newLine: number };

// Classic LCS-based line diff. Good enough for the sizes a browser tool sees.
function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const n = a.length;
  const m = b.length;

  // LCS length table
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0)
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
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
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
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
}

function TextPane({ label, value, onChange }: TextPaneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const lineCount = value ? value.split("\n").length : 1;
  const lineNumbers = useMemo(
    () => Array.from({ length: lineCount }, (_, i) => i + 1),
    [lineCount]
  );

  const openFile = () => fileInputRef.current?.click();

  const handleFile = async (file: File) => {
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

  const syncScroll = () => {
    if (gutterRef.current && textareaRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  return (
    <div className="flex flex-col min-w-0">
      <div className="flex items-center justify-between mb-2 gap-2">
        <h3 className="text-sm font-semibold">{label}</h3>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={openFile} className="h-8">
            <FolderOpen className="size-4" />
            <span className="hidden sm:inline">Open</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={pasteFromClipboard}
            aria-label="Paste from clipboard"
          >
            <ClipboardPaste className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onChange("")}
            disabled={!value}
            aria-label="Clear"
          >
            <Delete className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex rounded-lg border bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring">
        <div
          ref={gutterRef}
          className="select-none overflow-hidden bg-muted/40 text-muted-foreground text-right font-mono text-sm py-3 px-3 leading-6"
          aria-hidden
        >
          {lineNumbers.map((n) => (
            <div key={n}>{n}</div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          spellCheck={false}
          placeholder={`Paste ${label.toLowerCase()} here...`}
          className="flex-1 min-w-0 min-h-[300px] resize-none font-mono text-sm py-3 px-3 leading-6 bg-transparent focus:outline-none"
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

  const diff = useMemo(() => diffLines(oldText, newText), [oldText, newText]);

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
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <TextPane label="Old Text" value={oldText} onChange={setOldText} />
        <TextPane label="New Text" value={newText} onChange={setNewText} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold">Differences</h3>
            {hasContent && (
              <div className="flex items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <span className="inline-block size-2 rounded-sm bg-emerald-500/70" />
                  {stats.added} added
                </span>
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <span className="inline-block size-2 rounded-sm bg-rose-500/70" />
                  {stats.removed} removed
                </span>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={copyDiff}
            disabled={!hasContent}
            className="h-8"
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

        <div className="rounded-lg border bg-background overflow-hidden">
          {!hasContent ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Paste text on both sides to see the differences.
            </div>
          ) : allSame ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Texts are identical.
            </div>
          ) : (
            <div className="font-mono text-sm leading-6 overflow-x-auto">
              {diff.map((d, idx) => (
                <DiffRow key={idx} line={d} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DiffRow({ line }: { line: DiffLine }) {
  const bg =
    line.type === "add"
      ? "bg-emerald-500/10"
      : line.type === "del"
      ? "bg-rose-500/10"
      : "";
  const marker = line.type === "add" ? "+" : line.type === "del" ? "−" : " ";
  const markerColor =
    line.type === "add"
      ? "text-emerald-600 dark:text-emerald-400"
      : line.type === "del"
      ? "text-rose-600 dark:text-rose-400"
      : "text-muted-foreground";
  const oldNum = line.type === "add" ? "" : line.oldLine;
  const newNum = line.type === "del" ? "" : line.newLine;

  return (
    <div className={`flex ${bg}`}>
      <div className="select-none px-2 w-10 text-right text-muted-foreground/70 shrink-0">
        {oldNum}
      </div>
      <div className="select-none px-2 w-10 text-right text-muted-foreground/70 shrink-0">
        {newNum}
      </div>
      <div className={`select-none px-2 shrink-0 ${markerColor}`}>{marker}</div>
      <div className="whitespace-pre flex-1 pr-3">{line.text || " "}</div>
    </div>
  );
}
