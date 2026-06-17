"use client";

import { useState, useEffect, useRef } from "react";
import { Copy, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// Bundle KaTeX's stylesheet locally (was fetched from cdn.jsdelivr.net, which
// leaked usage off-device and pinned a mismatched version). The bundler also
// inlines KaTeX's font files, so everything stays same-origin.
import "katex/dist/katex.min.css";

type Operation =
  | "simplify"
  | "expand"
  | "factor"
  | "solve"
  | "derivative"
  | "integral";

interface Result {
  input: string;
  output: string;
  latex: string;
  operation: Operation;
  exactOutput?: string;
  exactLatex?: string;
  approxOutput?: string;
  approxLatex?: string;
}

export function AlgebraCalcTool() {
  const [expression, setExpression] = useState("");
  const [variable, setVariable] = useState("x");
  const [operation, setOperation] = useState<Operation>("simplify");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const [nerdamerLoaded, setNerdamerLoaded] = useState(false);
  const [showApproximate, setShowApproximate] = useState(false);

  // Load nerdamer modules
  useEffect(() => {
    const loadNerdamer = async () => {
      try {
        await import("nerdamer");
        await import("nerdamer/Algebra");
        await import("nerdamer/Calculus");
        await import("nerdamer/Solve");
        setNerdamerLoaded(true);
      } catch (e) {
        console.error("Failed to load nerdamer:", e);
      }
    };
    loadNerdamer();
  }, []);

  // Render KaTeX when result changes
  useEffect(() => {
    if (!result?.latex || !resultRef.current) return;

    const renderKaTeX = async () => {
      try {
        const katex = (await import("katex")).default;

        // For solve results, use approximate or exact latex based on toggle
        const latexToRender =
          result.operation === "solve" && showApproximate && result.approxLatex
            ? result.approxLatex
            : result.operation === "solve" && result.exactLatex
            ? result.exactLatex
            : result.latex;

        resultRef.current!.innerHTML = katex.renderToString(latexToRender, {
          throwOnError: false,
          displayMode: true,
        });
      } catch {
        // Fallback to plain text
        if (resultRef.current) {
          const outputToShow =
            result.operation === "solve" && showApproximate && result.approxOutput
              ? result.approxOutput
              : result.operation === "solve" && result.exactOutput
              ? result.exactOutput
              : result.output;
          resultRef.current.textContent = outputToShow;
        }
      }
    };
    renderKaTeX();
  }, [result, showApproximate]);

  const calculate = async () => {
    if (!expression.trim() || !nerdamerLoaded) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setShowApproximate(false);

    try {
      const nerdamer = (await import("nerdamer")).default;

      let output: string;
      let latex: string;

      switch (operation) {
        case "simplify":
          const simplified = nerdamer(expression).text("fractions");
          output = simplified;
          latex = nerdamer(expression).toTeX();
          break;

        case "expand":
          const expanded = nerdamer(`expand(${expression})`).text("fractions");
          output = expanded;
          latex = nerdamer(`expand(${expression})`).toTeX();
          break;

        case "factor":
          const factored = nerdamer(`factor(${expression})`).text("fractions");
          output = factored;
          latex = nerdamer(`factor(${expression})`).toTeX();
          break;

        case "solve":
          const solveResult = nerdamer.solve(expression, variable);
          // Get exact fractions
          const exactSolutions = solveResult.text("fractions");
          output = exactSolutions;

          // Parse solutions array - remove brackets and split
          const solArray = exactSolutions.slice(1, -1).split(",").filter(Boolean);

          // Generate exact LaTeX with proper fractions
          const exactLatexParts = solArray.map((sol) => {
            try {
              return nerdamer(sol.trim()).toTeX();
            } catch {
              return sol.trim();
            }
          });
          const exactLatex =
            variable +
            " = " +
            (exactLatexParts.length > 1
              ? "\\left\\{" + exactLatexParts.join(", \\, ") + "\\right\\}"
              : exactLatexParts[0] || "\\text{No solution}");

          // Generate approximate (decimal) values
          const approxParts = solArray.map((sol) => {
            try {
              const evaluated = nerdamer(sol.trim()).evaluate().text("decimals");
              // Round to reasonable precision
              const num = parseFloat(evaluated);
              return isNaN(num) ? evaluated : num.toPrecision(10).replace(/\.?0+$/, "");
            } catch {
              return sol.trim();
            }
          });
          const approxOutput = "[" + approxParts.join(",") + "]";
          const approxLatex =
            variable +
            " \\approx " +
            (approxParts.length > 1
              ? "\\left\\{" + approxParts.join(", \\, ") + "\\right\\}"
              : approxParts[0] || "\\text{No solution}");

          latex = exactLatex;
          setResult({
            input: expression,
            output,
            latex,
            operation,
            exactOutput: exactSolutions,
            exactLatex,
            approxOutput,
            approxLatex,
          });
          setLoading(false);
          return;

        case "derivative":
          const derivative = nerdamer(`diff(${expression}, ${variable})`).text(
            "fractions"
          );
          output = derivative;
          latex =
            "\\frac{d}{d" +
            variable +
            "}" +
            nerdamer(expression).toTeX() +
            " = " +
            nerdamer(`diff(${expression}, ${variable})`).toTeX();
          break;

        case "integral":
          const integral = nerdamer(`integrate(${expression}, ${variable})`).text(
            "fractions"
          );
          output = integral + " + C";
          latex =
            "\\int " +
            nerdamer(expression).toTeX() +
            " \\, d" +
            variable +
            " = " +
            nerdamer(`integrate(${expression}, ${variable})`).toTeX() +
            " + C";
          break;

        default:
          throw new Error("Unknown operation");
      }

      setResult({
        input: expression,
        output,
        latex,
        operation,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid expression");
    } finally {
      setLoading(false);
    }
  };

  const copyResult = async () => {
    if (result) {
      const textToCopy =
        result.operation === "solve" && showApproximate && result.approxOutput
          ? result.approxOutput
          : result.operation === "solve" && result.exactOutput
          ? result.exactOutput
          : result.output;
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      calculate();
    }
  };

  const examples: Record<Operation, string[]> = {
    simplify: ["(x+1)^2 - x^2", "sin(x)^2 + cos(x)^2", "(a*b)/(a*c)"],
    expand: ["(x+1)^3", "(a+b)*(a-b)", "(x+y+z)^2"],
    factor: ["x^2 - 4", "x^3 - 1", "x^2 + 5*x + 6"],
    solve: ["x^2 - 4 = 0", "2*x + 3 = 7", "x^2 + x - 6 = 0"],
    derivative: ["x^3", "sin(x)*cos(x)", "e^x * x^2"],
    integral: ["x^2", "sin(x)", "1/x"],
  };

  const showVariable =
    operation === "solve" || operation === "derivative" || operation === "integral";

  return (
    <div className="border-2 border-border">
      {/* Operation selector */}
      <div className="segmented grid-cols-6 -m-px">
        {(["simplify", "expand", "factor", "solve", "derivative", "integral"] as Operation[]).map(
          (op) => (
            <Button
              key={op}
              variant={operation === op ? "default" : "outline"}
              onClick={() => setOperation(op)}
              className="h-10 text-sm font-bold"
            >
              {op === "derivative" ? "d/dx" : op === "integral" ? "∫" : op.charAt(0).toUpperCase() + op.slice(1)}
            </Button>
          )
        )}
      </div>

      {/* Expression input */}
      <div className="border-b-2 border-border p-4 space-y-1">
        <label className="font-bold text-sm">Expression</label>
        <div className="flex items-stretch gap-0 border border-border">
          <Input
            id="expression"
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              operation === "solve"
                ? "e.g., x^2 - 4 = 0"
                : "e.g., (x+1)^2 - x^2"
            }
            className="flex-1 border-0 text-lg"
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
          />
          {showVariable && (
            <div className="flex items-center border-l border-border">
              <span className="px-3 text-sm text-muted-foreground select-none">var</span>
              <Input
                id="variable"
                value={variable}
                onChange={(e) => setVariable(e.target.value || "x")}
                className="w-12 border-0 text-center"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                maxLength={2}
              />
            </div>
          )}
        </div>
      </div>

      {/* Calculate button */}
      <Button
        onClick={calculate}
        disabled={!expression.trim() || loading || !nerdamerLoaded}
        className="h-14 w-full text-lg font-bold border-b-2 border-border"
      >
        {loading ? (
          <>
            <Loader2 className="size-4 mr-2 animate-spin" />
            Calculating…
          </>
        ) : (
          "Calculate"
        )}
      </Button>

      {/* Result */}
      {(result || error) && (
        <div className="border-b-2 border-border">
          {error ? (
            <div className="p-4 text-destructive border-b border-border">{error}</div>
          ) : (
            <>
              {/* Input echo */}
              <div className="flex items-center border-b border-border px-4 py-2 text-sm text-muted-foreground gap-2">
                <span>Input:</span>
                <span
                  className="text-foreground"
                  style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                >
                  {result?.input}
                </span>
              </div>

              {/* KaTeX rendered result */}
              <div
                ref={resultRef}
                className="px-4 py-6 text-2xl overflow-x-auto border-b border-border"
              />

              {/* Plain-text output + actions */}
              <div className="flex items-stretch border-b border-border">
                <div
                  className="flex-1 px-4 py-3 text-sm overflow-x-auto self-center"
                  style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                >
                  {result?.operation === "solve" && showApproximate && result?.approxOutput
                    ? result.approxOutput
                    : result?.operation === "solve" && result?.exactOutput
                    ? result.exactOutput
                    : result?.output}
                </div>
                {result?.operation === "solve" && result?.approxOutput && (
                  <Button
                    variant={showApproximate ? "default" : "outline"}
                    onClick={() => setShowApproximate(!showApproximate)}
                    className="h-auto self-stretch border-0 border-l border-border text-sm px-4"
                  >
                    {showApproximate ? "Exact" : "≈ Approx"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={copyResult}
                  className="h-auto self-stretch border-0 border-l border-border px-4"
                >
                  {copied ? (
                    <Check className="size-4" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Examples */}
      <div className="border-b-2 border-border">
        <div className="px-4 pt-4 pb-2">
          <label className="font-bold text-sm">Examples</label>
        </div>
        <div className="flex flex-wrap border-t border-border">
          {examples[operation].map((ex, i) => (
            <button
              key={ex}
              onClick={() => setExpression(ex)}
              className={`px-4 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors border-b border-border${i > 0 ? " border-l border-border" : ""}`}
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {/* Syntax Reference */}
      <div>
        <div className="px-4 pt-4 pb-2">
          <label className="font-bold text-sm">Syntax Reference</label>
        </div>
        <div className="border-t border-border">
          {[
            ["Power", "x^2"],
            ["Multiply", "a*b"],
            ["Divide", "a/b"],
            ["Square root", "sqrt(x)"],
            ["Trig", "sin(x)"],
            ["Natural log", "log(x)"],
            ["Euler's number", "e"],
            ["Pi", "pi"],
            ["Absolute", "abs(x)"],
          ].map(([label, syntax], i) => (
            <div
              key={label}
              className={`flex items-center border-b border-border last:border-b-0${i % 2 === 0 ? "" : ""}`}
            >
              <span className="px-4 py-2 text-sm text-muted-foreground flex-1">{label}</span>
              <span
                className="px-4 py-2 text-sm border-l border-border"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              >
                {syntax}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
