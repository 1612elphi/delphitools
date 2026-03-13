"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Download, Check, Loader2 } from "lucide-react";
import {
  tokenise,
  reResolveTokens,
  setCoreDictionary,
  setFullDictionary,
  type GlossToken,
  type Dictionary,
} from "@/lib/shavian/transliterate";
import { getAlternatives, type Alternative } from "@/lib/shavian/alternatives";
import { getShavianLetter } from "@/lib/shavian/phoneme-map";

// Load Shavian font via CSS
const shavianFontFace = `
@font-face {
  font-family: 'Noto Sans Shavian';
  src: url('/fonts/NotoSansShavian-Regular.woff2') format('woff2');
  font-display: swap;
}
`;

function parseDictJson(json: Record<string, string[]>): Dictionary {
  const map = new Map<string, string[]>();
  for (const [word, phonemes] of Object.entries(json)) {
    map.set(word, phonemes);
  }
  return map;
}

export function ShavianTransliteratorTool() {
  const DEFAULT_TEXT = "In honour of the truth, as an emblem of our goodwill";

  const [input, setInput] = useState(DEFAULT_TEXT);
  const [tokens, setTokens] = useState<GlossToken[]>([]);
  const [dictStatus, setDictStatus] = useState<"loading-core" | "loading-full" | "ready">("loading-core");
  const [copied, setCopied] = useState(false);
  const [activePopover, setActivePopover] = useState<{ wordIdx: number; phonemeIdx: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef(input);
  inputRef.current = input;

  // Inject font face
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = shavianFontFace;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // Load core dictionary on mount
  useEffect(() => {
    import("@/lib/shavian/dictionary-core.json").then((mod) => {
      const dict = parseDictJson(mod.default as Record<string, string[]>);
      setCoreDictionary(dict);
      setDictStatus("loading-full");

      // Re-tokenise if there's existing input
      if (inputRef.current) {
        setTokens(tokenise(inputRef.current));
      }
    });
  }, []);

  // Load full dictionary in background
  useEffect(() => {
    if (dictStatus !== "loading-full") return;

    fetch("/data/shavian-dictionary-full.json")
      .then((res) => res.json())
      .then((json) => {
        const dict = parseDictJson(json);
        setFullDictionary(dict);
        setDictStatus("ready");

        // Re-resolve any heuristic words
        setTokens((prev) => reResolveTokens(prev));
      })
      .catch((err) => {
        console.error("Failed to load full dictionary:", err);
        setDictStatus("ready"); // Degrade gracefully
      });
  }, [dictStatus]);

  // Transliterate on input change
  const handleInput = useCallback((text: string) => {
    setInput(text);
    setTokens(tokenise(text));
    setActivePopover(null);
  }, []);

  // Toggle namer dot on a word
  const toggleNamer = useCallback((wordIdx: number) => {
    setTokens((prev) => {
      const next = [...prev];
      const wordTokens = next.filter((t) => t.type === "word");
      const token = wordTokens[wordIdx];
      if (!token?.gloss) return prev;

      const newIsNamer = !token.gloss.isNamer;
      const namerPrefix = newIsNamer ? "·" : "";

      token.gloss = {
        ...token.gloss,
        isNamer: newIsNamer,
        shavian: namerPrefix + token.gloss.phonemes.map((p) => p.shavian).join(""),
      };

      return next;
    });
  }, []);

  // Swap a phoneme for a word
  const swapPhoneme = useCallback(
    (wordIdx: number, phonemeIdx: number, alt: Alternative) => {
      setTokens((prev) => {
        const next = [...prev];
        const wordTokens = next.filter((t) => t.type === "word");
        const token = wordTokens[wordIdx];
        if (!token?.gloss) return prev;

        const newPhonemes = [...token.gloss.phonemes];
        newPhonemes[phonemeIdx] = {
          shavian: alt.shavian,
          ipa: alt.ipa,
          alternatives: getAlternatives(alt.shavian),
        };

        const isNamer = token.gloss.isNamer;
        const namerPrefix = isNamer ? "·" : "";

        token.gloss = {
          ...token.gloss,
          phonemes: newPhonemes,
          shavian: namerPrefix + newPhonemes.map((p) => p.shavian).join(""),
          ipa: newPhonemes.map((p) => p.ipa).join(""),
          userEdited: true,
        };

        return next;
      });
      setActivePopover(null);
    },
    []
  );

  // Copy Shavian text
  const copyShavian = useCallback(() => {
    const shavianText = tokens
      .map((t) => {
        if (t.type === "word" && t.gloss) return t.gloss.shavian;
        return t.value;
      })
      .join("");

    navigator.clipboard.writeText(shavianText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [tokens]);

  // Close popover on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setActivePopover(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Count word tokens for indexing
  const wordTokenIndices = useMemo(() => {
    const indices: number[] = [];
    tokens.forEach((t, i) => {
      if (t.type === "word") indices.push(i);
    });
    return indices;
  }, [tokens]);

  const hasContent = tokens.some((t) => t.type === "word");

  return (
    <div className="space-y-6">
      {/* Explanation */}
      <div className="text-sm text-muted-foreground space-y-1">
        <p>
          The <strong className="text-foreground">Shavian alphabet</strong> (𐑖𐑱𐑝𐑾𐑯) is a phonemic writing system designed for English by Kingsley Read, commissioned by the will of George Bernard Shaw. Each letter represents exactly one sound — no silent letters, no ambiguous spellings.
        </p>
        <p>
          Type or paste English text below. Click individual Shavian letters to swap phonemes, and click a Latin word to mark it as a proper noun (adds the namer dot ·).
        </p>
      </div>

      {/* Input */}
      <Textarea
        placeholder="Type or paste English text here..."
        value={input}
        onChange={(e) => handleInput(e.target.value)}
        className="min-h-[100px] text-base"
      />

      {/* Gloss Grid */}
      {hasContent && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex flex-wrap gap-x-5 gap-y-3 items-start">
            {tokens.map((token, tokenIdx) => {
              if (token.type === "whitespace") {
                return <div key={tokenIdx} className="w-2" />;
              }
              if (token.type === "punctuation") {
                return (
                  <span key={tokenIdx} className="text-muted-foreground text-lg self-center">
                    {token.value}
                  </span>
                );
              }
              if (!token.gloss) return null;

              const wordIdx = wordTokenIndices.indexOf(tokenIdx);
              const gloss = token.gloss;

              return (
                <div key={tokenIdx} className="flex flex-col items-start gap-0.5">
                  {/* Latin row — click to toggle namer dot */}
                  <button
                    onClick={() => toggleNamer(wordIdx)}
                    className={`text-sm px-1 rounded transition-colors cursor-pointer hover:bg-accent ${
                      gloss.isNamer ? "text-orange-400 font-medium" : "text-muted-foreground"
                    }`}
                    title={gloss.isNamer ? "Remove namer dot (proper noun)" : "Add namer dot (proper noun)"}
                  >
                    {gloss.isNamer ? "·" : ""}{gloss.latin}
                  </button>

                  {/* Shavian row — per-letter clickable */}
                  <div className="flex gap-px">
                    {gloss.phonemes.map((phoneme, pIdx) => {
                      const isActive =
                        activePopover?.wordIdx === wordIdx &&
                        activePopover?.phonemeIdx === pIdx;

                      return (
                        <div key={pIdx} className="relative">
                          <button
                            onClick={() =>
                              setActivePopover(
                                isActive ? null : { wordIdx, phonemeIdx: pIdx }
                              )
                            }
                            className={`
                              text-[22px] leading-tight px-1 py-0.5 rounded
                              transition-all cursor-pointer
                              hover:bg-accent hover:-translate-y-0.5
                              ${isActive ? "bg-accent ring-2 ring-primary -translate-y-0.5" : ""}
                              ${gloss.isNamer ? "text-orange-400" : "text-foreground"}
                              ${gloss.source === "heuristic" && !gloss.userEdited ? "border-b-2 border-dashed border-destructive" : ""}
                            `}
                            style={{ fontFamily: "'Noto Sans Shavian', sans-serif" }}
                          >
                            {phoneme.shavian}
                          </button>

                          {/* Popover */}
                          {isActive && (
                            <div
                              ref={popoverRef}
                              className="absolute top-full left-0 z-50 mt-1 min-w-[180px] rounded-lg border bg-popover p-1.5 shadow-lg"
                            >
                              {/* Current selection */}
                              <div className="flex items-center gap-2.5 px-2.5 py-1.5 rounded bg-accent/50 border-l-2 border-primary mb-1">
                                <span
                                  className="text-xl w-7 text-center"
                                  style={{ fontFamily: "'Noto Sans Shavian', sans-serif" }}
                                >
                                  {phoneme.shavian}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {getShavianLetter(phoneme.shavian)?.name ?? ""}
                                </span>
                                <span className="text-xs text-green-500 ml-auto">
                                  /{phoneme.ipa}/
                                </span>
                              </div>

                              {/* Alternatives */}
                              {phoneme.alternatives.map((alt, aIdx) => (
                                <button
                                  key={aIdx}
                                  onClick={() => swapPhoneme(wordIdx, pIdx, alt)}
                                  className="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded text-left hover:bg-accent transition-colors cursor-pointer"
                                >
                                  <span
                                    className="text-xl w-7 text-center"
                                    style={{ fontFamily: "'Noto Sans Shavian', sans-serif" }}
                                  >
                                    {alt.shavian}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {alt.name}
                                  </span>
                                  <span className="text-xs text-green-500 ml-auto">
                                    /{alt.ipa}/
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* IPA row — per-letter aligned */}
                  <div className="flex gap-px">
                    {gloss.phonemes.map((phoneme, pIdx) => (
                      <span
                        key={pIdx}
                        className="text-[13px] text-green-500 px-1 min-w-[20px]"
                      >
                        {phoneme.ipa}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Status bar */}
          <div className="flex items-center gap-4 mt-4 pt-4 border-t text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Dictionary match
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-destructive" />
              Heuristic guess
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-orange-400" />
              Proper noun
            </span>
            {dictStatus === "loading-core" && (
              <span className="flex items-center gap-1.5 ml-auto">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading dictionary...
              </span>
            )}
            {dictStatus === "loading-full" && (
              <span className="flex items-center gap-1.5 ml-auto">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading full dictionary...
              </span>
            )}
            {dictStatus === "ready" && (
              <span className="ml-auto text-green-500">Dictionary ready</span>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      {hasContent && (
        <div className="flex gap-2">
          <Button onClick={copyShavian} className="gap-2">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copied!" : "Copy Shavian"}
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => exportGloss(tokens)}>
            <Download className="w-4 h-4" />
            Export Gloss
          </Button>
        </div>
      )}
    </div>
  );
}

async function exportGloss(tokens: GlossToken[]) {
  const CANVAS_WIDTH = 1200;
  const PADDING = 40;
  const WORD_GAP = 24;
  const LINE_HEIGHT = 80;
  const CONTENT_WIDTH = CANVAS_WIDTH - PADDING * 2;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  // Ensure Shavian font is loaded
  await document.fonts.ready;

  // Detect theme
  const isDark = document.documentElement.classList.contains("dark") ||
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const BG_COLOR = isDark ? "#0a0a0a" : "#ffffff";
  const LATIN_COLOR = isDark ? "#8888aa" : "#666688";
  const SHAVIAN_COLOR = isDark ? "#e8e8ff" : "#1a1a2e";
  const IPA_COLOR = isDark ? "#66cc88" : "#227744";
  const BRAND_COLOR = isDark ? "#555" : "#aaa";

  // Measure words and compute line breaks
  const measurements: { token: GlossToken; width: number }[] = [];

  ctx.font = "14px system-ui";
  for (const token of tokens) {
    if (token.type === "word" && token.gloss) {
      const latinWidth = ctx.measureText(token.gloss.latin).width;
      ctx.font = "22px 'Noto Sans Shavian', sans-serif";
      const shavianText = token.gloss.phonemes.map((p) => p.shavian).join("");
      const shavianWidth = ctx.measureText(shavianText).width;
      ctx.font = "13px system-ui";
      const ipaWidth = ctx.measureText(token.gloss.ipa).width;
      ctx.font = "14px system-ui";
      const width = Math.max(latinWidth, shavianWidth, ipaWidth);
      measurements.push({ token, width });
    } else if (token.type === "punctuation") {
      const width = ctx.measureText(token.value).width;
      measurements.push({ token, width });
    }
  }

  // Compute line breaks
  const lines: typeof measurements[] = [];
  let currentLine: typeof measurements = [];
  let currentWidth = 0;

  for (const m of measurements) {
    if (currentWidth + m.width + WORD_GAP > CONTENT_WIDTH && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = [m];
      currentWidth = m.width;
    } else {
      currentLine.push(m);
      currentWidth += m.width + WORD_GAP;
    }
  }
  if (currentLine.length > 0) lines.push(currentLine);

  // Set canvas size
  const BRANDING_HEIGHT = 40;
  canvas.width = CANVAS_WIDTH;
  canvas.height = PADDING + lines.length * LINE_HEIGHT + BRANDING_HEIGHT + PADDING;

  // Background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Render lines
  let y = PADDING;
  for (const line of lines) {
    let x = PADDING;
    for (const { token } of line) {
      // Punctuation tokens — render inline at Shavian row height
      if (token.type === "punctuation") {
        ctx.font = "18px system-ui";
        ctx.fillStyle = LATIN_COLOR;
        ctx.textAlign = "left";
        ctx.fillText(token.value, x, y + 42);
        x += ctx.measureText(token.value).width + 4;
        continue;
      }

      const gloss = token.gloss!;

      // Latin row
      ctx.font = "14px system-ui";
      ctx.fillStyle = LATIN_COLOR;
      ctx.textAlign = "left";
      ctx.fillText(gloss.latin, x, y + 14);

      // Shavian row (render namer dot if present)
      ctx.font = "22px 'Noto Sans Shavian', sans-serif";
      ctx.fillStyle = gloss.isNamer ? "#ff9f43" : SHAVIAN_COLOR;
      const shavianText = gloss.phonemes.map((p) => p.shavian).join("");
      const namerPrefix = gloss.isNamer ? "·" : "";
      ctx.fillText(namerPrefix + shavianText, x, y + 42);

      // IPA row
      ctx.font = "13px system-ui";
      ctx.fillStyle = IPA_COLOR;
      ctx.fillText(gloss.ipa, x, y + 62);

      const latinWidth = ctx.measureText(gloss.latin).width;
      ctx.font = "22px 'Noto Sans Shavian', sans-serif";
      const shavianWidth = ctx.measureText(namerPrefix + shavianText).width;
      const width = Math.max(latinWidth, shavianWidth) + WORD_GAP;
      x += width;
    }
    y += LINE_HEIGHT;
  }

  // Branding
  ctx.font = "12px system-ui";
  ctx.fillStyle = BRAND_COLOR;
  ctx.textAlign = "right";
  ctx.fillText("delphi.tools", CANVAS_WIDTH - PADDING, canvas.height - PADDING + 8);

  // Download
  const link = document.createElement("a");
  link.download = "shavian-gloss.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}
