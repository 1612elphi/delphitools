/**
 * Persistence preference — opt-in local storage (M1-9). Privacy-first hard rule:
 * NOTHING is written to the browser (IndexedDB doc/blobs) until the user
 * explicitly turns local storage ON. Off by default. The only thing ever stored
 * for an opted-out user is nothing at all — the preference key is written on
 * opt-in and REMOVED on opt-out, so "off" leaves zero trace.
 *
 * SSR-safe; defaults to false off the main thread / on the server.
 */

const KEY = 'substrata:persist';

type Listener = () => void;
const listeners = new Set<Listener>();

export function getPersistenceEnabled(): boolean {
	if (typeof localStorage === 'undefined') return false;
	try {
		return localStorage.getItem(KEY) === '1';
	} catch {
		return false;
	}
}

export function setPersistenceEnabled(enabled: boolean): void {
	if (typeof localStorage !== 'undefined') {
		try {
			if (enabled) localStorage.setItem(KEY, '1');
			else localStorage.removeItem(KEY);
		} catch {
			/* private mode / blocked storage — preference just won't persist */
		}
	}
	for (const l of listeners) l();
}

export function subscribePersistence(listener: Listener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
