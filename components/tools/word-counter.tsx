"use client";

import { useState, useMemo } from "react";
import { Copy, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WordCounterTool() {
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  const stats = useMemo(() => {
    const trimmed = text.trim();

    // Words - split by whitespace and filter empty
    const words = trimmed ? trimmed.split(/\s+/).filter(Boolean) : [];

    // Characters
    const characters = text.length;
    const charactersNoSpaces = text.replace(/\s/g, "").length;

    // Sentences - split by sentence-ending punctuation
    const sentences = trimmed
      ? trimmed.split(/[.!?]+/).filter((s) => s.trim().length > 0)
      : [];

    // Paragraphs - split by double newlines or more
    const paragraphs = trimmed
      ? trimmed.split(/\n\s*\n/).filter((p) => p.trim().length > 0)
      : [];

    // Lines
    const lines = text ? text.split(/\n/) : [];

    // Reading time (average 200 words per minute)
    const readingTimeMinutes = words.length / 200;
    const readingTime =
      readingTimeMinutes < 1
        ? `${Math.ceil(readingTimeMinutes * 60)} sec`
        : `${Math.ceil(readingTimeMinutes)} min`;

    // Speaking time (average 150 words per minute)
    const speakingTimeMinutes = words.length / 150;
    const speakingTime =
      speakingTimeMinutes < 1
        ? `${Math.ceil(speakingTimeMinutes * 60)} sec`
        : `${Math.ceil(speakingTimeMinutes)} min`;

    return {
      words: words.length,
      characters,
      charactersNoSpaces,
      sentences: sentences.length,
      paragraphs: paragraphs.length,
      lines: lines.length,
      readingTime,
      speakingTime,
    };
  }, [text]);

  const copyStats = async () => {
    const statsText = `Words: ${stats.words}
Characters: ${stats.characters}
Characters (no spaces): ${stats.charactersNoSpaces}
Sentences: ${stats.sentences}
Paragraphs: ${stats.paragraphs}
Lines: ${stats.lines}
Reading time: ${stats.readingTime}
Speaking time: ${stats.speakingTime}`;

    await navigator.clipboard.writeText(statsText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="border-2 border-border">
      {/* Primary stats — 4-cell flush grid */}
      <div className="segmented grid-cols-4 border-x-0 border-t-0">
        <div className="flex flex-col items-center justify-center px-4 py-5 bg-card">
          <div className="text-4xl font-bold">{stats.words}</div>
          <div className="text-sm text-muted-foreground mt-1">Words</div>
        </div>
        <div className="flex flex-col items-center justify-center px-4 py-5 bg-card">
          <div className="text-4xl font-bold">{stats.characters}</div>
          <div className="text-sm text-muted-foreground mt-1">Characters</div>
        </div>
        <div className="flex flex-col items-center justify-center px-4 py-5 bg-card">
          <div className="text-4xl font-bold">{stats.sentences}</div>
          <div className="text-sm text-muted-foreground mt-1">Sentences</div>
        </div>
        <div className="flex flex-col items-center justify-center px-4 py-5 bg-card">
          <div className="text-4xl font-bold">{stats.paragraphs}</div>
          <div className="text-sm text-muted-foreground mt-1">Paragraphs</div>
        </div>
      </div>

      {/* Textarea */}
      <div className="border-b-2 border-border">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Start typing or paste your text here..."
          className="w-full min-h-[300px] p-4 bg-background text-base resize-y focus:outline-none border-0"
        />
      </div>

      {/* Secondary stats — 4-cell flush table row */}
      <div className="segmented grid-cols-4 border-x-0 border-t-0">
        <div className="flex flex-col px-4 py-4 bg-card">
          <div className="text-sm text-muted-foreground">No spaces</div>
          <div className="text-2xl font-bold">{stats.charactersNoSpaces}</div>
        </div>
        <div className="flex flex-col px-4 py-4 bg-card">
          <div className="text-sm text-muted-foreground">Lines</div>
          <div className="text-2xl font-bold">{stats.lines}</div>
        </div>
        <div className="flex flex-col px-4 py-4 bg-card">
          <div className="text-sm text-muted-foreground">Reading time</div>
          <div className="text-2xl font-bold">{stats.readingTime}</div>
        </div>
        <div className="flex flex-col px-4 py-4 bg-card">
          <div className="text-sm text-muted-foreground">Speaking time</div>
          <div className="text-2xl font-bold">{stats.speakingTime}</div>
        </div>
      </div>

      {/* Action bar */}
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
          onClick={copyStats}
          disabled={!text}
          className="h-14 flex-1 border-0 text-base"
        >
          {copied ? (
            <>
              <Check className="size-4 mr-2" /> Copied!
            </>
          ) : (
            <>
              <Copy className="size-4 mr-2" /> Copy Stats
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
