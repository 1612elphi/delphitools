"use client";

import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

  return (
    <div className="space-y-6">
      <Tabs defaultValue="converter">
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="converter">Converter</TabsTrigger>
          <TabsTrigger value="bitwise">Bitwise Ops</TabsTrigger>
        </TabsList>

        <TabsContent value="converter" className="space-y-6">
          {/* Base Input Cards */}
          <div className="grid gap-3 sm:grid-cols-2">
            {BASES.map((base) => (
              <div
                key={base}
                className={`p-4 rounded-lg border bg-card transition-colors ${
                  activeBase === base && hasValue ? "ring-2 ring-primary" : ""
                }`}
              >
                <Label className="text-sm text-muted-foreground mb-2 block">
                  {BASE_INFO[base].name}
                </Label>
                <div className="flex items-center gap-2">
                  {BASE_INFO[base].prefix && (
                    <span className="text-muted-foreground font-mono text-sm">
                      {BASE_INFO[base].prefix}
                    </span>
                  )}
                  <Input
                    value={values[base]}
                    onChange={(e) => handleBaseInput(base, e.target.value)}
                    placeholder={BASE_INFO[base].placeholder}
                    className="font-mono flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyValue(base, values[base])}
                    disabled={!values[base]}
                    className="shrink-0"
                  >
                    {copied === base ? (
                      <Check className="size-4 text-green-500" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* Bit Toggle Visualization */}
          {(!hasValue || decimalValue <= 65535) && (
            <div className="space-y-3">
              <Label>Bit Toggle (16-bit)</Label>
              <div className="flex gap-1 flex-wrap">
                {getBits(values.dec).map((bit, idx) => (
                  <button
                    key={idx}
                    onClick={() => toggleBit(idx)}
                    className={`w-8 h-10 text-sm font-mono rounded border transition-colors ${
                      bit
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted hover:bg-accent"
                    }`}
                  >
                    {bit ? "1" : "0"}
                  </button>
                ))}
              </div>
              <div className="flex gap-1 text-xs text-muted-foreground">
                {Array.from({ length: 16 }, (_, i) => (
                  <span key={i} className="w-8 text-center">
                    {15 - i}
                  </span>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="bitwise" className="space-y-6">
          {/* Operation Selector */}
          <div className="flex flex-wrap gap-2">
            {(["AND", "OR", "XOR", "NOT", "LSH", "RSH"] as BitwiseOp[]).map(
              (op) => (
                <Button
                  key={op}
                  variant={bitwiseOp === op ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setBitwiseOp(op);
                    setBitwiseResult(null);
                  }}
                >
                  {op === "LSH" ? "<<" : op === "RSH" ? ">>" : op}
                </Button>
              )
            )}
          </div>

          {/* Value A Card */}
          <div className="p-4 rounded-lg border bg-card">
            <Label className="text-sm text-muted-foreground mb-3 block">
              Value A
            </Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {BASES.map((base) => (
                <div key={base} className="flex items-center gap-2">
                  <span className="w-20 text-sm text-muted-foreground">
                    {BASE_INFO[base].name}
                  </span>
                  {BASE_INFO[base].prefix && (
                    <span className="text-muted-foreground font-mono text-sm">
                      {BASE_INFO[base].prefix}
                    </span>
                  )}
                  <Input
                    value={bitwiseA[base]}
                    onChange={(e) => handleBitwiseInput("a", base, e.target.value)}
                    placeholder={BASE_INFO[base].placeholder}
                    className="font-mono flex-1"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Value B Card (for binary operations) */}
          {bitwiseOp !== "NOT" && bitwiseOp !== "LSH" && bitwiseOp !== "RSH" && (
            <div className="p-4 rounded-lg border bg-card">
              <Label className="text-sm text-muted-foreground mb-3 block">
                Value B
              </Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {BASES.map((base) => (
                  <div key={base} className="flex items-center gap-2">
                    <span className="w-20 text-sm text-muted-foreground">
                      {BASE_INFO[base].name}
                    </span>
                    {BASE_INFO[base].prefix && (
                      <span className="text-muted-foreground font-mono text-sm">
                        {BASE_INFO[base].prefix}
                      </span>
                    )}
                    <Input
                      value={bitwiseB[base]}
                      onChange={(e) => handleBitwiseInput("b", base, e.target.value)}
                      placeholder={BASE_INFO[base].placeholder}
                      className="font-mono flex-1"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Shift Amount (for shift operations) */}
          {(bitwiseOp === "LSH" || bitwiseOp === "RSH") && (
            <div className="p-4 rounded-lg border bg-card">
              <Label className="text-sm text-muted-foreground mb-3 block">
                Shift Amount
              </Label>
              <Input
                type="number"
                value={shiftAmount}
                onChange={(e) => setShiftAmount(e.target.value)}
                placeholder="1"
                className="font-mono w-24"
                min={0}
                max={31}
              />
            </div>
          )}

          <Button onClick={calculateBitwise} className="w-full">
            Calculate
          </Button>

          {/* Result Card */}
          {bitwiseResult && (
            <div className="p-4 rounded-lg border bg-card">
              <Label className="text-sm text-muted-foreground mb-3 block">
                Result: {bitwiseA.dec} {bitwiseOp === "NOT" ? "~" : bitwiseOp === "LSH" ? "<<" : bitwiseOp === "RSH" ? ">>" : bitwiseOp}{" "}
                {bitwiseOp === "LSH" || bitwiseOp === "RSH"
                  ? shiftAmount
                  : bitwiseOp !== "NOT"
                  ? bitwiseB.dec
                  : ""}
              </Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {BASES.map((base) => (
                  <div key={base} className="flex items-center gap-2">
                    <span className="w-20 text-sm text-muted-foreground">
                      {BASE_INFO[base].name}
                    </span>
                    <code className="font-mono">
                      {BASE_INFO[base].prefix}
                      {bitwiseResult[base]}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Reference */}
          <div className="p-4 rounded-lg border bg-card">
            <h3 className="font-medium mb-3 text-sm text-muted-foreground">Reference</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <span className="font-mono">AND (&)</span>
                <p className="text-muted-foreground text-xs">1 if both bits are 1</p>
              </div>
              <div>
                <span className="font-mono">OR (|)</span>
                <p className="text-muted-foreground text-xs">1 if either bit is 1</p>
              </div>
              <div>
                <span className="font-mono">XOR (^)</span>
                <p className="text-muted-foreground text-xs">1 if bits differ</p>
              </div>
              <div>
                <span className="font-mono">NOT (~)</span>
                <p className="text-muted-foreground text-xs">Flip all bits</p>
              </div>
              <div>
                <span className="font-mono">&lt;&lt; (LSH)</span>
                <p className="text-muted-foreground text-xs">Shift bits left</p>
              </div>
              <div>
                <span className="font-mono">&gt;&gt; (RSH)</span>
                <p className="text-muted-foreground text-xs">Shift bits right</p>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
