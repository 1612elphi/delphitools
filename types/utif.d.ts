declare module "utif" {
  function encodeImage(
    rgba: Uint8ClampedArray,
    width: number,
    height: number
  ): ArrayBuffer;

  function decode(buffer: ArrayBuffer): Array<{
    width: number;
    height: number;
    data: Uint8Array;
  }>;

  function toRGBA8(page: { width: number; height: number; data: Uint8Array }): Uint8Array;
}
