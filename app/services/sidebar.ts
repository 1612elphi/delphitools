import Service from '@ember/service';
import type Owner from '@ember/owner';
import { tracked } from '@glimmer/tracking';

const COOKIE = 'sidebar_state';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const MOBILE_BREAKPOINT = 768;
const SHORTCUT = 'b';

export default class SidebarService extends Service {
	@tracked open = true;
	@tracked openMobile = false;
	@tracked isMobile = false;

	#media?: MediaQueryList;

	constructor(owner: Owner) {
		super(owner);
		if (typeof window === 'undefined') return;

		// match cookie boundary
		const stored = new RegExp(
			`(?:^|;\\s*)${COOKIE}=(true|false)`,
		).exec(document.cookie);
		this.open = stored ? stored[1] === 'true' : true;

		this.#media = window.matchMedia(
			`(max-width: ${MOBILE_BREAKPOINT - 1}px)`,
		);
		this.isMobile = this.#media.matches;
		this.#media.addEventListener('change', this.#onMediaChange);

		window.addEventListener('keydown', this.#onKeydown);
	}

	willDestroy() {
		super.willDestroy();
		this.#media?.removeEventListener('change', this.#onMediaChange);
		window.removeEventListener('keydown', this.#onKeydown);
	}

	get state() {
		return this.open ? 'expanded' : 'collapsed';
	}

	toggle = () => {
		if (this.isMobile) {
			this.openMobile = !this.openMobile;
			return;
		}
		this.open = !this.open;
		document.cookie = `${COOKIE}=${this.open}; path=/; max-age=${COOKIE_MAX_AGE}`;
	};

	closeMobile = () => {
		this.openMobile = false;
	};

	setMobile = (isMobile: boolean) => {
		this.isMobile = isMobile;
		if (!isMobile) this.openMobile = false;
	};

	#onMediaChange = (e: MediaQueryListEvent) => {
		this.setMobile(e.matches);
	};

	#onKeydown = (e: KeyboardEvent) => {
		if (e.key === SHORTCUT && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			this.toggle();
		}
	};
}

declare module '@ember/service' {
	interface Registry {
		sidebar: SidebarService;
	}
}
