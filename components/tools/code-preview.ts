// Shared preview helpers for the code generators (QR + barcode), kept here so
// both tools render transparency identically and stay in parity.

// Tailwind class for the checkerboard shown behind a transparent code in the
// preview. The arbitrary-value classes must appear as a literal in a file
// inside Tailwind's content glob (components/tools/ is) so JIT doesn't purge
// them.
export const CHECKERBOARD_CLASS =
  "bg-[repeating-conic-gradient(#e5e7eb_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]";
