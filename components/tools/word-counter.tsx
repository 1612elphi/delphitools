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
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border bg-card text-center">
          <div className="text-4xl font-bold">{stats.words}</div>
          <div className="text-sm text-muted-foreground mt-1">Words</div>
        </div>
        <div className="p-4 rounded-lg border bg-card text-center">
          <div className="text-4xl font-bold">{stats.characters}</div>
          <div className="text-sm text-muted-foreground mt-1">Characters</div>
        </div>
        <div className="p-4 rounded-lg border bg-card text-center">
          <div className="text-4xl font-bold">{stats.sentences}</div>
          <div className="text-sm text-muted-foreground mt-1">Sentences</div>
        </div>
        <div className="p-4 rounded-lg border bg-card text-center">
          <div className="text-4xl font-bold">{stats.paragraphs}</div>
          <div className="text-sm text-muted-foreground mt-1">Paragraphs</div>
        </div>
      </div>

      {/* Text Area */}
      <div className="space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Start typing or paste your text here..."
          className="w-full min-h-[300px] p-4 rounded-lg border bg-background text-base resize-y focus:outline-none focus:ring-2 focus:ring-ring"
        />

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => setText("")}
            disabled={!text}
          >
            <Trash2 className="size-4 mr-2" />
            Clear
          </Button>
          <Button
            variant="outline"
            onClick={copyStats}
            disabled={!text}
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

      {/* Additional Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border bg-card">
          <div className="text-sm text-muted-foreground">No spaces</div>
          <div className="text-2xl font-bold">{stats.charactersNoSpaces}</div>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <div className="text-sm text-muted-foreground">Lines</div>
          <div className="text-2xl font-bold">{stats.lines}</div>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <div className="text-sm text-muted-foreground">Reading time</div>
          <div className="text-2xl font-bold">{stats.readingTime}</div>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <div className="text-sm text-muted-foreground">Speaking time</div>
          <div className="text-2xl font-bold">{stats.speakingTime}</div>
        </div>
      </div>
    </div>
  );
}
