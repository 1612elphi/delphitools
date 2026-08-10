/**
 * Guides preferences (Workspace ▸ Guides, M2-12 + rulers pass 2026-07-07):
 * rulers / guides / grid / snap toggles. Transient workspace ergonomics, NOT
 * document content — persisted to localStorage like the dock/pin layout
 * (layout-storage rationale), never gated on the storage opt-in. Rulers +
 * snap default ON (the mockup's resting state); grid defaults off. `guides`
 * is VISIBILITY of the dragged-out guidelines — their positions are document
 * content (doc-model `guides: Guide[]`), the same split as rulers-vs-layers.
 */

export interface GuidesPref {
	rulers: boolean;
	/** show (and snap to) the document's dragged-out guidelines */
	guides: boolean;
	grid: boolean;
	snap: boolean;
}

/** Grid pitch in scene px — a placeholder default until a product call. */
export const GRID_SIZE = 50;

const KEY = 'substrata:guides';
const DEFAULTS: GuidesPref = {
	rulers: true,
	guides: true,
	grid: false,
	snap: true,
};

function load(): GuidesPref {
	if (typeof window === 'undefined') return DEFAULTS;
	try {
		const raw = window.localStorage.getItem(KEY);
		if (!raw) return DEFAULTS;
		const parsed = JSON.parse(raw) as Partial<GuidesPref>;
		// Prefs stored BEFORE the rulers pass (no `guides` key yet) pinned
		// rulers:false from the old default — the ratified rulers-ON default
		// would never reach existing users. The missing key doubles as the
		// version marker: migrate rulers to ON once.
		if (parsed.guides === undefined) parsed.rulers = true;
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
