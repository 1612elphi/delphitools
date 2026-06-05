"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "prosemirror-view/style/prosemirror.css";
import "prosemirror-gapcursor/style/gapcursor.css";
import "prosemirror-tables/style/tables.css";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { setBlockType } from "prosemirror-commands";
import { fixTables } from "prosemirror-tables";
import { Slice, type Node as PMNode } from "prosemirror-model";
import { Code2, Copy, Check, Download, FileText, Maximize2, Minimize2, Settings } from "lucide-react";
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
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type EditorSettings,
} from "@/lib/editor/settings";
import { copyRichText, exportHtml, exportMarkdown, exportPdf } from "@/lib/editor/export";

const DOC_KEY = "delphitools-editor";
const GUTTER_W = 132; // px reserved for the gutter column
const SEED =
  "# Welcome\n\nStart writing. Type `# ` for a heading, `- ` for a list, `> ` for a quote, or `**bold**` inline.\n";

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
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [rows, setRows] = useState<GutterRow[]>([]);
  const [settings, setSettings] = useState<EditorSettings>(DEFAULT_SETTINGS);
  const [source, setSource] = useState("");
  const [copied, setCopied] = useState(false);
  const [zen, setZen] = useState(false);
  const [blockMenu, setBlockMenu] = useState<{ pos: number; top: number; node: PMNode | null } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const choices = useMemo(() => blockChoices(schema), []);

  const scheduleMeasure = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const v = viewRef.current;
      if (v && settingsRef.current.showGutter) setRows(measureGutter(v, settingsRef.current.enabledFields));
    });
  }, []);

  const saveDoc = useCallback((markdown: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(DOC_KEY, markdown);
      } catch {
        /* ignore */
      }
    }, 700);
  }, []);

  // Mount ProseMirror — client-only, never during SSR.
  useEffect(() => {
    if (viewRef.current || !hostRef.current) return; // StrictMode / re-entry guard
    const initial = loadSettings();
    settingsRef.current = initial;
    // Hydrate settings from localStorage after mount (SSR renders defaults to
    // avoid a hydration mismatch); one extra render on mount is intended.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(initial);

    let stored: string | null = null;
    try {
      stored = localStorage.getItem(DOC_KEY);
    } catch {
      /* ignore */
    }

    let initialState = EditorState.create({
      doc: parseMarkdown(stored ?? SEED),
      plugins: buildPlugins(schema, initial),
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
        if (tr.docChanged) saveDoc(serializeDoc(next.doc));
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

    const ro = new ResizeObserver(() => scheduleMeasure());
    ro.observe(view.dom);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(frameRef.current);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      view.destroy();
      viewRef.current = null;
    };
  }, [scheduleMeasure, saveDoc]);

  const applySettings = useCallback(
    (patch: Partial<EditorSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        settingsRef.current = next;
        saveSettings(next);
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
        EditorState.create({ doc: parseMarkdown(source), plugins: buildPlugins(schema, settingsRef.current) }),
      );
      saveDoc(source);
      applySettings({ codeMode: false });
      scheduleMeasure();
    }
  }, [source, applySettings, saveDoc, scheduleMeasure]);

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
    <div className={cn(zen && "fixed inset-0 z-50 overflow-y-auto bg-background")}>
      <div className={cn("space-y-4", zen && "mx-auto min-h-full max-w-3xl px-6 py-10")}>
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setZen((z) => !z)}
          title={zen ? "Exit focus mode" : "Distraction-free focus mode"}
          className="mr-auto"
        >
          {zen ? <Minimize2 className="size-4 mr-1.5" /> : <Maximize2 className="size-4 mr-1.5" />}
          {zen ? "Exit" : "Focus"}
        </Button>
        <Button variant="outline" size="sm" onClick={toggleCodeMode} title="Toggle raw Markdown source">
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
            <Button variant="outline" size="sm">
              <Download className="size-4 mr-1.5" /> Export
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-1">
            <button
              type="button"
              className={menuItemClass}
              onClick={() => {
                const d = currentDoc();
                if (d) exportMarkdown(d);
              }}
            >
              Markdown (.md)
            </button>
            <button
              type="button"
              className={menuItemClass}
              onClick={() => {
                const d = currentDoc();
                if (d) exportHtml(d);
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
                if (d) exportPdf(d);
              }}
            >
              PDF (print)
            </button>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" title="Settings">
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
              saveDoc(e.target.value);
            }}
            spellCheck={false}
            className="w-full min-h-[70vh] resize-none rounded-lg border bg-card/30 p-4 font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
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
                    className="dt-block-trigger pointer-events-auto block w-full cursor-pointer text-right text-[10px] uppercase tracking-wider text-muted-foreground/70 transition-colors hover:text-foreground"
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
              className="absolute z-40 w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
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
      </div>
    </div>
  );
}
