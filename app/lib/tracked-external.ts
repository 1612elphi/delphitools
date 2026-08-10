import { tracked } from '@glimmer/tracking';

/**
 * Mirrors a `subscribe` / `getSnapshot` store into tracked state, which is what
 * React's `useSyncExternalStore` does for a React tree.
 *
 * Substrata's state lives in nineteen module-level stores under `lib/substrata`
 * — `doc-store`, `colour-store`, `modal`, `toast` and the rest — each a plain
 * observable with no framework in it. They ported unchanged; only the binding
 * is per-framework, and this is it.
 *
 * `read` is called on every notification, so it should derive rather than
 * allocate: a component that only wants one field passes a reader for that
 * field and re-renders when it changes, not when anything in the store does.
 *
 * The caller owns the lifetime. In a Glimmer component that means calling
 * `unsubscribe` from `willDestroy`; a service holds it for the app's lifetime
 * and never does.
 */
export class TrackedExternal<T> {
	@tracked current: T;

	#read: () => T;
	#unsubscribe: () => void;

	constructor(
		subscribe: (listener: () => void) => () => void,
		read: () => T,
	) {
		this.#read = read;
		this.current = read();
		this.#unsubscribe = subscribe(() => {
			this.current = this.#read();
		});
	}

	unsubscribe = () => {
		this.#unsubscribe();
	};
}
