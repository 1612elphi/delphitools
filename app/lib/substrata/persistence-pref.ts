/** persist only after opt-in */

type Listener = () => void;

export function persistencePref(key: string) {
	const listeners = new Set<Listener>();
	return {
		get: (): boolean => {
			if (typeof localStorage === 'undefined') return false;
			try {
				return localStorage.getItem(key) === '1';
			} catch {
				return false;
			}
		},
		set: (enabled: boolean): void => {
			if (typeof localStorage !== 'undefined') {
				try {
					if (enabled)
						localStorage.setItem(key, '1');
					else localStorage.removeItem(key);
				} catch {
					// ignore storage errors
				}
			}
			for (const l of listeners) l();
		},
		subscribe: (listener: Listener): (() => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

const pref = persistencePref('substrata:persist');

export const getPersistenceEnabled = pref.get;
export const setPersistenceEnabled = pref.set;
export const subscribePersistence = pref.subscribe;
