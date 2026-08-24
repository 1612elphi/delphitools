import { tracked } from '@glimmer/tracking';

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
