"use client";

import { useMemo, useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type IdType = "uuid-v4" | "uuid-v7" | "ulid" | "nanoid";
type IdCount = 1 | 10 | 100;
type CaseMode = "lowercase" | "uppercase";
type OutputFormat = "array" | "json" | "csv";

const CROCKFORD32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const NANO_ID_ALPHABET = "_-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function IdGeneratorTool() {
  const [idType, setIdType] = useState<IdType>("uuid-v4");
  const [count, setCount] = useState<IdCount>(10);
  const [caseMode, setCaseMode] = useState<CaseMode>("lowercase");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("array");
  const [ids, setIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const output = useMemo(() => formatOutput(ids, outputFormat), [ids, outputFormat]);

  const generateIds = () => {
    const generated = Array.from({ length: count }, () => {
      const value = generateId(idType);
      return caseMode === "uppercase" ? value.toUpperCase() : value.toLowerCase();
    });

    setIds(generated);
    setCopied(false);
  };

  const copyOutput = async () => {
    if (!output) {
      return;
    }

    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">ID type</label>
          <select
            value={idType}
            onChange={(e) => setIdType(e.target.value as IdType)}
            className="w-full h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="uuid-v4">UUID v4</option>
            <option value="uuid-v7">UUID v7</option>
            <option value="ulid">ULID</option>
            <option value="nanoid">NanoID</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">How many</label>
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value) as IdCount)}
            className="w-full h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value={1}>1</option>
            <option value={10}>10</option>
            <option value={100}>100</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Letter case</label>
          <select
            value={caseMode}
            onChange={(e) => setCaseMode(e.target.value as CaseMode)}
            className="w-full h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="lowercase">lowercase</option>
            <option value="uppercase">UPPERCASE</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Copy format</label>
          <select
            value={outputFormat}
            onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
            className="w-full h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="array">Array</option>
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={generateIds}>
          <RefreshCw className="size-4 mr-2" />
          Generate IDs
        </Button>
        <Button onClick={copyOutput} variant="outline" disabled={!output}>
          {copied ? <Check className="size-4 mr-2" /> : <Copy className="size-4 mr-2" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <div className="space-y-2">
        <label className="text-lg font-bold block">Output</label>
        <textarea
          value={output}
          readOnly
          placeholder="Generate IDs to see output"
          className="w-full min-h-[280px] rounded-lg border bg-muted/30 p-4 font-mono text-sm resize-y"
        />
      </div>
    </div>
  );
}

function generateId(type: IdType): string {
  switch (type) {
    case "uuid-v4":
      return crypto.randomUUID();
    case "uuid-v7":
      return generateUuidV7();
    case "ulid":
      return generateUlid();
    case "nanoid":
      return generateNanoId();
    default:
      return crypto.randomUUID();
  }
}

function generateUuidV7(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const timestamp = BigInt(Date.now());

  for (let i = 0; i < 6; i += 1) {
    bytes[i] = Number((timestamp >> BigInt((5 - i) * 8)) & 0xffn);
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return formatUuid(bytes);
}

function formatUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function generateUlid(): string {
  const timestamp = Date.now();
  const random = crypto.getRandomValues(new Uint8Array(16));

  return `${encodeTime(timestamp, 10)}${encodeRandom(random, 16)}`;
}

function encodeTime(value: number, length: number): string {
  let remaining = value;
  const chars = Array.from({ length }, () => "0");

  for (let i = length - 1; i >= 0; i -= 1) {
    chars[i] = CROCKFORD32[remaining % 32];
    remaining = Math.floor(remaining / 32);
  }

  return chars.join("");
}

function encodeRandom(bytes: Uint8Array, length: number): string {
  let output = "";

  for (let i = 0; i < length; i += 1) {
    output += CROCKFORD32[bytes[i] % 32];
  }

  return output;
}

function generateNanoId(length = 21): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let id = "";

  for (let i = 0; i < length; i += 1) {
    id += NANO_ID_ALPHABET[bytes[i] % NANO_ID_ALPHABET.length];
  }

  return id;
}

function formatOutput(ids: string[], outputFormat: OutputFormat): string {
  if (ids.length === 0) {
    return "";
  }

  switch (outputFormat) {
    case "array":
      return `[\n${ids.map((id) => `  \"${id}\"`).join(",\n")}\n]`;
    case "json":
      return JSON.stringify(ids, null, 2);
    case "csv":
      return ids.map((id) => `"${id.replaceAll('"', '""')}"`).join("\n");
    default:
      return ids.join("\n");
  }
}
