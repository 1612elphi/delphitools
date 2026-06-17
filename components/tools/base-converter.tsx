"use client";

import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type Base = "dec" | "hex" | "bin" | "oct";
type BitwiseOp = "AND" | "OR" | "XOR" | "NOT" | "LSH" | "RSH";

interface BaseValues {
  dec: string;
  hex: string;
  bin: string;
  oct: string;
}

const BASE_INFO: Record<Base, { name: string; prefix: string; radix: number; placeholder: string }> = {
  dec: { name: "Decimal", prefix: "", radix: 10, placeholder: "255" },
  hex: { name: "Hexadecimal", prefix: "0x", radix: 16, placeholder: "FF" },
  bin: { name: "Binary", prefix: "0b", radix: 2, placeholder: "11111111" },
  oct: { name: "Octal", prefix: "0o", radix: 8, placeholder: "377" },
};

const BASES: Base[] = ["dec", "hex", "bin", "oct"];

const BITWISE_REF: { op: string; desc: string }[] = [
  { op: "AND (&)", desc: "1 if both bits are 1" },
  { op: "OR (|)", desc: "1 if either bit is 1" },
  { op: "XOR (^)", desc: "1 if bits differ" },
  { op: "NOT (~)", desc: "Flip all bits" },
  { op: "<< (LSH)", desc: "Shift bits left" },
  { op: ">> (RSH)", desc: "Shift bits right" },
];

export function BaseConverterTool() {
  const [values, setValues] = useState<BaseValues>({ dec: "", hex: "", bin: "", oct: "" });
  const [activeBase, setActiveBase] = useState<Base | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<Base | null>(null);

  // Bitwise operation state
  const [bitwiseA, setBitwiseA] = useState<BaseValues>({ dec: "", hex: "", bin: "", oct: "" });
  const [bitwiseB, setBitwiseB] = useState<BaseValues>({ dec: "", hex: "", bin: "", oct: "" });
  const [bitwiseOp, setBitwiseOp] = useState<BitwiseOp>("AND");
  const [bitwiseResult, setBitwiseResult] = useState<BaseValues | null>(null);
  const [shiftAmount, setShiftAmount] = useState("1");

  const parseValue = useCallback((value: string, base: Base): number | null => {
    const cleaned = value.trim().toLowerCase();
    if (!cleaned) return null;

    // Remove common prefixes
    let toParse = cleaned;
    if (base === "hex" && cleaned.startsWith("0x")) toParse = cleaned.slice(2);
    if (base === "bin" && cleaned.startsWith("0b")) toParse = cleaned.slice(2);
    if (base === "oct" && cleaned.startsWith("0o")) toParse = cleaned.slice(2);

    const result = parseInt(toParse, BASE_INFO[base].radix);
    return isNaN(result) ? null : result;
  }, []);

  const convertAll = useCallback((num: number): BaseValues => {
    return {
      dec: num.toString(10),
      hex: num.toString(16).toUpperCase(),
      bin: num.toString(2),
      oct: num.toString(8),
    };
  }, []);

  const handleBaseInput = useCallback(
    (base: Base, value: string) => {
      setActiveBase(base);
      setError(null);

      if (!value.trim()) {
        setValues({ dec: "", hex: "", bin: "", oct: "" });
        return;
      }

      const num = parseValue(value, base);
      if (num === null || num < 0) {
        setError(`Invalid ${BASE_INFO[base].name.toLowerCase()} number`);
        setValues((prev) => ({ ...prev, [base]: value }));
        return;
      }

      setValues(convertAll(num));
    },
    [parseValue, convertAll]
  );

  const copyValue = async (base: Base, value: string) => {
    if (!value) return;
    await navigator.clipboard.writeText(BASE_INFO[base].prefix + value);
    setCopied(base);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleBitwiseInput = useCallback(
    (target: "a" | "b", base: Base, value: string) => {
      const setter = target === "a" ? setBitwiseA : setBitwiseB;

      if (!value.trim()) {
        setter({ dec: "", hex: "", bin: "", oct: "" });
        return;
      }

      const num = parseValue(value, base);
      if (num === null || num < 0) {
        setter((prev) => ({ ...prev, [base]: value }));
        return;
      }

      setter(convertAll(num));
    },
    [parseValue, convertAll]
  );

  const calculateBitwise = useCallback(() => {
    const a = parseValue(bitwiseA.dec, "dec");
    const b = parseValue(bitwiseB.dec, "dec");
    const shift = parseInt(shiftAmount) || 1;

    if (a === null) {
      setBitwiseResult(null);
      return;
    }

    let result: number;
    switch (bitwiseOp) {
      case "AND":
        if (b === null) return;
        result = a & b;
        break;
      case "OR":
        if (b === null) return;
        result = a | b;
        break;
      case "XOR":
        if (b === null) return;
        result = a ^ b;
        break;
      case "NOT":
        result = ~a >>> 0;
        result = result & 0xffffffff;
        break;
      case "LSH":
        result = a << shift;
        break;
      case "RSH":
        result = a >>> shift;
        break;
      default:
        return;
    }

    setBitwiseResult(convertAll(result >>> 0));
  }, [bitwiseA.dec, bitwiseB.dec, bitwiseOp, shiftAmount, parseValue, convertAll]);

  // Bit toggle visualization (for values up to 16 bits for display)
  const getBits = (value: string): boolean[] => {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0) return Array(16).fill(false);
    const bits: boolean[] = [];
    for (let i = 15; i >= 0; i--) {
      bits.push(((num >> i) & 1) === 1);
    }
    return bits;
  };

  const toggleBit = (bitIndex: number) => {
    const num = parseInt(values.dec, 10) || 0;
    const actualIndex = 15 - bitIndex;
    const newNum = num ^ (1 << actualIndex);
    setValues(convertAll(newNum));
  };

  const hasValue = values.dec !== "";
  const decimalValue = parseInt(values.dec, 10);

  // Pair each bit with its fixed position so the rendered key is data-derived
  // (the position is stable identity for the never-reordered 16-bit row).
  const bitCells = getBits(values.dec).map((on, position) => ({ on, position }));

  return (
    <div className="space-y-6">
      <Tabs defaultValue="converter">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="converter">Converter</TabsTrigger>
          <TabsTrigger value="bitwise">Bitwise Ops</TabsTrigger>
        </TabsList>

        <div className="mt-3 border-2 border-border">
          {/* Converter — flush base table */}
          <TabsContent value="converter" className="m-0">
            <div>
              {BASES.map((base) => {
                const isActive = activeBase === base && hasValue;
                return (
                  <div
                    key={base}
                    className={cn(
                      "flex items-stretch border-b border-border last:border-b-0",
                      isActive && "bg-muted/40"
                    )}
                  >
                    <span className="flex w-32 shrink-0 items-center px-4 text-sm font-medium">
                      {BASE_INFO[base].name}
                    </span>
                    <div className="flex flex-1 items-stretch border-l border-border">
                      {BASE_INFO[base].prefix && (
                        <span className="flex items-center pl-3 font-mono text-sm text-muted-foreground">
                          {BASE_INFO[base].prefix}
                        </span>
                      )}
                      <Input
                        value={values[base]}
                        onChange={(e) => handleBaseInput(base, e.target.value)}
                        placeholder={BASE_INFO[base].placeholder}
                        className="flex-1 border-0 bg-transparent font-mono"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => copyValue(base, values[base])}
                      disabled={!values[base]}
                      aria-label={`Copy ${BASE_INFO[base].name}`}
                      className="flex w-12 shrink-0 items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                    >
                      {copied === base ? (
                        <Check className="size-4 text-green-500" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {error && (
              <div className="border-t border-border p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Bit toggle */}
            {(!hasValue || decimalValue <= 65535) && (
              <div className="space-y-3 border-t-2 border-border p-4">
                <Label className="font-bold">Bit Toggle (16-bit)</Label>
                <div className="-mx-4">
                  <div
                    className="segmented border-x-0"
                    style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}
                  >
                    {bitCells.map((cell) => (
                      <button
                        key={`bit-${cell.position}`}
                        type="button"
                        onClick={() => toggleBit(cell.position)}
                        className={cn(
                          "h-10 font-mono text-sm transition-colors",
                          cell.on
                            ? "bg-primary text-primary-foreground"
                            : "bg-background hover:bg-muted"
                        )}
                      >
                        {cell.on ? "1" : "0"}
                      </button>
                    ))}
                  </div>
                  <div
                    className="grid gap-px"
                    style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}
                  >
                    {Array.from({ length: 16 }, (_, i) => (
                      <span key={i} className="pt-1 text-center text-[10px] text-muted-foreground">
                        {15 - i}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Bitwise */}
          <TabsContent value="bitwise" className="m-0">
            {/* Operation */}
            <div className="space-y-3 border-b-2 border-border p-4">
              <Label className="font-bold">Operation</Label>
              <div className="segmented grid-cols-3 sm:grid-cols-6 -mx-4 -mb-4 border-x-0 border-b-0">
                {(["AND", "OR", "XOR", "NOT", "LSH", "RSH"] as BitwiseOp[]).map((op) => (
                  <Button
                    key={op}
                    variant={bitwiseOp === op ? "default" : "outline"}
                    onClick={() => {
                      setBitwiseOp(op);
                      setBitwiseResult(null);
                    }}
                    className="font-mono"
                  >
                    {op === "LSH" ? "<<" : op === "RSH" ? ">>" : op}
                  </Button>
                ))}
              </div>
            </div>

            {/* Value A */}
            <div className="space-y-3 border-b-2 border-border p-4">
              <Label className="font-bold">Value A</Label>
              <div className="-mx-4 -mb-4 border-t border-border">
                {BASES.map((base) => (
                  <div key={base} className="flex items-stretch border-b border-border last:border-b-0">
                    <span className="flex w-32 shrink-0 items-center px-4 text-sm text-muted-foreground">
                      {BASE_INFO[base].name}
                    </span>
                    <div className="flex flex-1 items-stretch border-l border-border">
                      {BASE_INFO[base].prefix && (
                        <span className="flex items-center pl-3 font-mono text-sm text-muted-foreground">
                          {BASE_INFO[base].prefix}
                        </span>
                      )}
                      <Input
                        value={bitwiseA[base]}
                        onChange={(e) => handleBitwiseInput("a", base, e.target.value)}
                        placeholder={BASE_INFO[base].placeholder}
                        className="flex-1 border-0 bg-transparent font-mono"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Value B */}
            {bitwiseOp !== "NOT" && bitwiseOp !== "LSH" && bitwiseOp !== "RSH" && (
              <div className="space-y-3 border-b-2 border-border p-4">
                <Label className="font-bold">Value B</Label>
                <div className="-mx-4 -mb-4 border-t border-border">
                  {BASES.map((base) => (
                    <div key={base} className="flex items-stretch border-b border-border last:border-b-0">
                      <span className="flex w-32 shrink-0 items-center px-4 text-sm text-muted-foreground">
                        {BASE_INFO[base].name}
                      </span>
                      <div className="flex flex-1 items-stretch border-l border-border">
                        {BASE_INFO[base].prefix && (
                          <span className="flex items-center pl-3 font-mono text-sm text-muted-foreground">
                            {BASE_INFO[base].prefix}
                          </span>
                        )}
                        <Input
                          value={bitwiseB[base]}
                          onChange={(e) => handleBitwiseInput("b", base, e.target.value)}
                          placeholder={BASE_INFO[base].placeholder}
                          className="flex-1 border-0 bg-transparent font-mono"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Shift */}
            {(bitwiseOp === "LSH" || bitwiseOp === "RSH") && (
              <div className="space-y-3 border-b-2 border-border p-4">
                <Label className="font-bold">Shift Amount</Label>
                <Input
                  type="number"
                  value={shiftAmount}
                  onChange={(e) => setShiftAmount(e.target.value)}
                  placeholder="1"
                  className="w-24 font-mono"
                  min={0}
                  max={31}
                />
              </div>
            )}

            {/* Calculate — flush full-width primary */}
            <Button
              onClick={calculateBitwise}
              className="h-14 w-full rounded-none border-0 border-b-2 border-border text-lg font-bold"
            >
              Calculate
            </Button>

            {/* Result */}
            {bitwiseResult && (
              <div className="space-y-3 border-b-2 border-border p-4">
                <Label className="font-bold">
                  Result: {bitwiseA.dec}{" "}
                  {bitwiseOp === "NOT" ? "~" : bitwiseOp === "LSH" ? "<<" : bitwiseOp === "RSH" ? ">>" : bitwiseOp}{" "}
                  {bitwiseOp === "LSH" || bitwiseOp === "RSH"
                    ? shiftAmount
                    : bitwiseOp !== "NOT"
                    ? bitwiseB.dec
                    : ""}
                </Label>
                <div className="-mx-4 -mb-4 border-t border-border">
                  {BASES.map((base) => (
                    <div key={base} className="flex items-stretch border-b border-border last:border-b-0">
                      <span className="flex w-32 shrink-0 items-center px-4 text-sm text-muted-foreground">
                        {BASE_INFO[base].name}
                      </span>
                      <code className="flex flex-1 items-center border-l border-border px-4 font-mono">
                        {BASE_INFO[base].prefix}
                        {bitwiseResult[base]}
                      </code>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reference */}
            <div className="space-y-3 p-4">
              <Label className="font-bold">Reference</Label>
              <div className="segmented grid-cols-2 sm:grid-cols-3 -mx-4 -mb-4 border-x-0 border-b-0">
                {BITWISE_REF.map((r) => (
                  <div key={r.op} className="bg-card p-3">
                    <div className="font-mono text-sm font-bold">{r.op}</div>
                    <p className="text-xs text-muted-foreground">{r.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
