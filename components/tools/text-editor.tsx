"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "prosemirror-view/style/prosemirror.css";
import "prosemirror-gapcursor/style/gapcursor.css";
import "prosemirror-tables/style/tables.css";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { fixTables } from "prosemirror-tables";
import { Code2, Copy, Check, Download, FileText, Settings } from "lucide-react";
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
  const padLeft = settings.showGutter || settings.showMarginLine ? GUTTER_W + 24 : 0;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-2">
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
            <div className="pointer-events-none absolute left-0 top-0 select-none" style={{ width: GUTTER_W }} aria-hidden>
              {rows.map((r) => (
                <div key={r.key} className="absolute right-3 text-right leading-tight" style={{ top: r.top }}>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{r.type}</div>
                  {r.fields.map((f) => (
                    <div key={f.id} className="text-[10px] text-muted-foreground/40">
                      {f.value} {f.label}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          {settings.showMarginLine && (
            <div className="absolute top-0 bottom-0 w-px bg-border/60" style={{ left: GUTTER_W }} aria-hidden />
          )}
          <div ref={hostRef} suppressHydrationWarning style={{ paddingLeft: padLeft }} />
        </div>
      </div>
    </div>
  );
}
