export interface GuidesPref {
	rulers: boolean;
	guides: boolean;
	grid: boolean;
	snap: boolean;
}

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
		// migrate legacy ruler default
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
	}
	for (const l of listeners) l();
}
