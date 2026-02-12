declare module "gifenc" {
  type Format = "rgb565" | "rgb444" | "rgba4444";

  function quantize(
    data: Uint8ClampedArray,
    maxColors: number,
    options?: { format?: Format }
  ): number[][];

  function applyPalette(
    data: Uint8ClampedArray,
    palette: number[][],
    format?: Format
  ): Uint8Array;

  interface GIFEncoderInstance {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: { palette?: number[][] }
    ): void;
    finish(): void;
    bytes(): Uint8Array;
  }

  function GIFEncoder(): GIFEncoderInstance;
}
