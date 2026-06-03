/* Tiny helpers for triggering a client-side file download from a Blob/string.
 * The Blob + object-URL + <a download> dance is repeated across several tools;
 * new tools should reach for these. */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Revoke on the next tick so the navigation/download has started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadText(
  text: string,
  filename: string,
  mimeType = "text/plain;charset=utf-8"
): void {
  downloadBlob(new Blob([text], { type: mimeType }), filename);
}
