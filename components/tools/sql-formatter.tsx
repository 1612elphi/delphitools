"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatSql, minifySql, SqlDialect, SqlKeywordCase } from "@/lib/sql-formatter";

const DEFAULT_SQL = `select u.id, u.email, count(o.id) as order_count from users u left join orders o on o.user_id = u.id where u.deleted_at is null and o.status in ('paid', 'shipped') group by u.id, u.email order by order_count desc;`;

export function SqlFormatterTool() {
  const [input, setInput] = useState(DEFAULT_SQL);
  const [output, setOutput] = useState("");
  const [dialect, setDialect] = useState<SqlDialect>("postgresql");
  const [keywordCase, setKeywordCase] = useState<SqlKeywordCase>("uppercase");
  const [indentSize, setIndentSize] = useState(2);
  const [copied, setCopied] = useState(false);

  const runFormat = () => {
    setOutput(formatSql(input, { dialect, keywordCase, indentSize }));
  };

  const runMinify = () => {
    setOutput(minifySql(input, { dialect, keywordCase }));
  };

  const copyOutput = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">SQL flavor</label>
          <select
            value={dialect}
            onChange={(e) => setDialect(e.target.value as SqlDialect)}
            className="w-full h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="postgresql">PostgreSQL</option>
            <option value="mysql">MySQL</option>
            <option value="sqlite">SQLite</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Keyword casing</label>
          <select
            value={keywordCase}
            onChange={(e) => setKeywordCase(e.target.value as SqlKeywordCase)}
            className="w-full h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="uppercase">UPPERCASE</option>
            <option value="lowercase">lowercase</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Indent size</label>
          <select
            value={indentSize}
            onChange={(e) => setIndentSize(Number(e.target.value))}
            className="w-full h-10 rounded-md border bg-background px-3 text-sm"
          >
            {[2, 4].map((size) => (
              <option key={size} value={size}>{size} spaces</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <label className="text-lg font-bold block">Input SQL</label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste SQL here"
            className="w-full min-h-[280px] rounded-lg border bg-background p-4 font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-lg font-bold block">Output</label>
            <Button onClick={copyOutput} variant="outline" size="sm" disabled={!output}>
              {copied ? <Check className="size-4 mr-2" /> : <Copy className="size-4 mr-2" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <textarea
            value={output}
            readOnly
            placeholder="Formatted SQL will appear here"
            className="w-full min-h-[280px] rounded-lg border bg-muted/30 p-4 font-mono text-sm resize-y"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={runFormat}>Prettify SQL</Button>
        <Button variant="outline" onClick={runMinify}>Minify SQL</Button>
        <Button variant="ghost" onClick={() => { setInput(""); setOutput(""); }}>
          Clear
        </Button>
      </div>
    </div>
  );
}
