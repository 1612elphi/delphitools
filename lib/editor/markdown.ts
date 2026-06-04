// Markdown is the single source of truth. Custom MarkdownParser + serializer
// (seeded from prosemirror-markdown's defaults, then extended for GFM), bound
// to the extended schema. Public API (parseMarkdown / serializeDoc) unchanged.
import MarkdownIt from "markdown-it";
import footnotePlugin from "markdown-it-footnote";
import {
  MarkdownParser,
  MarkdownSerializer,
  defaultMarkdownParser as dP,
  defaultMarkdownSerializer as dS,
} from "prosemirror-markdown";
import type { Attrs, Node as PMNode, NodeType } from "prosemirror-model";
import { schema } from "./schema";

type Token = ReturnType<MarkdownIt["parse"]>[number];

// Footnote bodies, keyed by id, captured during tokenisation (see extractFootnotes)
// and stitched into the inline footnote nodes by the footnote_ref handler below.
let footnoteBodies = new Map<number, Token[]>();

// GFM task lists without a dependency: a tiny core rule that lifts a leading
// "[ ] " / "[x] " off the first line of a list item onto a `checked` token attr.
function taskListRule(md: MarkdownIt) {
  md.core.ruler.after("inline", "task-lists", (state) => {
    const tokens = state.tokens;
    for (let i = 2; i < tokens.length; i++) {
      if (tokens[i].type !== "inline") continue;
      if (tokens[i - 1].type !== "paragraph_open" || tokens[i - 2].type !== "list_item_open") continue;
      const m = /^\[( |x|X)\]\s/.exec(tokens[i].content);
      if (!m) continue;
      tokens[i - 2].attrSet("checked", m[1] === " " ? "false" : "true");
      const n = m[0].length; // slice the FULL match incl. trailing space, or round-trip doubles it
      tokens[i].content = tokens[i].content.slice(n);
      const child = tokens[i].children?.[0];
      if (child && child.type === "text") child.content = child.content.slice(n);
    }
    return true;
  });
}

// markdown-it-footnote keeps [^id] references inline but collects the definition
// bodies into a trailing block run. We capture each body (keyed by id) and STRIP
// that run from the stream, so the bodies don't leak into the doc as paragraphs;
// the footnote_ref handler then stitches each body into its inline node.
function extractFootnotes(md: MarkdownIt) {
  md.core.ruler.push("extract-footnotes", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== "footnote_block_open") continue;
      let id: number | null = null;
      let buf: Token[] = [];
      let j = i;
      for (; j < tokens.length; j++) {
        const t = tokens[j];
        if (t.type === "footnote_open") {
          id = (t.meta?.id ?? null) as number | null;
          buf = [];
        } else if (t.type === "footnote_close") {
          if (id != null) footnoteBodies.set(id, buf);
          id = null;
        } else if (id !== null && t.type !== "footnote_anchor") {
          buf.push(t);
        }
        if (t.type === "footnote_block_close") {
          j++;
          break;
        }
      }
      tokens.splice(i, j - i); // drop the whole definitions block
      break; // only one footnote_block run, at the end
    }
    return true;
  });
}

const alignFromStyle = (s: string | null): string | null =>
  s?.match(/text-align:\s*(left|center|right)/)?.[1] ?? null;

const md = new MarkdownIt("commonmark", { html: false })
  .enable(["strikethrough", "table"]) // core rules, off in the commonmark preset
  .set({ linkify: true })
  .enable("linkify") // bare URLs → ordinary link tokens
  .use(taskListRule)
  .use(footnotePlugin)
  .use(extractFootnotes);

const parser = new MarkdownParser(schema, md, {
  ...dP.tokens, // every CommonMark token spec, verbatim
  s: { mark: "strikethrough" },
  list_item: {
    block: "list_item",
    getAttrs: (tok) => {
      const c = tok.attrGet("checked");
      return { checked: c == null ? null : c === "true" };
    },
  },
  // The ↩ back-reference markdown-it-footnote appends inside each body — drop it.
  footnote_anchor: { ignore: true, noCloseToken: true },
  // tables: thead/tbody have no PM node, so ignore (rows flatten into the table).
  table: { block: "table" },
  thead: { ignore: true },
  tbody: { ignore: true },
  tr: { block: "table_row" },
  th: { block: "table_header", getAttrs: (t) => ({ align: alignFromStyle(t.attrGet("style")) }) },
  td: { block: "table_cell", getAttrs: (t) => ({ align: alignFromStyle(t.attrGet("style")) }) },
});

// Custom handler for the inline [^id] reference: open a footnote node and parse
// its (stitched) body into it. (tokenHandlers is internal to the parser.)
interface ParseState {
  openNode(type: NodeType, attrs?: Attrs): void;
  closeNode(): void;
  parseTokens(tokens: Token[]): void;
}
(
  parser as unknown as { tokenHandlers: Record<string, (s: ParseState, t: Token) => void> }
).tokenHandlers.footnote_ref = (state, tok) => {
  state.openNode(schema.nodes.footnote);
  const body = footnoteBodies.get(tok.meta?.id);
  if (body && body.length) state.parseTokens(body);
  state.closeNode(); // createAndFill adds an empty paragraph if the body was empty
};

// ── Serializer ──────────────────────────────────────────────────────────────
type NodeSerializer = (typeof dS.nodes)[string];

// prosemirror-markdown ships no table serializer, so we emit GFM by hand.
const alignSep = (a: unknown): string =>
  a === "center" ? ":---:" : a === "right" ? "---:" : a === "left" ? ":---" : "---";

function serializeCell(state: Parameters<NodeSerializer>[0], cell: PMNode): string {
  const s = state as unknown as { out: string };
  const saved = s.out;
  s.out = "";
  state.renderInline(cell);
  const text = s.out;
  s.out = saved;
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

const serializeTable: NodeSerializer = (state, node) => {
  const rows: { cells: string[]; aligns: unknown[] }[] = [];
  node.forEach((row) => {
    const cells: string[] = [];
    const aligns: unknown[] = [];
    row.forEach((cell) => {
      cells.push(serializeCell(state, cell));
      aligns.push(cell.attrs.align);
    });
    rows.push({ cells, aligns });
  });
  if (!rows.length) return;
  const cols = Math.max(...rows.map((r) => r.cells.length));
  const pad = (arr: string[]) => Array.from({ length: cols }, (_, i) => arr[i] ?? "");
  const line = (cells: string[]) => "| " + pad(cells).join(" | ") + " |";
  state.write(line(rows[0].cells) + "\n");
  state.write("| " + pad(rows[0].aligns.map(alignSep)).join(" | ") + " |\n");
  for (let i = 1; i < rows.length; i++) state.write(line(rows[i].cells) + "\n");
  state.closeBlock(node);
};

const baseNodes: Record<string, NodeSerializer> = {
  ...dS.nodes,
  list_item(state, node) {
    if (node.attrs.checked !== null) state.write(node.attrs.checked ? "[x] " : "[ ] ");
    state.renderContent(node);
  },
  table: serializeTable,
};

const baseMarks = {
  ...dS.marks,
  strikethrough: { open: "~~", close: "~~", mixable: true, expelEnclosingWhitespace: true },
};

function makeSerializer(notes: PMNode[] | null) {
  return new MarkdownSerializer(
    {
      ...baseNodes,
      footnote(state, node) {
        if (notes) {
          notes.push(node);
          state.write(`[^${notes.length}]`);
        } else {
          state.write("[^?]"); // body serializer: don't recurse into nested footnotes
        }
      },
    },
    baseMarks,
  );
}

export function parseMarkdown(markdown: string): PMNode {
  footnoteBodies = new Map();
  return parser.parse(markdown) ?? schema.topNodeType.createAndFill()!;
}

export function serializeDoc(doc: PMNode): string {
  const notes: PMNode[] = [];
  let out = makeSerializer(notes).serialize(doc);
  if (notes.length) {
    const bodySer = makeSerializer(null);
    const defs = notes.map((node, i) => {
      const bodyDoc = schema.topNodeType.create(null, node.content);
      const body = bodySer.serialize(bodyDoc).trim().replace(/\n/g, "\n    "); // indent continuation lines
      return `[^${i + 1}]: ${body}`;
    });
    out = out.replace(/\s+$/, "") + "\n\n" + defs.join("\n") + "\n";
  }
  return out;
}
