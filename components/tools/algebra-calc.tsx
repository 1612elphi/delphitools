"use client";

import { useState, useEffect, useRef } from "react";
import { Copy, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

  // Load KaTeX CSS
  useEffect(() => {
    const linkId = "katex-css";
    if (!document.getElementById(linkId)) {
      const link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css";
      document.head.appendChild(link);
    }
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

  return (
    <div className="space-y-6">
      {/* Operation Tabs */}
      <Tabs
        value={operation}
        onValueChange={(v) => setOperation(v as Operation)}
      >
        <TabsList className="grid grid-cols-3 sm:grid-cols-6 w-full">
          <TabsTrigger value="simplify">Simplify</TabsTrigger>
          <TabsTrigger value="expand">Expand</TabsTrigger>
          <TabsTrigger value="factor">Factor</TabsTrigger>
          <TabsTrigger value="solve">Solve</TabsTrigger>
          <TabsTrigger value="derivative">d/dx</TabsTrigger>
          <TabsTrigger value="integral">&int;</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Input */}
      <div className="space-y-4">
        <div className="flex gap-3">
          <div className="flex-1 space-y-2">
            <Label htmlFor="expression">Expression</Label>
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
              className="font-mono text-lg"
            />
          </div>
          {(operation === "solve" ||
            operation === "derivative" ||
            operation === "integral") && (
            <div className="w-20 space-y-2">
              <Label htmlFor="variable">Variable</Label>
              <Input
                id="variable"
                value={variable}
                onChange={(e) => setVariable(e.target.value || "x")}
                className="font-mono text-center"
                maxLength={2}
              />
            </div>
          )}
        </div>

        <Button
          onClick={calculate}
          disabled={!expression.trim() || loading || !nerdamerLoaded}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="size-4 mr-2 animate-spin" />
              Calculating...
            </>
          ) : (
            "Calculate"
          )}
        </Button>
      </div>

      {/* Result */}
      {(result || error) && (
        <div
          className={`border rounded-lg p-6 ${
            error ? "border-destructive bg-destructive/5" : "bg-card"
          }`}
        >
          {error ? (
            <p className="text-destructive">{error}</p>
          ) : (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Input: <code className="bg-muted px-2 py-1 rounded">{result?.input}</code>
              </div>

              {/* LaTeX rendered result */}
              <div
                ref={resultRef}
                className="text-2xl font-mono overflow-x-auto py-4"
              />

              {/* Plain text output */}
              <div className="flex items-center justify-between gap-2">
                <code className="bg-muted px-3 py-2 rounded text-sm flex-1 overflow-x-auto">
                  {result?.operation === "solve" && showApproximate && result?.approxOutput
                    ? result.approxOutput
                    : result?.operation === "solve" && result?.exactOutput
                    ? result.exactOutput
                    : result?.output}
                </code>
                <div className="flex items-center gap-2">
                  {result?.operation === "solve" && result?.approxOutput && (
                    <Button
                      variant={showApproximate ? "default" : "outline"}
                      size="sm"
                      onClick={() => setShowApproximate(!showApproximate)}
                    >
                      {showApproximate ? "Exact" : "≈ Approx"}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={copyResult}>
                    {copied ? (
                      <Check className="size-4 mr-2" />
                    ) : (
                      <Copy className="size-4 mr-2" />
                    )}
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Examples */}
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Try an example:</p>
        <div className="flex flex-wrap gap-2">
          {examples[operation].map((ex) => (
            <button
              key={ex}
              onClick={() => setExpression(ex)}
              className="px-3 py-1 text-sm bg-muted hover:bg-accent rounded-md font-mono transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {/* Syntax Reference */}
      <div className="border rounded-lg p-4 bg-card">
        <h3 className="font-medium mb-3">Syntax Reference</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">Power:</span>{" "}
            <code className="bg-muted px-1 rounded">x^2</code>
          </div>
          <div>
            <span className="text-muted-foreground">Multiply:</span>{" "}
            <code className="bg-muted px-1 rounded">a*b</code>
          </div>
          <div>
            <span className="text-muted-foreground">Divide:</span>{" "}
            <code className="bg-muted px-1 rounded">a/b</code>
          </div>
          <div>
            <span className="text-muted-foreground">Square root:</span>{" "}
            <code className="bg-muted px-1 rounded">sqrt(x)</code>
          </div>
          <div>
            <span className="text-muted-foreground">Trig:</span>{" "}
            <code className="bg-muted px-1 rounded">sin(x)</code>
          </div>
          <div>
            <span className="text-muted-foreground">Natural log:</span>{" "}
            <code className="bg-muted px-1 rounded">log(x)</code>
          </div>
          <div>
            <span className="text-muted-foreground">Euler&apos;s number:</span>{" "}
            <code className="bg-muted px-1 rounded">e</code>
          </div>
          <div>
            <span className="text-muted-foreground">Pi:</span>{" "}
            <code className="bg-muted px-1 rounded">pi</code>
          </div>
          <div>
            <span className="text-muted-foreground">Absolute:</span>{" "}
            <code className="bg-muted px-1 rounded">abs(x)</code>
          </div>
        </div>
      </div>
    </div>
  );
}
