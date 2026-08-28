import Service from '@ember/service';
import type Owner from '@ember/owner';
import { tracked } from '@glimmer/tracking';

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

const MOBILE = 640;
const TABLET = 1024;

export default class BreakpointService extends Service {
	@tracked current: Breakpoint = 'desktop';
	@tracked isTouch = false;

	#queries: MediaQueryList[] = [];

	constructor(owner: Owner) {
		super(owner);
		if (typeof window === 'undefined') return;

		this.#queries = [
			window.matchMedia(`(max-width: ${MOBILE - 1}px)`),
			window.matchMedia(`(max-width: ${TABLET - 1}px)`),
		];
		for (const q of this.#queries)
			q.addEventListener('change', this.#update);
		this.#update();

		this.isTouch =
			'ontouchstart' in window ||
			navigator.maxTouchPoints > 0;
	}

	willDestroy() {
		super.willDestroy();
		for (const q of this.#queries)
			q.removeEventListener('change', this.#update);
	}

	#update = () => {
		const [mobile, tablet] = this.#queries;
		this.current = mobile!.matches
			? 'mobile'
			: tablet!.matches
				? 'tablet'
				: 'desktop';
	};
}

declare module '@ember/service' {
	interface Registry {
		breakpoint: BreakpointService;
	}
}
