/**
 * Guides preferences (Workspace ▸ Guides, M2-12): rulers / grid / snap
 * toggles. Transient workspace ergonomics, NOT document content — persisted to
 * localStorage like the dock/pin layout (layout-storage rationale), never
 * gated on the storage opt-in. Snap defaults ON (the mockup's resting state);
 * grid/rulers default off. RULERS have no renderer yet — the toggle stores
 * state for the upcoming rulers pass.
 */

export interface GuidesPref {
  rulers: boolean;
  grid: boolean;
  snap: boolean;
}

/** Grid pitch in scene px — a placeholder default until a product call. */
export const GRID_SIZE = 50;

const KEY = "substrata:guides";
const DEFAULTS: GuidesPref = { rulers: false, grid: false, snap: true };

function load(): GuidesPref {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<GuidesPref>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

let pref: GuidesPref = load();
const listeners = new Set<() => void>();

export function getGuides(): GuidesPref {
  return pref;
}

export function subscribeGuides(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function toggleGuide(key: keyof GuidesPref): void {
  pref = { ...pref, [key]: !pref[key] };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(pref));
  } catch {
    // storage unavailable (private mode) — the toggle still works this session
  }
  for (const l of listeners) l();
}
