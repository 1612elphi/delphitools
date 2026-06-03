// Type declarations for the vendored MIT wrapper in `pandoc-core.js`.

export interface PandocConvertResult {
  /** Main text output (when no output-file is set). */
  stdout: string;
  /** Pandoc's stderr (errors + unstructured warnings). */
  stderr: string;
  /** Structured warning objects (shape varies by pandoc version). */
  warnings: unknown[];
  /** Input + output + extracted-media files, keyed by name. Binary as Blob. */
  files: Record<string, Blob | string>;
  /** ONLY extracted media (images etc.), not the main output. */
  mediaFiles: Record<string, Blob>;
}

export interface PandocQueryOptions {
  query:
    | "version"
    | "input-formats"
    | "output-formats"
    | "highlight-styles"
    | "highlight-languages"
    | "default-template"
    | "extensions-for-format";
  format?: string;
}

export interface PandocInstance {
  convert(
    options: Record<string, unknown>,
    stdin: string | null,
    files: Record<string, Blob | string>
  ): Promise<PandocConvertResult>;
  query(options: PandocQueryOptions): unknown;
  pandoc(
    argsStr: string,
    inData: string | Blob | null,
    resources?: Array<{ filename: string; contents: string | Blob }>
  ): Promise<{ out: string | Blob; mediaFiles: Map<string, string | Blob> }>;
}

export function createPandocInstance(
  wasmBinary: ArrayBuffer | Uint8Array
): Promise<PandocInstance>;
