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
    <div className="space-y-6">
      {/* Pattern Input */}
      <div className="space-y-3">
        <label className="text-lg font-bold block">Regular Expression</label>
        <div className="flex gap-2">
          <span className="flex items-center text-2xl text-muted-foreground">/</span>
          <Input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="Enter regex pattern..."
            className="text-lg h-14 font-mono flex-1"
          />
          <span className="flex items-center text-2xl text-muted-foreground">/</span>
          <Input
            value={flags}
            onChange={(e) => setFlags(e.target.value)}
            className="w-20 text-lg h-14 font-mono text-center"
          />
        </div>

        {/* Flag Toggles */}
        <div className="flex gap-2 flex-wrap">
          {[
            { flag: "g", label: "Global" },
            { flag: "i", label: "Case insensitive" },
            { flag: "m", label: "Multiline" },
            { flag: "s", label: "Dotall" },
          ].map(({ flag, label }) => (
            <Button
              key={flag}
              variant={flags.includes(flag) ? "default" : "outline"}
              size="sm"
              onClick={() => toggleFlag(flag)}
            >
              <code className="mr-1">{flag}</code> {label}
            </Button>
          ))}
        </div>

        {/* Presets */}
        <div className="flex gap-2 flex-wrap">
          {presets.map((preset) => (
            <Button
              key={preset.label}
              variant="ghost"
              size="sm"
              onClick={() => setPattern(preset.pattern)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Error Display */}
      {result.error && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
          <AlertCircle className="size-5 shrink-0" />
          <span className="font-mono text-sm">{result.error}</span>
        </div>
      )}

      {/* Test String */}
      <div className="space-y-3">
        <label className="text-lg font-bold block">Test String</label>
        <textarea
          value={testString}
          onChange={(e) => setTestString(e.target.value)}
          placeholder="Enter text to test against..."
          className="w-full min-h-[150px] p-4 rounded-lg border bg-background font-mono text-base resize-y focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Highlighted Result */}
      {testString && pattern && result.valid && (
        <div className="space-y-3">
          <label className="text-lg font-bold block">Highlighted Matches</label>
          <div className="p-4 rounded-lg border bg-card font-mono text-base whitespace-pre-wrap break-all">
            {typeof highlightedText === "string" ? (
              highlightedText
            ) : (
              highlightedText.map((part, i) =>
                part.isMatch ? (
                  <mark
                    key={i}
                    className="bg-primary/30 text-foreground rounded px-0.5"
                  >
                    {part.text}
                  </mark>
                ) : (
                  <span key={i}>{part.text}</span>
                )
              )
            )}
          </div>
        </div>
      )}

      {/* Match Results */}
      {result.matches.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-lg font-bold">
              {result.matches.length} Match{result.matches.length !== 1 ? "es" : ""}
            </label>
            <Button variant="outline" size="sm" onClick={copyPattern}>
              {copied ? (
                <>
                  <Check className="size-4 mr-2" /> Copied!
                </>
              ) : (
                <>
                  <Copy className="size-4 mr-2" /> Copy pattern
                </>
              )}
            </Button>
          </div>
          <div className="grid gap-2">
            {result.matches.map((match, index) => (
              <div
                key={index}
                className="p-3 rounded-lg border bg-card font-mono text-sm"
              >
                <div className="flex items-center gap-4">
                  <span className="text-muted-foreground">#{index + 1}</span>
                  <span className="font-bold">{match.match}</span>
                  <span className="text-muted-foreground text-xs">
                    index: {match.index}
                  </span>
                </div>
                {match.groups.length > 0 && (
                  <div className="mt-2 pt-2 border-t text-xs">
                    <span className="text-muted-foreground">Groups: </span>
                    {match.groups.map((g, i) => (
                      <span key={i} className="mr-2">
                        ${i + 1}: <strong>{g}</strong>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
