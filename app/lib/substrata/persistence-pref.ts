/** persist only after opt-in */

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
			// ignore storage errors
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
