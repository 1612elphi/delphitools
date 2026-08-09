import Service from '@ember/service';
import type Owner from '@ember/owner';
import { tracked } from '@glimmer/tracking';

const COOKIE = 'sidebar_state';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const MOBILE_BREAKPOINT = 768;
const SHORTCUT = 'b';

/**
 * Sidebar open/collapsed state, replacing shadcn's SidebarProvider context.
 *
 * Two independent states, as in the Next app: on desktop the rail collapses to
 * icons and the choice persists in a cookie; on mobile it is an off-canvas
 * drawer that always starts closed.
 */
export default class SidebarService extends Service {
	@tracked open = true;
	@tracked openMobile = false;
	@tracked isMobile = false;

	#media?: MediaQueryList;

	constructor(owner: Owner) {
		super(owner);
		if (typeof window === 'undefined') return;

		// Anchored to a cookie boundary so a different cookie ending in
		// "…sidebar_state" cannot satisfy the match. Absent cookie means expanded.
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

	/**
	 * Crossing the mobile breakpoint. Separate from the listener so the policy is
	 * reachable without dispatching a MediaQueryList event.
	 */
	setMobile = (isMobile: boolean) => {
		this.isMobile = isMobile;
		// Growing past the breakpoint with the drawer open would otherwise leave
		// its full-screen scrim covering the desktop layout.
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
