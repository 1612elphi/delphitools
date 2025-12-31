"use client";

import { useState, useEffect, useRef } from "react";
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

const STORAGE_KEY = "delphitools-scratchpad";

export function MarkdownWriterTool() {
  const [content, setContent] = useState("");
  const [copied, setCopied] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [useRegex, setUseRegex] = useState(false);
  const [showFind, setShowFind] = useState(false);
  const [extractedItems, setExtractedItems] = useState<string[]>([]);
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
  const toUpperCase = () => setContent(content.toUpperCase());
  const toLowerCase = () => setContent(content.toLowerCase());
  const toTitleCase = () => setContent(
    content.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase())
  );
  const toSentenceCase = () => setContent(
    content.toLowerCase().replace(/(^\s*\w|[.!?]\s*\w)/g, c => c.toUpperCase())
  );
  const toCamelCase = () => setContent(
    content.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
  );
  const toSnakeCase = () => setContent(
    content.replace(/\s+/g, "_").replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_")
  );
  const toKebabCase = () => setContent(
    content.replace(/\s+/g, "-").replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-")
  );

  // === LINE OPERATIONS ===
  const sortLines = () => setContent(content.split("\n").sort((a, b) => a.localeCompare(b)).join("\n"));
  const sortLinesReverse = () => setContent(content.split("\n").sort((a, b) => b.localeCompare(a)).join("\n"));
  const sortByLength = () => setContent(content.split("\n").sort((a, b) => a.length - b.length).join("\n"));
  const reverseLines = () => setContent(content.split("\n").reverse().join("\n"));
  const shuffleLines = () => {
    const lines = content.split("\n");
    for (let i = lines.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [lines[i], lines[j]] = [lines[j], lines[i]];
    }
    setContent(lines.join("\n"));
  };
  const removeDuplicates = () => setContent([...new Set(content.split("\n"))].join("\n"));
  const addLineNumbers = () => setContent(
    content.split("\n").map((line, i) => `${i + 1}. ${line}`).join("\n")
  );
  const removeLineNumbers = () => setContent(
    content.split("\n").map(line => line.replace(/^\d+[\.\):\-]\s*/, "")).join("\n")
  );

  // === CLEAN UP ===
  const trimWhitespace = () => setContent(content.split("\n").map(line => line.trim()).join("\n"));
  const removeEmptyLines = () => setContent(content.split("\n").filter(line => line.trim()).join("\n"));
  const removeLineBreaks = () => setContent(content.replace(/\n+/g, " ").replace(/\s+/g, " ").trim());
  const addLineBreaks = (width: number = 80) => {
    const words = content.split(/\s+/);
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
    setContent(lines.join("\n"));
  };
  const removeExtraSpaces = () => setContent(content.replace(/[^\S\n]+/g, " "));
  const decodeUrlChars = () => {
    try {
      setContent(decodeURIComponent(content));
    } catch {
      alert("Unable to decode - text may contain invalid percent-encoded sequences");
    }
  };
  const encodeUrlChars = () => setContent(encodeURIComponent(content));

  // === FIND & REPLACE ===
  const doReplace = (all: boolean) => {
    if (!findText) return;
    try {
      if (useRegex) {
        const regex = new RegExp(findText, all ? "g" : "");
        setContent(content.replace(regex, replaceText));
      } else {
        if (all) {
          setContent(content.split(findText).join(replaceText));
        } else {
          setContent(content.replace(findText, replaceText));
        }
      }
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

  const ToolButton = ({ onClick, children, title }: { onClick: () => void; children: React.ReactNode; title?: string }) => (
    <Button
      onClick={onClick}
      title={title}
      variant="outline"
      size="sm"
    >
      {children}
    </Button>
  );

  const PanelHeader = ({ id, icon: Icon, label }: { id: string; icon: React.ElementType; label: string }) => (
    <button
      onClick={() => setActivePanel(activePanel === id ? null : id)}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
        activePanel === id ? "bg-primary/10 text-primary" : "hover:bg-muted"
      }`}
    >
      <Icon className="size-4" />
      <span className="font-medium text-sm">{label}</span>
      <ChevronDown className={`size-3 ml-1 transition-transform ${activePanel === id ? "rotate-180" : ""}`} />
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Tool Panels */}
      <div className="flex flex-wrap gap-2">
        <PanelHeader id="case" icon={CaseSensitive} label="Case" />
        <PanelHeader id="lines" icon={ArrowUpDown} label="Lines" />
        <PanelHeader id="cleanup" icon={Sparkles} label="Clean Up" />
        <PanelHeader id="find" icon={Search} label="Find & Replace" />
        <PanelHeader id="extract" icon={FileText} label="Extract" />
      </div>

      {/* Case Panel */}
      {activePanel === "case" && (
        <div className="p-3 rounded-lg border bg-card flex flex-wrap gap-2">
          <ToolButton onClick={toUpperCase}>UPPERCASE</ToolButton>
          <ToolButton onClick={toLowerCase}>lowercase</ToolButton>
          <ToolButton onClick={toTitleCase}>Title Case</ToolButton>
          <ToolButton onClick={toSentenceCase}>Sentence case</ToolButton>
          <ToolButton onClick={toCamelCase}>camelCase</ToolButton>
          <ToolButton onClick={toSnakeCase}>snake_case</ToolButton>
          <ToolButton onClick={toKebabCase}>kebab-case</ToolButton>
        </div>
      )}

      {/* Lines Panel */}
      {activePanel === "lines" && (
        <div className="p-3 rounded-lg border bg-card flex flex-wrap gap-2">
          <ToolButton onClick={sortLines}>Sort A-Z</ToolButton>
          <ToolButton onClick={sortLinesReverse}>Sort Z-A</ToolButton>
          <ToolButton onClick={sortByLength}>Sort by Length</ToolButton>
          <ToolButton onClick={reverseLines}>Reverse Order</ToolButton>
          <ToolButton onClick={shuffleLines}>Shuffle</ToolButton>
          <ToolButton onClick={removeDuplicates}>Remove Duplicates</ToolButton>
          <ToolButton onClick={addLineNumbers}>Add Line Numbers</ToolButton>
          <ToolButton onClick={removeLineNumbers}>Remove Line Numbers</ToolButton>
        </div>
      )}

      {/* Cleanup Panel */}
      {activePanel === "cleanup" && (
        <div className="p-3 rounded-lg border bg-card flex flex-wrap gap-2">
          <ToolButton onClick={trimWhitespace}>Trim Lines</ToolButton>
          <ToolButton onClick={removeEmptyLines}>Remove Empty Lines</ToolButton>
          <ToolButton onClick={removeExtraSpaces}>Remove Extra Spaces</ToolButton>
          <ToolButton onClick={removeLineBreaks}>Join Lines</ToolButton>
          <ToolButton onClick={() => addLineBreaks(80)}>Wrap at 80</ToolButton>
          <ToolButton onClick={() => addLineBreaks(120)}>Wrap at 120</ToolButton>
          <ToolButton onClick={encodeUrlChars} title="Encode special characters (e.g. / → %2F)">Encode URL</ToolButton>
          <ToolButton onClick={decodeUrlChars} title="Decode %XX characters (e.g. %2F → /)">Decode URL</ToolButton>
        </div>
      )}

      {/* Find & Replace Panel */}
      {activePanel === "find" && (
        <div className="p-3 rounded-lg border bg-card space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Input
              value={findText}
              onChange={(e) => setFindText(e.target.value)}
              placeholder="Find..."
              className="flex-1 min-w-[150px]"
            />
            <Input
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder="Replace with..."
              className="flex-1 min-w-[150px]"
            />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useRegex}
                onChange={(e) => setUseRegex(e.target.checked)}
                className="rounded"
              />
              Use Regex
            </label>
            {findText && (
              <span className="text-sm text-muted-foreground">
                {countMatches()} matches
              </span>
            )}
            <div className="flex gap-2 ml-auto">
              <Button size="sm" variant="outline" onClick={() => doReplace(false)}>
                Replace
              </Button>
              <Button size="sm" onClick={() => doReplace(true)}>
                Replace All
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Extract Panel */}
      {activePanel === "extract" && (
        <div className="p-3 rounded-lg border bg-card space-y-3">
          <div className="flex flex-wrap gap-2">
            <ToolButton onClick={extractEmails}>Extract Emails</ToolButton>
            <ToolButton onClick={extractUrls}>Extract URLs</ToolButton>
            <ToolButton onClick={extractNumbers}>Extract Numbers</ToolButton>
          </div>
          {extractedItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Found {extractedItems.length} items
                </span>
                <Button size="sm" variant="ghost" onClick={copyExtracted}>
                  <Copy className="size-3 mr-1" /> Copy All
                </Button>
              </div>
              <div className="max-h-32 overflow-auto p-2 rounded bg-muted text-sm font-mono">
                {extractedItems.map((item, i) => (
                  <div key={i} className="truncate">{item}</div>
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
        placeholder="Start typing or paste text here..."
        className="w-full min-h-[500px] p-4 rounded-lg border bg-card resize-y font-mono text-base leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50"
      />

      {/* Status Bar */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span>{wordCount} words</span>
          <span>{charCount} chars</span>
          <span>{lineCount} lines</span>
        </div>
        <div className="flex items-center gap-2">
          {lastSaved && (
            <span className="text-muted-foreground/60">
              Saved {lastSaved.toLocaleTimeString()}
            </span>
          )}
          <Button size="sm" variant="ghost" onClick={copyContent}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
          <Button size="sm" variant="ghost" onClick={downloadContent}>
            <Download className="size-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={clearContent}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
