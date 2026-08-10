import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';

/**
 * Small-screen notice (Ruby 2026-07-12): a dismissible banner on sub-768px
 * viewports — the editor works there but isn't designed for it yet. Wording
 * is Ruby's dictation, shipped verbatim. Dismissal sticks via localStorage
 * (the layout-pref precedent: UI ergonomics, not document content).
 * Non-blocking: fixed above the canvas chrome, the editor stays usable.
 */

const SEEN_KEY = 'substrata:small-screen-notice-seen';

function isSeen(): boolean {
	try {
		return !!localStorage.getItem(SEEN_KEY);
	} catch {
		return false;
	}
}

export default class SmallScreenNotice extends Component {
	@tracked seen = isSeen();
	@tracked isMobile = false;

	#mq = window.matchMedia('(max-width: 767px)');
	#onChange = () => {
		this.isMobile = this.#mq.matches;
	};

	constructor(...args: ConstructorParameters<typeof Component>) {
		super(...args);
		this.isMobile = this.#mq.matches;
		this.#mq.addEventListener('change', this.#onChange);
	}

	willDestroy() {
		super.willDestroy();
		this.#mq.removeEventListener('change', this.#onChange);
	}

	get hidden() {
		return !this.isMobile || this.seen;
	}

	markSeen = () => {
		try {
			localStorage.setItem(SEEN_KEY, '1');
		} catch {
			// storage blocked — the notice returns next visit, acceptable
		}
		this.seen = true;
	};

	<template>
		{{#unless this.hidden}}
			<div class="sub-small-notice">
				{{! wording carried over verbatim from the Next app }}
				<p class="sub-small-notice-body">
					Substrata works best on a bigger screen.
					You can still use it here, but please
					don’t email me about issues arising from
					your screen being too small. I’m
					actively working on a mobile version,
					please be patient.
				</p>
				<p class="sub-small-notice-sign">Love, delphi</p>
				<div class="sub-small-notice-bar">
					<button
						type="button"
						class="sub-small-notice-btn"
						{{on "click" this.markSeen}}
					>
						all right all right
					</button>
				</div>
			</div>
		{{/unless}}
	</template>
}
