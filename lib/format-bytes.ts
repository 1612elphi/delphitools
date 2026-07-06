/** Human-readable byte size — the B / KB / MB ladder several tools repeat.
 *  123 → "123 B", 4567 → "4.5 KB", 3.2e6 → "3.1 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
