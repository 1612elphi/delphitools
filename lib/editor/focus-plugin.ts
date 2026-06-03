// A single plugin that produces the selection-driven focus decorations:
// current-sentence highlight, current-paragraph highlight, and dim-inactive.
// Settings live in the plugin state and are updated via setMeta(focusKey, …).
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { DEFAULT_SETTINGS, type EditorSettings } from "./settings";

export const focusKey = new PluginKey<EditorSettings>("editorFocus");

interface SegmenterCtor {
  new (locale: string, options: { granularity: "sentence" }): {
    segment: (input: string) => Iterable<{ index: number; segment: string }>;
  };
}

function segmentSentences(text: string): Array<[number, number]> {
  const Segmenter = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;
  if (Segmenter) {
    const out: Array<[number, number]> = [];
    for (const s of new Segmenter("en", { granularity: "sentence" }).segment(text)) {
      out.push([s.index, s.index + s.segment.length]);
    }
    return out;
  }
  // Fallback: split on sentence-ending punctuation, keeping trailing space.
  const out: Array<[number, number]> = [];
  const re = /[^.!?]*[.!?]+[\s]*|[^.!?]+$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    out.push([m.index, m.index + m[0].length]);
  }
  return out.length ? out : [[0, text.length]];
}

function sentenceAt(text: string, caret: number): [number, number] {
  for (const [s, e] of segmentSentences(text)) {
    if (caret >= s && caret <= e) return [s, e];
  }
  return [0, text.length];
}

function buildDecorations(state: EditorState, settings: EditorSettings): DecorationSet {
  const decos: Decoration[] = [];
  const { selection } = state;
  const $from = selection.$from;
  const activeStart = $from.depth >= 1 ? $from.before(1) : -1;

  if (activeStart >= 0 && (settings.highlightParagraph || settings.dimInactive)) {
    const activeEnd = $from.after(1);
    if (settings.highlightParagraph) {
      decos.push(Decoration.node(activeStart, activeEnd, { class: "pm-para-active" }));
    }
    if (settings.dimInactive) {
      state.doc.forEach((node, offset) => {
        if (offset !== activeStart) {
          decos.push(Decoration.node(offset, offset + node.nodeSize, { class: "pm-dim" }));
        }
      });
    }
  }

  if (settings.highlightSentence && $from.parent.isTextblock) {
    const blockStart = $from.start();
    const blockEnd = $from.end();
    const caret = selection.from - blockStart;
    const [s, e] = sentenceAt($from.parent.textContent, caret);
    const from = Math.max(blockStart, Math.min(blockStart + s, blockEnd));
    const to = Math.max(blockStart, Math.min(blockStart + e, blockEnd));
    if (to > from) decos.push(Decoration.inline(from, to, { class: "pm-sentence-active" }));
  }

  return DecorationSet.create(state.doc, decos);
}

export function focusPlugin(initial: EditorSettings = DEFAULT_SETTINGS): Plugin<EditorSettings> {
  return new Plugin<EditorSettings>({
    key: focusKey,
    state: {
      init: () => initial,
      apply: (tr, value) => (tr.getMeta(focusKey) as EditorSettings | undefined) ?? value,
    },
    props: {
      decorations(state) {
        const settings = focusKey.getState(state) ?? DEFAULT_SETTINGS;
        return buildDecorations(state, settings);
      },
    },
  });
}
