"use client";

import { useState } from "react";
import { Copy, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

function sentenceCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/(^\s*\w|[.!?]+\s*\w)/g, (c) => c.toUpperCase());
}

function capitalizedCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

function alternatingCase(str: string): string {
  return [...str]
    .map((c, i) => (i % 2 === 0 ? c.toLowerCase() : c.toUpperCase()))
    .join("");
}

function inverseCase(str: string): string {
  return [...str]
    .map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
    .join("");
}

export function TextCaseConverterTool() {
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  const cases: { label: string; transform: (s: string) => string }[] = [
    { label: "Sentence case", transform: sentenceCase },
    { label: "lower case", transform: (s) => s.toLowerCase() },
    { label: "UPPER CASE", transform: (s) => s.toUpperCase() },
    { label: "Capitalized Case", transform: capitalizedCase },
    { label: "aLtErNaTiNg cAsE", transform: alternatingCase },
    { label: "InVeRsE CaSe", transform: inverseCase },
  ];

  const copyText = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="border-2 border-border">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Start typing or paste your text here..."
        className="w-full min-h-[300px] p-4 bg-background text-base resize-y focus:outline-none border-0"
      />

      <div className="flex flex-wrap items-stretch border-t border-border">
        {cases.map(({ label, transform }, i) => (
          <Button
            key={label}
            variant="outline"
            onClick={() => setText(transform(text))}
            disabled={!text}
            className={`h-14 flex-1 border-0 text-base ${i < cases.length - 1 ? "border-r border-border" : ""}`}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="flex items-stretch border-t border-border">
        <Button
          variant="outline"
          onClick={() => setText("")}
          disabled={!text}
          className="h-14 flex-1 border-0 border-r border-border text-base"
        >
          <Trash2 className="size-4 mr-2" />
          Clear
        </Button>
        <Button
          variant="outline"
          onClick={copyText}
          disabled={!text}
          className="h-14 flex-1 border-0 text-base"
        >
          {copied ? (
            <>
              <Check className="size-4 mr-2" /> Copied!
            </>
          ) : (
            <>
              <Copy className="size-4 mr-2" /> Copy
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
