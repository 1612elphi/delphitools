/* layout persists independently */

const PREFIX = 'substrata:layout:';

export function loadLayout<T>(key: string, fallback: T): T {
	if (typeof window === 'undefined') return fallback;
	try {
		const raw = window.localStorage.getItem(PREFIX + key);
		if (raw == null) return fallback;
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

export function saveLayout(key: string, value: unknown): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.setItem(
			PREFIX + key,
			JSON.stringify(value),
		);
	} catch {
		/* ignore storage failures */
	}
}
