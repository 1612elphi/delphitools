declare module "nerdamer" {
  interface NerdamerResult {
    toString(): string;
    text(format?: string): string;
    evaluate(): NerdamerResult;
    toTeX(): string;
  }

  interface Nerdamer {
    (expression: string, subs?: Record<string, string | number>, option?: string[]): NerdamerResult;
    setVar(name: string, value: string | number): void;
    clearVars(): void;
    solve(expression: string, variable: string): NerdamerResult;
    getCore(): {
      Settings: {
        PARSE2NUMBER: boolean;
      };
    };
  }

  const nerdamer: Nerdamer;
  export = nerdamer;
}

declare module "nerdamer/Algebra" {}
declare module "nerdamer/Calculus" {}
declare module "nerdamer/Solve" {}
