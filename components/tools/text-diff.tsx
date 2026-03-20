"use client";

import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type DiffOp = "equal" | "remove" | "add";

interface DiffLine {
  op: DiffOp;
  leftLine?: number;
  rightLine?: number;
  leftText: string;
  rightText: string;
}

export function TextDiffTool() {
  const [leftText, setLeftText] = useState("");
  const [rightText, setRightText] = useState("");
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [wordWrap, setWordWrap] = useState(true);
  const [copied, setCopied] = useState(false);

  const diff = useMemo(() => {
    return computeLineDiff(leftText, rightText, { ignoreWhitespace, ignoreCase });
  }, [leftText, rightText, ignoreWhitespace, ignoreCase]);

  const changedLines = useMemo(() => {
    return diff.filter((line) => line.op !== "equal");
  }, [diff]);

  const copyChangedLines = async () => {
    const payload = changedLines
      .map((line) => {
        if (line.op === "remove") {
          return `- ${line.leftText}`;
        }

        return `+ ${line.rightText}`;
      })
      .join("\n");

    if (!payload) {
      return;
    }

    await navigator.clipboard.writeText(payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const lineClass = (op: DiffOp, side: "left" | "right") => {
    if (op === "equal") {
      return "bg-transparent";
    }

    if (op === "remove") {
      return side === "left" ? "bg-red-500/15" : "bg-red-500/5";
    }

    return side === "right" ? "bg-emerald-500/15" : "bg-emerald-500/5";
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="left-input" className="text-base font-semibold">Original text</Label>
          <textarea
            id="left-input"
            value={leftText}
            onChange={(e) => setLeftText(e.target.value)}
            placeholder="Paste the original text"
            className="w-full min-h-[220px] rounded-lg border bg-background p-4 font-mono text-sm resize-y"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="right-input" className="text-base font-semibold">Updated text</Label>
          <textarea
            id="right-input"
            value={rightText}
            onChange={(e) => setRightText(e.target.value)}
            placeholder="Paste the updated text"
            className="w-full min-h-[220px] rounded-lg border bg-background p-4 font-mono text-sm resize-y"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex items-center justify-between rounded-lg border bg-card px-3 py-2">
          <span className="text-sm">Ignore whitespace</span>
          <Switch checked={ignoreWhitespace} onCheckedChange={setIgnoreWhitespace} />
        </label>
        <label className="flex items-center justify-between rounded-lg border bg-card px-3 py-2">
          <span className="text-sm">Ignore casing</span>
          <Switch checked={ignoreCase} onCheckedChange={setIgnoreCase} />
        </label>
        <label className="flex items-center justify-between rounded-lg border bg-card px-3 py-2">
          <span className="text-sm">Word wrap</span>
          <Switch checked={wordWrap} onCheckedChange={setWordWrap} />
        </label>
        <Button variant="outline" onClick={copyChangedLines} disabled={changedLines.length === 0}>
          {copied ? <Check className="size-4 mr-2" /> : <Copy className="size-4 mr-2" />}
          Copy changed lines ({changedLines.length})
        </Button>
      </div>

      <Tabs defaultValue="side-by-side" className="space-y-3">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="side-by-side">Side-by-side</TabsTrigger>
          <TabsTrigger value="inline">Inline</TabsTrigger>
        </TabsList>

        <TabsContent value="side-by-side">
          <div className="rounded-lg border overflow-hidden">
            <div className="grid grid-cols-2 border-b bg-muted/40 text-xs font-semibold uppercase tracking-wide">
              <div className="px-3 py-2">Original</div>
              <div className="px-3 py-2 border-l">Updated</div>
            </div>
            <div className="max-h-[480px] overflow-auto">
              {diff.map((line, index) => (
                <div key={`${index}-${line.leftLine ?? "n"}-${line.rightLine ?? "n"}`} className="grid grid-cols-2 font-mono text-sm">
                  <div className={`px-3 py-1 border-r ${lineClass(line.op, "left")}`}>
                    <span className="text-muted-foreground mr-3 select-none">{line.leftLine ?? ""}</span>
                    <span className={wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"}>{line.leftText || " "}</span>
                  </div>
                  <div className={`px-3 py-1 ${lineClass(line.op, "right")}`}>
                    <span className="text-muted-foreground mr-3 select-none">{line.rightLine ?? ""}</span>
                    <span className={wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"}>{line.rightText || " "}</span>
                  </div>
                </div>
              ))}
              {diff.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">Add text in either panel to compare changes.</p>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="inline">
          <div className="rounded-lg border max-h-[480px] overflow-auto">
            {diff.map((line, index) => {
              const symbol = line.op === "equal" ? " " : line.op === "add" ? "+" : "-";
              const text = line.op === "remove" ? line.leftText : line.rightText;
              const lineNo = line.op === "remove" ? line.leftLine : line.rightLine;

              return (
                <div key={`inline-${index}`} className={`px-3 py-1 font-mono text-sm ${line.op === "equal" ? "" : line.op === "add" ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                  <span className="text-muted-foreground select-none mr-2">{lineNo ?? ""}</span>
                  <span className="select-none mr-2">{symbol}</span>
                  <span className={wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"}>{text || " "}</span>
                </div>
              );
            })}
            {diff.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">No diff to display yet.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function normalizeLine(line: string, options: { ignoreWhitespace: boolean; ignoreCase: boolean }) {
  let value = line;

  if (options.ignoreWhitespace) {
    value = value.replace(/\s+/g, " ").trim();
  }

  if (options.ignoreCase) {
    value = value.toLowerCase();
  }

  return value;
}

function computeLineDiff(
  leftText: string,
  rightText: string,
  options: { ignoreWhitespace: boolean; ignoreCase: boolean }
): DiffLine[] {
  const left = leftText.split("\n");
  const right = rightText.split("\n");

  const a = leftText.length > 0 ? left : [];
  const b = rightText.length > 0 ? right : [];

  const normalizedA = a.map((line) => normalizeLine(line, options));
  const normalizedB = b.map((line) => normalizeLine(line, options));

  const dp = Array.from({ length: normalizedA.length + 1 }, () =>
    Array.from({ length: normalizedB.length + 1 }, () => 0)
  );

  for (let i = normalizedA.length - 1; i >= 0; i -= 1) {
    for (let j = normalizedB.length - 1; j >= 0; j -= 1) {
      if (normalizedA[i] === normalizedB[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (normalizedA[i] === normalizedB[j]) {
      result.push({
        op: "equal",
        leftLine: i + 1,
        rightLine: j + 1,
        leftText: a[i],
        rightText: b[j],
      });
      i += 1;
      j += 1;
      continue;
    }

    if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({
        op: "remove",
        leftLine: i + 1,
        leftText: a[i],
        rightText: "",
      });
      i += 1;
    } else {
      result.push({
        op: "add",
        rightLine: j + 1,
        leftText: "",
        rightText: b[j],
      });
      j += 1;
    }
  }

  while (i < a.length) {
    result.push({
      op: "remove",
      leftLine: i + 1,
      leftText: a[i],
      rightText: "",
    });
    i += 1;
  }

  while (j < b.length) {
    result.push({
      op: "add",
      rightLine: j + 1,
      leftText: "",
      rightText: b[j],
    });
    j += 1;
  }

  return result;
}
