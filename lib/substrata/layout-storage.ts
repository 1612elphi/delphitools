/**
 * localStorage persistence for the editor's UI LAYOUT preferences — which edge
 * the omnibar/rail dock to and which modules are pinned / where they dock.
 *
 * This is chrome ergonomics, NOT document content, so it is deliberately NOT
 * gated behind the opt-in project-persistence flag: that hangup is about the
 * user's *work* (pixels, scenes) never touching the browser uninvited; this is
 * only "where did I leave my panels", which carries no user content. SSR-safe —
 * every access guards on `window` and swallows quota/disabled-storage errors.
 */

const PREFIX = "substrata:layout:";

export function loadLayout<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveLayout(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota exceeded or storage disabled — layout memory is best-effort */
  }
}
