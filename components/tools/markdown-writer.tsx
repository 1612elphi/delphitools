"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Download,
  Copy,
  Check,
  Trash2,
  CaseSensitive,
  ArrowUpDown,
  Sparkles,
  Search,
  FileText,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "delphitools-scratchpad";

function PanelHeader({
  id,
  icon: Icon,
  label,
  activePanel,
  setActivePanel,
}: {
  id: string;
  icon: React.ElementType;
  label: string;
  activePanel: string | null;
  setActivePanel: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  const isActive = activePanel === id;
  return (
    <button
      onClick={() => setActivePanel(isActive ? null : id)}
      className={cn(
        "flex items-center gap-2 px-3 py-2 text-sm font-medium border-r border-border transition-colors last:border-r-0",
        isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"
      )}
    >
      <Icon className="size-4" />
      {label}
      <ChevronDown className={cn("size-3 ml-0.5 transition-transform", isActive && "rotate-180")} />
    </button>
  );
}

export function MarkdownWriterTool() {
  const [content, setContent] = useState("");
  const [copied, setCopied] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [useRegex, setUseRegex] = useState(false);
  const [extractedItems, setExtractedItems] = useState<string[]>([]);
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Apply a text transformation via the textarea's native input mechanism
  // so the browser's undo stack (Ctrl+Z) tracks the change.
  const applyTransform = useCallback((transform: (text: string) => string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const newValue = transform(ta.value);
    if (newValue === ta.value) return;
    ta.focus();
    ta.select();
    document.execCommand("insertText", false, newValue);
    // Fallback if execCommand is a no-op (some browsers)
    if (ta.value !== newValue) {
      setContent(newValue);
    }
  }, []);

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setContent(saved);
    }
  }, []);

  // Auto-save
  useEffect(() => {
    if (content) {
      const timer = setTimeout(() => {
        localStorage.setItem(STORAGE_KEY, content);
        setLastSaved(new Date());
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [content]);

  // Stats
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;
  const lineCount = content ? content.split("\n").length : 0;

  // Copy & Download
  const copyContent = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const downloadContent = () => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = "scratchpad.txt";
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const clearContent = () => {
    if (confirm("Clear all content?")) {
      setContent("");
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  // === CASE CONVERSIONS ===
  const toUpperCase = () => applyTransform(t => t.toUpperCase());
  const toLowerCase = () => applyTransform(t => t.toLowerCase());
  const toTitleCase = () => applyTransform(t =>
    t.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase())
  );
  const toSentenceCase = () => applyTransform(t =>
    t.toLowerCase().replace(/(^\s*\w|[.!?]\s*\w)/g, c => c.toUpperCase())
  );
  const toCamelCase = () => applyTransform(t =>
    t.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
  );
  const toSnakeCase = () => applyTransform(t =>
    t.replace(/\s+/g, "_").replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_")
  );
  const toKebabCase = () => applyTransform(t =>
    t.replace(/\s+/g, "-").replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-")
  );

  // === LINE OPERATIONS ===
  const sortLines = () => applyTransform(t => t.split("\n").sort((a, b) => a.localeCompare(b)).join("\n"));
  const sortLinesReverse = () => applyTransform(t => t.split("\n").sort((a, b) => b.localeCompare(a)).join("\n"));
  const sortByLength = () => applyTransform(t => t.split("\n").sort((a, b) => a.length - b.length).join("\n"));
  const reverseLines = () => applyTransform(t => t.split("\n").reverse().join("\n"));
  const shuffleLines = () => applyTransform(t => {
    const lines = t.split("\n");
    for (let i = lines.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [lines[i], lines[j]] = [lines[j], lines[i]];
    }
    return lines.join("\n");
  });
  const removeDuplicates = () => applyTransform(t => [...new Set(t.split("\n"))].join("\n"));
  const addLineNumbers = () => applyTransform(t =>
    t.split("\n").map((line, i) => `${i + 1}. ${line}`).join("\n")
  );
  const removeLineNumbers = () => applyTransform(t =>
    t.split("\n").map(line => line.replace(/^\d+[\.\):\-]\s*/, "")).join("\n")
  );

  // === CLEAN UP ===
  const trimWhitespace = () => applyTransform(t => t.split("\n").map(line => line.trim()).join("\n"));
  const removeEmptyLines = () => applyTransform(t => t.split("\n").filter(line => line.trim()).join("\n"));
  const removeLineBreaks = () => applyTransform(t => t.replace(/\n+/g, " ").replace(/\s+/g, " ").trim());
  const addLineBreaks = (width: number = 80) => applyTransform(t => {
    const words = t.split(/\s+/);
    const lines: string[] = [];
    let currentLine = "";
    for (const word of words) {
      if (currentLine.length + word.length + 1 <= width) {
        currentLine += (currentLine ? " " : "") + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines.join("\n");
  });
  const removeExtraSpaces = () => applyTransform(t => t.replace(/[^\S\n]+/g, " "));
  const decodeUrlChars = () => {
    try {
      applyTransform(t => decodeURIComponent(t));
    } catch {
      alert("Unable to decode - text may contain invalid percent-encoded sequences");
    }
  };
  const encodeUrlChars = () => applyTransform(t => encodeURIComponent(t));

  // === FIND & REPLACE ===
  const doReplace = (all: boolean) => {
    if (!findText) return;
    try {
      applyTransform(t => {
        if (useRegex) {
          const regex = new RegExp(findText, all ? "g" : "");
          return t.replace(regex, replaceText);
        } else {
          if (all) {
            return t.split(findText).join(replaceText);
          } else {
            return t.replace(findText, replaceText);
          }
        }
      });
    } catch (e) {
      alert("Invalid regex pattern");
    }
  };

  const countMatches = () => {
    if (!findText) return 0;
    try {
      if (useRegex) {
        const regex = new RegExp(findText, "g");
        return (content.match(regex) || []).length;
      } else {
        return content.split(findText).length - 1;
      }
    } catch {
      return 0;
    }
  };

  // === EXTRACT PATTERNS ===
  const extractEmails = () => {
    const emails = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    setExtractedItems([...new Set(emails)]);
  };
  const extractUrls = () => {
    const urls = content.match(/https?:\/\/[^\s<>"{}|\\^`\[\]]+/g) || [];
    setExtractedItems([...new Set(urls)]);
  };
  const extractNumbers = () => {
    const numbers = content.match(/-?\d+\.?\d*/g) || [];
    setExtractedItems([...new Set(numbers)]);
  };
  const copyExtracted = async () => {
    await navigator.clipboard.writeText(extractedItems.join("\n"));
  };

  return (
    <div className="border-2 border-border">
      {/* Panel Selector Bar */}
      <div className="flex border-b-2 border-border overflow-x-auto">
        <PanelHeader id="case" icon={CaseSensitive} label="Case" activePanel={activePanel} setActivePanel={setActivePanel} />
        <PanelHeader id="lines" icon={ArrowUpDown} label="Lines" activePanel={activePanel} setActivePanel={setActivePanel} />
        <PanelHeader id="cleanup" icon={Sparkles} label="Clean Up" activePanel={activePanel} setActivePanel={setActivePanel} />
        <PanelHeader id="find" icon={Search} label="Find & Replace" activePanel={activePanel} setActivePanel={setActivePanel} />
        <PanelHeader id="extract" icon={FileText} label="Extract" activePanel={activePanel} setActivePanel={setActivePanel} />
      </div>

      {/* Case Panel */}
      {activePanel === "case" && (
        <div className="border-b-2 border-border">
          <div className="segmented grid-cols-4 -mx-0 border-x-0 border-t-0">
            <Button variant="outline" onClick={toUpperCase}>UPPERCASE</Button>
            <Button variant="outline" onClick={toLowerCase}>lowercase</Button>
            <Button variant="outline" onClick={toTitleCase}>Title Case</Button>
            <Button variant="outline" onClick={toSentenceCase}>Sentence case</Button>
            <Button variant="outline" onClick={toCamelCase}>camelCase</Button>
            <Button variant="outline" onClick={toSnakeCase}>snake_case</Button>
            <Button variant="outline" onClick={toKebabCase} className="col-span-2">kebab-case</Button>
          </div>
        </div>
      )}

      {/* Lines Panel */}
      {activePanel === "lines" && (
        <div className="border-b-2 border-border">
          <div className="segmented grid-cols-4 border-x-0 border-t-0">
            <Button variant="outline" onClick={sortLines}>Sort A–Z</Button>
            <Button variant="outline" onClick={sortLinesReverse}>Sort Z–A</Button>
            <Button variant="outline" onClick={sortByLength}>By Length</Button>
            <Button variant="outline" onClick={reverseLines}>Reverse Order</Button>
            <Button variant="outline" onClick={shuffleLines}>Shuffle</Button>
            <Button variant="outline" onClick={removeDuplicates}>Remove Duplicates</Button>
            <Button variant="outline" onClick={addLineNumbers}>Add Line Nos.</Button>
            <Button variant="outline" onClick={removeLineNumbers}>Remove Line Nos.</Button>
          </div>
        </div>
      )}

      {/* Cleanup Panel */}
      {activePanel === "cleanup" && (
        <div className="border-b-2 border-border">
          <div className="segmented grid-cols-4 border-x-0 border-t-0">
            <Button variant="outline" onClick={trimWhitespace}>Trim Lines</Button>
            <Button variant="outline" onClick={removeEmptyLines}>Remove Empty Lines</Button>
            <Button variant="outline" onClick={removeExtraSpaces}>Remove Extra Spaces</Button>
            <Button variant="outline" onClick={removeLineBreaks}>Join Lines</Button>
            <Button variant="outline" onClick={() => addLineBreaks(80)}>Wrap at 80</Button>
            <Button variant="outline" onClick={() => addLineBreaks(120)}>Wrap at 120</Button>
            <Button variant="outline" onClick={encodeUrlChars} title="Encode special characters (e.g. / → %2F)">Encode URL</Button>
            <Button variant="outline" onClick={decodeUrlChars} title="Decode %XX characters (e.g. %2F → /)">Decode URL</Button>
          </div>
        </div>
      )}

      {/* Find & Replace Panel */}
      {activePanel === "find" && (
        <div className="border-b-2 border-border">
          <div className="flex border-b border-border">
            <Input
              value={findText}
              onChange={(e) => setFindText(e.target.value)}
              placeholder="Find…"
              className="flex-1 border-0 border-r border-border bg-transparent px-4 py-3 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <Input
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder="Replace with…"
              className="flex-1 border-0 bg-transparent px-4 py-3 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
          <div className="flex items-center px-4 py-2 gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useRegex}
                onChange={(e) => setUseRegex(e.target.checked)}
              />
              Use Regex
            </label>
            {findText && (
              <span className="text-sm text-muted-foreground">
                {countMatches()} matches
              </span>
            )}
            <div className="segmented grid-cols-2 ml-auto" style={{ width: "auto", minWidth: "220px" }}>
              <Button variant="outline" onClick={() => doReplace(false)}>Replace</Button>
              <Button onClick={() => doReplace(true)}>Replace All</Button>
            </div>
          </div>
        </div>
      )}

      {/* Extract Panel */}
      {activePanel === "extract" && (
        <div className="border-b-2 border-border">
          <div className="segmented grid-cols-3 border-x-0 border-t-0">
            <Button variant="outline" onClick={extractEmails}>Extract Emails</Button>
            <Button variant="outline" onClick={extractUrls}>Extract URLs</Button>
            <Button variant="outline" onClick={extractNumbers}>Extract Numbers</Button>
          </div>
          {extractedItems.length > 0 && (
            <div className="border-t border-border">
              <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                <span className="text-sm text-muted-foreground font-bold">
                  {extractedItems.length} items found
                </span>
                <Button size="sm" variant="ghost" onClick={copyExtracted} className="h-7 gap-1">
                  <Copy className="size-3" /> Copy All
                </Button>
              </div>
              <div
                className="max-h-32 overflow-auto px-4 py-2 bg-muted/30 text-sm"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              >
                {extractedItems.map((item) => (
                  <div key={item} className="truncate py-0.5 border-b border-border last:border-b-0">{item}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Editor */}
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Start typing or paste text here…"
        className="w-full min-h-[500px] p-4 bg-card resize-y text-base leading-relaxed focus:outline-none placeholder:text-muted-foreground/50 border-0"
        style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
      />

      {/* Status Bar */}
      <div className="flex items-center justify-between border-t-2 border-border px-4 py-2 text-xs text-muted-foreground bg-muted/30">
        <div className="flex items-center gap-4">
          <span>{wordCount} words</span>
          <span>{charCount} chars</span>
          <span>{lineCount} lines</span>
          {lastSaved && (
            <span className="text-muted-foreground/60">
              Saved {lastSaved.toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="flex items-stretch border-l border-border -my-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={copyContent}
            className="h-auto self-stretch px-3 border-0 border-r border-border"
            title="Copy"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={downloadContent}
            className="h-auto self-stretch px-3 border-0 border-r border-border"
            title="Download"
          >
            <Download className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={clearContent}
            className="h-auto self-stretch px-3 border-0"
            title="Clear"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
