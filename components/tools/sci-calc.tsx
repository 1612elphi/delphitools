"use client";

import { useState, useEffect, useCallback } from "react";
import { Delete, History, ChevronDown, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { MATH_CONSTANTS, formatScientific } from "@/lib/math-constants";
import { evaluate, pi, e as eulerE } from "mathjs";

type AngleMode = "deg" | "rad";

interface HistoryItem {
  expression: string;
  result: string;
}

// Main button rows (5 columns each)
const BUTTON_ROWS = [
  ["C", "(", ")", "%", "⌫"],
  ["sin", "cos", "tan", "π", "÷"],
  ["asin", "acos", "atan", "e", "×"],
  ["x²", "√", "xʸ", "ʸ√x", "−"],
  ["log", "ln", "!", "|x|", "+"],
  ["7", "8", "9", "10ˣ", "eˣ"],
  ["4", "5", "6", "Const", "Ans"],
];

// Bottom two rows handled specially for double-height =
const BOTTOM_LEFT = [
  ["1", "2", "3", "."],
  ["0", "±", "EE", "mod"],
];

export function SciCalcTool() {
  const [expression, setExpression] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [angleMode, setAngleMode] = useState<AngleMode>("deg");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [lastAnswer, setLastAnswer] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [constantsOpen, setConstantsOpen] = useState(false);

  // Convert expression for evaluation
  const prepareExpression = useCallback(
    (expr: string): string => {
      return expr
        .replace(/×/g, "*")
        .replace(/÷/g, "/")
        .replace(/−/g, "-")
        .replace(/π/g, `(${pi})`)
        // Protect scientific notation (e.g., 5e10, 3.14e-5) before replacing standalone e
        .replace(/(\d\.?\d*)[eE]([+-]?\d)/g, "$1e$2")
        // Replace standalone e with Euler's number (not followed by x or digit, not preceded by digit)
        .replace(/(^|[^0-9])e(?!x|[0-9])/g, `$1(${eulerE})`)
        .replace(/Ans/g, `(${lastAnswer})`)
        .replace(/(\d+)!/g, "factorial($1)")
        .replace(/\|([^|]+)\|/g, "abs($1)");
    },
    [lastAnswer]
  );

  // Calculate result
  const calculate = useCallback(() => {
    if (!expression.trim()) return;

    try {
      const prepared = prepareExpression(expression);
      // Override trig functions in scope for deg mode — handled at eval time,
      // so nested calls compose correctly without string rewriting.
      const scope =
        angleMode === "deg"
          ? {
              sin: (x: number) => Math.sin((x * Math.PI) / 180),
              cos: (x: number) => Math.cos((x * Math.PI) / 180),
              tan: (x: number) => Math.tan((x * Math.PI) / 180),
              asin: (x: number) => (Math.asin(x) * 180) / Math.PI,
              acos: (x: number) => (Math.acos(x) * 180) / Math.PI,
              atan: (x: number) => (Math.atan(x) * 180) / Math.PI,
            }
          : {};
      const evalResult = evaluate(prepared, scope);
      const resultStr =
        typeof evalResult === "number"
          ? formatScientific(evalResult)
          : String(evalResult);

      setResult(resultStr);
      setError(null);
      setLastAnswer(typeof evalResult === "number" ? evalResult : 0);

      setHistory((prev) => [
        { expression, result: resultStr },
        ...prev.slice(0, 19),
      ]);
    } catch {
      setError("Error");
      setResult(null);
    }
  }, [expression, prepareExpression, angleMode]);

  // Handle button press
  const handleButton = useCallback(
    (btn: string) => {
      setError(null);

      switch (btn) {
        case "C":
          setExpression("");
          setResult(null);
          break;
        case "⌫":
          setExpression((prev) => prev.slice(0, -1));
          break;
        case "=":
          calculate();
          break;
        case "±":
          if (result !== null) {
            const num = parseFloat(result.replace(/[^\d.-]/g, ""));
            if (!isNaN(num)) {
              setExpression(String(-num));
              setResult(null);
            }
          } else if (expression) {
            setExpression((prev) => {
              if (prev.startsWith("-")) return prev.slice(1);
              return "-" + prev;
            });
          }
          break;
        case "x²":
          setExpression((prev) => `(${prev || "0"})^2`);
          break;
        case "√":
          setExpression((prev) => `sqrt(${prev || ""})`);
          break;
        case "xʸ":
          setExpression((prev) => prev + "^");
          break;
        case "ʸ√x":
          setExpression((prev) => prev + "nthRoot(");
          break;
        case "10ˣ":
          setExpression((prev) => `10^(${prev || ""})`);
          break;
        case "eˣ":
          setExpression((prev) => `exp(${prev || ""})`);
          break;
        case "log":
          setExpression((prev) => prev + "log10(");
          break;
        case "ln":
          setExpression((prev) => prev + "log(");
          break;
        case "!":
          setExpression((prev) => prev + "!");
          break;
        case "|x|":
          setExpression((prev) => `|${prev || ""}|`);
          break;
        case "sin":
        case "cos":
        case "tan":
        case "asin":
        case "acos":
        case "atan":
          setExpression((prev) => prev + btn + "(");
          break;
        case "EE":
          setExpression((prev) => prev + "e");
          break;
        case "mod":
          setExpression((prev) => prev + " mod ");
          break;
        case "Ans":
          setExpression((prev) => prev + "Ans");
          break;
        default:
          // If we have a result and user starts typing a number, start fresh
          if (result !== null && /^[0-9.]$/.test(btn)) {
            setExpression(btn);
            setResult(null);
          } else {
            setExpression((prev) => prev + btn);
          }
      }
    },
    [calculate, result, expression]
  );

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      const key = e.key;
      if (/^[0-9.+\-*/()%^]$/.test(key)) {
        e.preventDefault();
        let mapped = key;
        if (key === "*") mapped = "×";
        if (key === "/") mapped = "÷";
        if (key === "-") mapped = "−";
        handleButton(mapped);
      } else if (key === "Enter") {
        e.preventDefault();
        calculate();
      } else if (key === "Backspace") {
        e.preventDefault();
        handleButton("⌫");
      } else if (key === "Escape") {
        e.preventDefault();
        handleButton("C");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleButton, calculate]);

  const insertConstant = (value: number) => {
    setExpression((prev) => prev + formatScientific(value));
    setConstantsOpen(false);
  };

  const copyResult = async () => {
    if (result) {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const loadFromHistory = (item: HistoryItem) => {
    setExpression(item.expression);
    setResult(item.result);
    setHistoryOpen(false);
  };

  const getButtonStyle = (btn: string) => {
    if (btn === "=") return "bg-primary text-primary-foreground hover:bg-primary/90 text-xl";
    if (["C", "⌫"].includes(btn)) return "bg-destructive/10 text-destructive hover:bg-destructive/20";
    if (["+", "−", "×", "÷", "%"].includes(btn)) return "bg-accent hover:bg-accent/80";
    if (/^[0-9.]$/.test(btn) || btn === "00") return "bg-muted hover:bg-muted/80 font-bold text-lg";
    if (btn === "Const") return "bg-accent hover:bg-accent/80 font-medium";
    return "bg-card hover:bg-accent/50";
  };

  const renderButton = (btn: string, extraClass = "") => {
    if (btn === "⌫") {
      return (
        <Button
          key={btn}
          variant="outline"
          className={`h-12 ${getButtonStyle(btn)} ${extraClass}`}
          onClick={() => handleButton(btn)}
        >
          <Delete className="size-5" />
        </Button>
      );
    }

    if (btn === "Const") {
      return (
        <Popover key={btn} open={constantsOpen} onOpenChange={setConstantsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={`h-12 text-sm ${getButtonStyle(btn)} ${extraClass}`}
            >
              Const
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search constants..." />
              <CommandList>
                <CommandEmpty>No constant found.</CommandEmpty>
                <CommandGroup heading="Mathematical">
                  {MATH_CONSTANTS.filter(c => c.category === "mathematical").map((c) => (
                    <CommandItem
                      key={c.name}
                      value={`${c.name} ${c.symbol}`}
                      onSelect={() => insertConstant(c.value)}
                    >
                      <span className="font-bold w-14 shrink-0 font-mono text-xs">{c.symbol}</span>
                      <span className="text-muted-foreground truncate">{c.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandGroup heading="Physical">
                  {MATH_CONSTANTS.filter(c => c.category === "physical").map((c) => (
                    <CommandItem
                      key={c.name}
                      value={`${c.name} ${c.symbol}`}
                      onSelect={() => insertConstant(c.value)}
                    >
                      <span className="font-bold w-14 shrink-0 font-mono text-xs">{c.symbol}</span>
                      <span className="flex-1 text-muted-foreground truncate">{c.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandGroup heading="Chemical">
                  {MATH_CONSTANTS.filter(c => c.category === "chemical").map((c) => (
                    <CommandItem
                      key={c.name}
                      value={`${c.name} ${c.symbol}`}
                      onSelect={() => insertConstant(c.value)}
                    >
                      <span className="font-bold w-14 shrink-0 font-mono text-xs">{c.symbol}</span>
                      <span className="flex-1 text-muted-foreground truncate">{c.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      );
    }

    return (
      <Button
        key={btn}
        variant="outline"
        className={`h-12 text-sm ${getButtonStyle(btn)} ${extraClass}`}
        onClick={() => handleButton(btn)}
      >
        {btn}
      </Button>
    );
  };

  return (
    <div className="mx-auto max-w-md">
      <div className="border-2 border-border">
        {/* Header: angle mode + history */}
        <div className="flex items-stretch border-b-2 border-border">
          <button
            type="button"
            onClick={() => setAngleMode("deg")}
            className={cn(
              "h-12 flex-1 border-r border-border text-sm font-bold transition-colors",
              angleMode === "deg"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            DEG
          </button>
          <button
            type="button"
            onClick={() => setAngleMode("rad")}
            className={cn(
              "h-12 flex-1 border-r border-border text-sm font-bold transition-colors",
              angleMode === "rad"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            RAD
          </button>
          <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex h-12 w-full items-center justify-center gap-2 px-5 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <History className="size-4" />
                History
                <ChevronDown
                  className={cn("size-4 transition-transform", historyOpen && "rotate-180")}
                />
              </button>
            </CollapsibleTrigger>
          </Collapsible>
        </div>

        {/* Display */}
        <div className="border-b-2 border-border bg-muted/30 p-4">
          <div className="space-y-2 text-right">
            <div className="min-h-[28px] break-all font-mono text-lg text-muted-foreground">
              {expression || "0"}
            </div>
            <div className="flex items-center justify-end gap-2">
              <div className={cn("font-mono text-3xl font-bold", error && "text-destructive")}>
                {error || result || "0"}
              </div>
              {result && !error && (
                <Button variant="ghost" size="icon" onClick={copyResult}>
                  {copied ? (
                    <Check className="size-4 text-green-500" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* History panel */}
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
          <CollapsibleContent>
            <div className="max-h-48 overflow-y-auto border-b-2 border-border">
              {history.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No history yet
                </p>
              ) : (
                history.map((item, idx) => (
                  <button
                    key={`${item.expression}=${item.result}-${idx}`}
                    onClick={() => loadFromHistory(item)}
                    className="block w-full border-b border-border px-4 py-2 text-right transition-colors last:border-b-0 hover:bg-muted"
                  >
                    <div className="font-mono text-sm text-muted-foreground">
                      {item.expression}
                    </div>
                    <div className="font-mono font-bold">{item.result}</div>
                  </button>
                ))
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Keypad — one unified hairline grid */}
        <div className="segmented grid-cols-5 border-0">
          {BUTTON_ROWS.flat().map((btn) => renderButton(btn))}
          {BOTTOM_LEFT[0].map((btn) => renderButton(btn))}
          <Button
            key="="
            variant="outline"
            className={cn("row-span-2 h-auto", getButtonStyle("="))}
            onClick={() => handleButton("=")}
          >
            =
          </Button>
          {BOTTOM_LEFT[1].map((btn) => renderButton(btn))}
        </div>
      </div>

      {/* Keyboard hint */}
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Keyboard supported: numbers, operators, Enter to calculate, Escape to clear
      </p>
    </div>
  );
}
