"use client";

import { useState, useMemo } from "react";
import { Copy, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RegexTesterTool() {
  const [pattern, setPattern] = useState("");
  const [flags, setFlags] = useState("g");
  const [testString, setTestString] = useState("");
  const [copied, setCopied] = useState(false);

  const result = useMemo(() => {
    if (!pattern) {
      return { valid: true, matches: [], error: null };
    }

    try {
      const regex = new RegExp(pattern, flags);
      const matches: { match: string; index: number; groups: string[] }[] = [];

      if (flags.includes("g")) {
        let match;
        while ((match = regex.exec(testString)) !== null) {
          matches.push({
            match: match[0],
            index: match.index,
            groups: match.slice(1),
          });
          // Prevent infinite loops with zero-width matches
          if (match[0].length === 0) {
            regex.lastIndex++;
          }
        }
      } else {
        const match = regex.exec(testString);
        if (match) {
          matches.push({
            match: match[0],
            index: match.index,
            groups: match.slice(1),
          });
        }
      }

      return { valid: true, matches, error: null };
    } catch (err) {
      return {
        valid: false,
        matches: [],
        error: err instanceof Error ? err.message : "Invalid regex",
      };
    }
  }, [pattern, flags, testString]);

  const highlightedText = useMemo(() => {
    if (!pattern || !result.valid || result.matches.length === 0) {
      return testString;
    }

    try {
      const regex = new RegExp(pattern, flags);
      const parts: { text: string; isMatch: boolean }[] = [];
      let lastIndex = 0;

      if (flags.includes("g")) {
        let match;
        const tempRegex = new RegExp(pattern, flags);
        while ((match = tempRegex.exec(testString)) !== null) {
          if (match.index > lastIndex) {
            parts.push({
              text: testString.slice(lastIndex, match.index),
              isMatch: false,
            });
          }
          parts.push({ text: match[0], isMatch: true });
          lastIndex = match.index + match[0].length;
          if (match[0].length === 0) {
            tempRegex.lastIndex++;
          }
        }
      } else {
        const match = regex.exec(testString);
        if (match) {
          if (match.index > 0) {
            parts.push({
              text: testString.slice(0, match.index),
              isMatch: false,
            });
          }
          parts.push({ text: match[0], isMatch: true });
          lastIndex = match.index + match[0].length;
        }
      }

      if (lastIndex < testString.length) {
        parts.push({ text: testString.slice(lastIndex), isMatch: false });
      }

      return parts;
    } catch {
      return testString;
    }
  }, [pattern, flags, testString, result.valid, result.matches.length]);

  const toggleFlag = (flag: string) => {
    if (flags.includes(flag)) {
      setFlags(flags.replace(flag, ""));
    } else {
      setFlags(flags + flag);
    }
  };

  const copyPattern = async () => {
    await navigator.clipboard.writeText(`/${pattern}/${flags}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const presets = [
    { label: "Email", pattern: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}" },
    { label: "URL", pattern: "https?:\\/\\/[\\w\\-._~:/?#[\\]@!$&'()*+,;=%]+" },
    { label: "Phone", pattern: "\\+?[\\d\\s\\-().]{10,}" },
    { label: "Date", pattern: "\\d{4}-\\d{2}-\\d{2}" },
  ];

  return (
    <div className="border-2 border-border">
      {/* Pattern input row */}
      <div className="border-b-2 border-border p-4">
        <label className="mb-3 block font-bold">Regular Expression</label>
        <div className="flex items-stretch border border-border">
          <span className="flex items-center px-3 text-xl text-muted-foreground select-none">/</span>
          <Input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="Enter regex pattern…"
            className="h-12 flex-1 border-0 bg-transparent font-mono text-base focus-visible:ring-0"
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
          />
          <span className="flex items-center px-3 text-xl text-muted-foreground select-none">/</span>
          <div className="flex items-center border-l border-border px-3">
            <Input
              value={flags}
              onChange={(e) => setFlags(e.target.value)}
              className="h-12 w-12 border-0 bg-transparent text-center font-mono text-base focus-visible:ring-0"
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            />
          </div>
        </div>
      </div>

      {/* Flag toggles */}
      <div className="border-b-2 border-border p-4">
        <label className="mb-3 block font-bold">Flags</label>
        <div className="segmented grid-cols-4 -mx-4 -mb-4 border-x-0 border-b-0">
          {[
            { flag: "g", label: "Global" },
            { flag: "i", label: "Case insensitive" },
            { flag: "m", label: "Multiline" },
            { flag: "s", label: "Dotall" },
          ].map(({ flag, label }) => (
            <Button
              key={flag}
              variant={flags.includes(flag) ? "default" : "outline"}
              onClick={() => toggleFlag(flag)}
            >
              <span
                className="mr-1.5 font-bold"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              >
                {flag}
              </span>
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Presets */}
      <div className="border-b-2 border-border p-4">
        <label className="mb-3 block font-bold">Presets</label>
        <div className="segmented grid-cols-4 -mx-4 -mb-4 border-x-0 border-b-0">
          {presets.map((preset) => (
            <Button
              key={preset.label}
              variant="outline"
              onClick={() => setPattern(preset.pattern)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Error display */}
      {result.error && (
        <div className="flex items-center gap-3 border-b-2 border-border bg-destructive/10 px-4 py-3 text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span
            className="text-sm"
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
          >
            {result.error}
          </span>
        </div>
      )}

      {/* Test string */}
      <div className="border-b-2 border-border p-4">
        <label className="mb-3 block font-bold">Test String</label>
        <textarea
          value={testString}
          onChange={(e) => setTestString(e.target.value)}
          placeholder="Enter text to test against…"
          className="w-full min-h-[120px] border border-border bg-background p-3 text-base resize-y focus:outline-none focus:ring-1 focus:ring-ring"
          style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
        />
      </div>

      {/* Highlighted matches */}
      {testString && pattern && result.valid && (
        <div className="border-b-2 border-border p-4">
          <label className="mb-3 block font-bold">Highlighted Matches</label>
          <div
            className="border border-border bg-card p-3 text-base whitespace-pre-wrap break-all"
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
          >
            {typeof highlightedText === "string" ? (
              highlightedText
            ) : (
              highlightedText.map((part, i) =>
                part.isMatch ? (
                  <mark
                    key={`m-${i}-${part.text}`}
                    className="bg-primary/30 text-foreground px-0.5"
                  >
                    {part.text}
                  </mark>
                ) : (
                  <span key={`t-${i}-${part.text}`}>{part.text}</span>
                )
              )
            )}
          </div>
        </div>
      )}

      {/* Match results table */}
      {result.matches.length > 0 && (
        <div>
          {/* Header row */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <label className="font-bold">
              {result.matches.length} Match{result.matches.length !== 1 ? "es" : ""}
            </label>
            <button
              type="button"
              onClick={copyPattern}
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {copied ? (
                <>
                  <Check className="size-3.5 text-green-500" /> Copied!
                </>
              ) : (
                <>
                  <Copy className="size-3.5" /> Copy pattern
                </>
              )}
            </button>
          </div>

          {/* Match rows */}
          {result.matches.map((match, index) => (
            <div
              key={`${match.index}-${match.match}`}
              className="border-b border-border last:border-b-0"
            >
              <div className="flex items-stretch">
                {/* Index number cell */}
                <span className="flex w-10 shrink-0 items-center justify-center border-r border-border text-xs text-muted-foreground">
                  {index + 1}
                </span>
                {/* Match value cell */}
                <span
                  className="flex flex-1 items-center px-4 py-3 text-sm font-bold"
                  style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                >
                  {match.match || <span className="text-muted-foreground italic">empty</span>}
                </span>
                {/* Position cell */}
                <span className="flex shrink-0 items-center border-l border-border px-4 py-3 text-xs text-muted-foreground">
                  index: {match.index}
                </span>
              </div>
              {/* Capture groups sub-row */}
              {match.groups.length > 0 && (
                <div className="flex items-center gap-3 border-t border-border bg-muted/30 px-4 py-2 text-xs">
                  <span className="shrink-0 text-muted-foreground">Groups:</span>
                  {match.groups.map((g, i) => (
                    <span key={`${match.index}-g${i}-${g}`}>
                      <span className="text-muted-foreground">${i + 1}:</span>{" "}
                      <strong style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                        {g}
                      </strong>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
