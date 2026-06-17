"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "prosemirror-view/style/prosemirror.css";
import "prosemirror-gapcursor/style/gapcursor.css";
import "prosemirror-tables/style/tables.css";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { setBlockType, toggleMark } from "prosemirror-commands";
import { fixTables } from "prosemirror-tables";
import { Slice, type Node as PMNode } from "prosemirror-model";
import {
  Bold,
  Code,
  Code2,
  Copy,
  Check,
  Download,
  FileText,
  Italic,
  Link as LinkIcon,
  Maximize2,
  Minimize2,
  Settings,
  Strikethrough,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { schema } from "@/lib/editor/schema";
import { parseMarkdown, serializeDoc } from "@/lib/editor/markdown";
import { buildPlugins } from "@/lib/editor/plugins";
import { buildNodeViews } from "@/lib/editor/node-views";
import { focusKey } from "@/lib/editor/focus-plugin";
import { GUTTER_FIELDS, measureGutter, type GutterRow } from "@/lib/editor/gutter";
import { blockChoices, type BlockChoice } from "@/lib/editor/block-types";
import { DEFAULT_SETTINGS, clearStoredSettings, type EditorSettings } from "@/lib/editor/settings";
import { copyRichText, exportHtml, exportMarkdown, exportPdf } from "@/lib/editor/export";

const DOC_KEY = "delphitools-editor";
const GUTTER_W = 132; // px reserved for the gutter column
const SEED = "";
// Ghost text shown in an empty document (placeholder).
const PLACEHOLDER =
  "The Karman Institute for Planetary Observation has confirmed that Earth is no longer able to sustain organic life. After decades of atmospheric collapse, sensor data from the Donna Shirley Space Telescope indicates that oxygen and nitrogen concentrations in the atmosphere have reached irreversible levels of depletion. Carbon dioxide levels, combined with solar radiation and the absence of a protective ozone layer, have rendered the surface barren. The final viable microbial traces recorded last year by automated spectroscopic satellites have now vanished.";
const BUBBLE_BTN = "flex size-7 items-center justify-center rounded transition-colors hover:bg-accent";

type BoolKey = Exclude<keyof EditorSettings, "enabledFields">;

function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

export function TextEditorTool() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const frameRef = useRef(0);
  const settingsRef = useRef<EditorSettings>(DEFAULT_SETTINGS);
  // The document is never persisted (privacy). `dirty` tracks unsaved edits so
  // we can warn before the page unloads. Cleared when the user exports a copy.
  const dirtyRef = useRef(false);

  const [rows, setRows] = useState<GutterRow[]>([]);
  const [settings, setSettings] = useState<EditorSettings>(DEFAULT_SETTINGS);
  const [source, setSource] = useState("");
  const [copied, setCopied] = useState(false);
  const [zen, setZen] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [wordCount, setWordCount] = useState(0);
  const [activeBlockPos, setActiveBlockPos] = useState<number | null>(null);
  const [bubble, setBubble] = useState<{ top: number; left: number; marks: Set<string> } | null>(null);
  const [blockMenu, setBlockMenu] = useState<{ pos: number; top: number; node: PMNode | null } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const choices = useMemo(() => blockChoices(schema), []);

  const scheduleMeasure = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const v = viewRef.current;
      if (v && settingsRef.current.showGutter) setRows(measureGutter(v, settingsRef.current.enabledFields));
    });
  }, []);

  // Mount ProseMirror — client-only, never during SSR.
  useEffect(() => {
    if (viewRef.current || !hostRef.current) return; // StrictMode / re-entry guard

    // Nothing is persisted across sessions — clean up anything an older build left.
    try {
      localStorage.removeItem(DOC_KEY);
    } catch {
      /* ignore */
    }
    clearStoredSettings();

    let initialState = EditorState.create({
      doc: parseMarkdown(SEED),
      plugins: buildPlugins(schema, DEFAULT_SETTINGS, PLACEHOLDER),
    });
    const fix = fixTables(initialState);
    if (fix) initialState = initialState.apply(fix);

    const view = new EditorView(hostRef.current, {
      state: initialState,
      attributes: { class: "dt-editor", spellcheck: "true" },
      nodeViews: buildNodeViews(),
      // Pasting plain text parses it as Markdown (ProseMirror only calls this when
      // there's no rich HTML on the clipboard, so web copy-paste still works).
      clipboardTextParser(text) {
        const doc = parseMarkdown(text);
        const first = doc.firstChild;
        // A single paragraph pastes inline (merges into the current line);
        // anything richer pastes as blocks.
        if (doc.childCount === 1 && first && first.type.name === "paragraph") {
          return new Slice(first.content, 0, 0);
        }
        return doc.slice(0, doc.content.size);
      },
      dispatchTransaction(tr) {
        const next = view.state.apply(tr);
        view.updateState(next);
        scheduleMeasure();
        if (tr.docChanged) dirtyRef.current = true;

        // Derived UI state: active block, selection bubble, word count.
        const sel = next.selection;
        setActiveBlockPos(sel.$from.depth >= 1 ? sel.$from.before(1) : null);
        if (sel instanceof TextSelection && !sel.empty && view.hasFocus()) {
          try {
            const a = view.coordsAtPos(sel.from);
            const b = view.coordsAtPos(sel.to);
            const marks = new Set<string>();
            for (const name of ["strong", "em", "strikethrough", "code", "link"]) {
              const type = next.schema.marks[name];
              if (type && next.doc.rangeHasMark(sel.from, sel.to, type)) marks.add(name);
            }
            setBubble({ top: Math.min(a.top, b.top), left: (a.left + b.right) / 2, marks });
          } catch {
            setBubble(null);
          }
        } else {
          setBubble(null);
        }
        if (tr.docChanged) {
          const text = next.doc.textBetween(0, next.doc.content.size, " ", " ").trim();
          setWordCount(text ? text.split(/\s+/).length : 0);
        }
      },
      handleScrollToSelection(v) {
        if (!settingsRef.current.typewriter) return false;
        const coords = v.coordsAtPos(v.state.selection.from);
        const scroller = getScrollParent(v.dom as HTMLElement);
        if (scroller) {
          const r = scroller.getBoundingClientRect();
          scroller.scrollTop += coords.top - r.top - scroller.clientHeight / 2;
        } else {
          window.scrollTo({ top: window.scrollY + coords.top - window.innerHeight / 2 });
        }
        return true;
      },
    });
    viewRef.current = view;
    scheduleMeasure();
    const initialText = view.state.doc.textBetween(0, view.state.doc.content.size, " ", " ").trim();
    setWordCount(initialText ? initialText.split(/\s+/).length : 0);

    const ro = new ResizeObserver(() => scheduleMeasure());
    ro.observe(view.dom);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(frameRef.current);
      view.destroy();
      viewRef.current = null;
    };
  }, [scheduleMeasure]);

  const applySettings = useCallback(
    (patch: Partial<EditorSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        settingsRef.current = next;
        const v = viewRef.current;
        if (v) v.dispatch(v.state.tr.setMeta(focusKey, next));
        scheduleMeasure();
        return next;
      });
    },
    [scheduleMeasure],
  );

  const toggleCodeMode = useCallback(() => {
    const v = viewRef.current;
    if (!v) return;
    if (!settingsRef.current.codeMode) {
      setSource(serializeDoc(v.state.doc));
      applySettings({ codeMode: true });
    } else {
      v.updateState(
        EditorState.create({
          doc: parseMarkdown(source),
          plugins: buildPlugins(schema, settingsRef.current, PLACEHOLDER),
        }),
      );
      dirtyRef.current = true;
      applySettings({ codeMode: false });
      scheduleMeasure();
    }
  }, [source, applySettings, scheduleMeasure]);

  const currentDoc = useCallback(() => {
    const v = viewRef.current;
    if (!v) return null;
    return settingsRef.current.codeMode ? parseMarkdown(source) : v.state.doc;
  }, [source]);

  const doCopyRich = useCallback(async () => {
    const doc = currentDoc();
    if (!doc) return;
    try {
      await copyRichText(doc);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }, [currentDoc]);

  // Inline formatting (bubble toolbar on selection).
  const applyMark = useCallback((markName: string, attrs?: Record<string, unknown>) => {
    const view = viewRef.current;
    if (!view) return;
    const type = view.state.schema.marks[markName];
    if (type) toggleMark(type, attrs)(view.state, view.dispatch);
    view.focus();
  }, []);

  const addLink = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const type = view.state.schema.marks.link;
    if (!type) return;
    const { from, to } = view.state.selection;
    if (view.state.doc.rangeHasMark(from, to, type)) {
      toggleMark(type)(view.state, view.dispatch);
    } else {
      const href = window.prompt("Link URL");
      if (href) toggleMark(type, { href })(view.state, view.dispatch);
    }
    view.focus();
  }, []);

  // The document is never persisted, so warn before leaving with unsaved edits.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // In Focus mode, auto-hide the toolbar when idle; reveal on mouse/key activity.
  useEffect(() => {
    if (!zen) return;
    const show = () => {
      setToolbarVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setToolbarVisible(false), 2500);
    };
    hideTimer.current = setTimeout(() => setToolbarVisible(false), 2500);
    window.addEventListener("mousemove", show);
    window.addEventListener("keydown", show);
    return () => {
      window.removeEventListener("mousemove", show);
      window.removeEventListener("keydown", show);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [zen]);

  const toggleBool = (key: BoolKey) => applySettings({ [key]: !settings[key] } as Partial<EditorSettings>);
  const toggleField = (id: string) => {
    const has = settings.enabledFields.includes(id);
    applySettings({
      enabledFields: has ? settings.enabledFields.filter((x) => x !== id) : [...settings.enabledFields, id],
    });
  };

  const settingRow = (key: BoolKey, label: string) => (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={key} className="text-sm font-normal">
        {label}
      </Label>
      <Switch id={key} checked={settings[key] as boolean} onCheckedChange={() => toggleBool(key)} />
    </div>
  );

  const menuItemClass =
    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent";
  // Convert the block at `pos` (the one whose gutter label was clicked).
  const runBlockCommand = useCallback((pos: number, choice: BlockChoice) => {
    const view = viewRef.current;
    if (!view) return;
    const { bullet_list, ordered_list } = view.state.schema.nodes;
    const block = view.state.doc.nodeAt(pos);

    // Block is already a list and a list type was picked → swap the list's type
    // in place (bullet ↔ numbered), keeping the items.
    if (choice.listType && block && (block.type === bullet_list || block.type === ordered_list)) {
      if (block.type !== choice.listType) {
        view.dispatch(view.state.tr.setNodeMarkup(pos, choice.listType));
      }
      view.focus();
      setBlockMenu(null);
      return;
    }

    const inside = Math.min(pos + 1, view.state.doc.content.size - 1);
    view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(inside))));
    // For wrapping choices (list/quote), demote a styled block (heading/code) to
    // a plain paragraph first, so the result isn't a heading-sized list item.
    if (choice.wrap) {
      const para = view.state.schema.nodes.paragraph;
      const block = view.state.selection.$from.parent;
      if (para && block.isTextblock && block.type !== para) {
        setBlockType(para)(view.state, view.dispatch);
      }
    }
    choice.command(view.state, view.dispatch);
    view.focus();
    setBlockMenu(null);
  }, []);

  // Close the block menu on Escape or an outside click (but not on a gutter
  // label, whose own click handler toggles the menu).
  useEffect(() => {
    if (!blockMenu) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (menuRef.current?.contains(target) || target.closest?.(".dt-block-trigger")) return;
      setBlockMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBlockMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [blockMenu]);

  // Escape exits Focus mode — unless a footnote sub-editor or the block menu
  // should handle it first.
  useEffect(() => {
    if (!zen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || blockMenu) return;
      if ((document.activeElement as HTMLElement | null)?.closest?.(".footnote-tooltip")) return;
      setZen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [zen, blockMenu]);

  const activeBlockNode = blockMenu?.node ?? null;

  const padLeft = settings.showGutter || settings.showMarginLine ? GUTTER_W + 24 : 0;

  return (
    <div
      className={cn(zen && "fixed inset-0 z-50 overflow-y-auto bg-background animate-in fade-in-0 duration-200")}
    >
      <div className={cn("space-y-4", zen && "mx-auto min-h-full max-w-3xl px-6 py-10")}>
      {/* Toolbar */}
      <div
        className={cn(
          "flex items-stretch border-2 border-border",
          zen && "transition-opacity duration-300",
          zen && !toolbarVisible && "opacity-0 hover:opacity-100",
        )}
      >
        <Button
          variant="outline"
          onClick={() => {
            setToolbarVisible(true);
            setZen((z) => !z);
          }}
          title={zen ? "Exit focus mode" : "Distraction-free focus mode"}
          className="mr-auto h-auto self-stretch rounded-none border-0 px-4 font-bold"
        >
          {zen ? <Minimize2 className="size-4 mr-1.5" /> : <Maximize2 className="size-4 mr-1.5" />}
          {zen ? "Exit" : "Focus"}
        </Button>
        <Button
          variant="outline"
          onClick={toggleCodeMode}
          title="Toggle raw Markdown source"
          className="h-auto self-stretch rounded-none border-0 border-l border-border px-4 font-bold"
        >
          {settings.codeMode ? (
            <>
              <FileText className="size-4 mr-1.5" /> Preview
            </>
          ) : (
            <>
              <Code2 className="size-4 mr-1.5" /> Source
            </>
          )}
        </Button>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="h-auto self-stretch rounded-none border-0 border-l border-border px-4 font-bold"
            >
              <Download className="size-4 mr-1.5" /> Export
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-1">
            <button
              type="button"
              className={menuItemClass}
              onClick={() => {
                const d = currentDoc();
                if (d) {
                  exportMarkdown(d);
                  dirtyRef.current = false;
                }
              }}
            >
              Markdown (.md)
            </button>
            <button
              type="button"
              className={menuItemClass}
              onClick={() => {
                const d = currentDoc();
                if (d) {
                  exportHtml(d);
                  dirtyRef.current = false;
                }
              }}
            >
              HTML (.html)
            </button>
            <button type="button" className={menuItemClass} onClick={doCopyRich}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied!" : "Copy as rich text"}
            </button>
            <button
              type="button"
              className={menuItemClass}
              onClick={() => {
                const d = currentDoc();
                if (d) {
                  exportPdf(d);
                  dirtyRef.current = false;
                }
              }}
            >
              PDF (print)
            </button>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              title="Settings"
              className="h-auto w-12 self-stretch rounded-none border-0 border-l border-border"
            >
              <Settings className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 space-y-3">
            {settingRow("highlightSentence", "Highlight current sentence")}
            {settingRow("highlightParagraph", "Highlight current paragraph")}
            {settingRow("dimInactive", "Dim inactive paragraphs")}
            {settingRow("typewriter", "Typewriter scrolling")}
            <Separator />
            {settingRow("showGutter", "Show gutter")}
            {settingRow("showMarginLine", "Show margin line")}
            <Separator />
            <p className="text-xs text-muted-foreground">Gutter fields</p>
            {GUTTER_FIELDS.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-4">
                <Label htmlFor={`field-${f.id}`} className="text-sm font-normal capitalize">
                  {f.label}
                </Label>
                <Switch
                  id={`field-${f.id}`}
                  checked={settings.enabledFields.includes(f.id)}
                  onCheckedChange={() => toggleField(f.id)}
                />
              </div>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      {/* Editor surface */}
      <div className="relative">
        {settings.codeMode && (
          <textarea
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              dirtyRef.current = true;
            }}
            spellCheck={false}
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            className="w-full min-h-[70vh] resize-none border-2 border-border bg-card/30 p-4 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
          />
        )}

        <div className={cn("relative", settings.codeMode && "hidden")}>
          {settings.showGutter && (
            <div className="pointer-events-none absolute left-0 top-0 select-none" style={{ width: GUTTER_W }}>
              {rows.map((r) => (
                <div key={r.key} className="absolute right-3 text-right leading-tight" style={{ top: r.top }}>
                  <button
                    type="button"
                    onClick={() => {
                      const node = viewRef.current?.state.doc.nodeAt(r.pos) ?? null;
                      setBlockMenu((cur) => (cur?.pos === r.pos ? null : { pos: r.pos, top: r.top, node }));
                    }}
                    className={cn(
                      "dt-block-trigger pointer-events-auto block w-full cursor-pointer text-right text-[10px] uppercase tracking-wider transition-colors hover:text-foreground",
                      r.pos === activeBlockPos ? "text-foreground/80" : "text-muted-foreground/70",
                    )}
                    title="Change block type"
                  >
                    {r.type}
                  </button>
                  {r.fields.map((f) => (
                    <div key={f.id} className="text-[10px] text-muted-foreground/40">
                      {f.value} {f.label}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          {blockMenu && (
            <div
              ref={menuRef}
              className="absolute z-40 w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 duration-150"
              style={{ top: blockMenu.top, left: 0 }}
            >
              {choices.map((c) => {
                const active = activeBlockNode ? c.isActive(activeBlockNode) : false;
                return (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => runBlockCommand(blockMenu.pos, c)}
                    className={cn(
                      "flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-accent",
                      active && "text-primary",
                    )}
                  >
                    {c.label}
                    {active && <Check className="size-3.5" />}
                  </button>
                );
              })}
            </div>
          )}
          {settings.showMarginLine && (
            <div className="absolute top-0 bottom-0 w-px bg-border/60" style={{ left: GUTTER_W }} aria-hidden />
          )}
          <div ref={hostRef} suppressHydrationWarning style={{ paddingLeft: padLeft }} />
        </div>
      </div>

      {/* Selection bubble toolbar */}
      {bubble && (
        <div
          className="fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-md border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95 duration-150"
          style={{ top: bubble.top - 8, left: bubble.left }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            type="button"
            title="Bold"
            onClick={() => applyMark("strong")}
            className={cn(BUBBLE_BTN, bubble.marks.has("strong") && "bg-accent text-primary")}
          >
            <Bold className="size-4" />
          </button>
          <button
            type="button"
            title="Italic"
            onClick={() => applyMark("em")}
            className={cn(BUBBLE_BTN, bubble.marks.has("em") && "bg-accent text-primary")}
          >
            <Italic className="size-4" />
          </button>
          <button
            type="button"
            title="Strikethrough"
            onClick={() => applyMark("strikethrough")}
            className={cn(BUBBLE_BTN, bubble.marks.has("strikethrough") && "bg-accent text-primary")}
          >
            <Strikethrough className="size-4" />
          </button>
          <button
            type="button"
            title="Code"
            onClick={() => applyMark("code")}
            className={cn(BUBBLE_BTN, bubble.marks.has("code") && "bg-accent text-primary")}
          >
            <Code className="size-4" />
          </button>
          <button
            type="button"
            title="Link"
            onClick={addLink}
            className={cn(BUBBLE_BTN, bubble.marks.has("link") && "bg-accent text-primary")}
          >
            <LinkIcon className="size-4" />
          </button>
        </div>
      )}

      {/* Focus-mode word count */}
      {zen && (
        <div
          className={cn(
            "pointer-events-none fixed bottom-4 left-1/2 -translate-x-1/2 text-xs text-muted-foreground/50 transition-opacity duration-300",
            !toolbarVisible && "opacity-0",
          )}
        >
          {wordCount} {wordCount === 1 ? "word" : "words"}
          {wordCount > 0 && ` · ~${Math.ceil(wordCount / 200)} min read`}
        </div>
      )}
      </div>
    </div>
  );
}
