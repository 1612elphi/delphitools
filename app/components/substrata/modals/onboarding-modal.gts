import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import Icon from 'delphitools-v2/components/icon';
import { finishOnboarding } from 'delphitools-v2/lib/substrata/onboarding-pref';
import {
	getPersistenceEnabled,
	setPersistenceEnabled,
	subscribePersistence,
} from 'delphitools-v2/lib/substrata/persistence-pref';
import { toast } from 'delphitools-v2/lib/substrata/toast';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

/**
 * First-visit onboarding (Ruby 2026-07-12) — slides, wording dictated by Ruby
 * verbatim and carried over from the Next app unchanged. The storage slide
 * carries the opt-in as a big friendly button reusing the toggle's shipped
 * label. Closing by ANY means (Done, Esc) marks the flow seen and hands over
 * to the New-scene dialog when the session is still on an empty scene.
 */

const BUG_MAILTO = 'mailto:tools@rmv.fyi?subject=substrata%20bug%20report';
const REPO_URL = 'https://github.com/1612elphi/delphitools';

class StorageButton extends Component {
	enabled = new TrackedExternal(
		subscribePersistence,
		getPersistenceEnabled,
	);

	willDestroy() {
		super.willDestroy();
		this.enabled.unsubscribe();
	}

	turnOn = () => {
		setPersistenceEnabled(true);
		toast('saved');
	};

	<template>
		<button
			type="button"
			class="sub-modal-btn is-primary sub-onb-storage"
			disabled={{this.enabled.current}}
			{{on "click" this.turnOn}}
		>
			{{#if this.enabled.current}}
				<Icon @name="check" />
			{{else}}
				<Icon @name="hard-drive" />
			{{/if}}
			{{! the persistence toggle's shipped label, reused }}
			Save in this browser
		</button>
	</template>
}

// touch devices only: the two-finger navigation nobody would discover
// unprompted
const touch = navigator.maxTouchPoints > 1;

// slide ids in order; "touch" is present only on touch devices
const SLIDE_IDS = touch
	? (['hello', 'local', 'private', 'storage', 'touch', 'beta'] as const)
	: (['hello', 'local', 'private', 'storage', 'beta'] as const);

export default class OnboardingModal extends Component {
	@tracked slide = 0;
	// every close path (the final button here; Esc in ModalHost) routes
	// through finishOnboarding — see onboarding-pref

	slideIds = SLIDE_IDS;

	get slideId() {
		return SLIDE_IDS[this.slide] ?? 'hello';
	}

	get atStart() {
		return this.slide === 0;
	}

	get atEnd() {
		return this.slide === SLIDE_IDS.length - 1;
	}

	isCurrent = (id: string) => this.slideId === id;

	back = () => {
		this.slide = Math.max(0, this.slide - 1);
	};

	next = () => {
		this.slide = Math.min(SLIDE_IDS.length - 1, this.slide + 1);
	};

	done = () => finishOnboarding();

	<template>
		<div class="sub-modal-frame sub-onb">
			{{! no visible chrome (Ruby 2026-07-12): one box, content + nav
				only. All slide copy is Ruby's shipped wording, verbatim. }}
			<h2 class="dt-sr-only">Substrata</h2>

			<div class="sub-onb-slide">
				{{#if (this.isCurrent "hello")}}
					<img
						src="/substrata/onboarding/workshop.png"
						alt=""
						width="999"
						height="1000"
						class="sub-onb-art"
					/>
					<p>
						Hi, this is Substrata, the
						delphitools image editor. It
						does effects, layers, filters,
						film sims, cropping, text and
						more.
					</p>
					<p>It's still in early access, so
						calibrate your excitement.</p>
				{{else if (this.isCurrent "local")}}
					<img
						src="/substrata/onboarding/local.png"
						alt=""
						width="1000"
						height="731"
						class="sub-onb-art"
					/>
					<p>
						Everything is local, everything
						runs on your browser. This means
						that it might be slow on low-end
						machines.
					</p>
				{{else if (this.isCurrent "private")}}
					<img
						src="/substrata/onboarding/private.png"
						alt=""
						width="1000"
						height="622"
						class="sub-onb-art"
					/>
					<p>
						Because this is in your browser,
						it’s entirely private by design.
						Nothing of your data, no images,
						no clicks, no mouse movements,
						no analytics, will be sent back
						to the server. And I can prove
						this, since it’s all
						<a
							href={{REPO_URL}}
							target="_blank"
							rel="noopener noreferrer"
							class="sub-onb-link"
						>open source</a>.
					</p>
					<p class="sub-onb-footnote">
						One footnote: a few heavyweight
						tools download themselves on
						first use — the background
						remover fetches its model, for
						instance. This is data going to
						you, not to me.
					</p>
				{{else if (this.isCurrent "storage")}}
					<p>
						If you want to store your
						settings, files or preferences,
						you have to turn on local
						storage.
					</p>
					<img
						src="/substrata/onboarding/still-private.png"
						alt=""
						width="800"
						height="561"
						class="sub-onb-art is-small"
					/>
					<StorageButton />
					<p>
						Substrata will still work if you
						leave this off, and won’t save
						any cookies or local data, but
						you won’t be able to autosave or
						remember tool preferences.
					</p>
				{{else if (this.isCurrent "touch")}}
					<p>
						Since you’re on touch: two
						fingers pan and zoom the canvas,
						one finger — or your pencil —
						uses the selected tool. Touch
						support is in alpha, so please
						watch for bugs.
					</p>
				{{else}}
					<img
						src="/substrata/onboarding/not-finished.png"
						alt=""
						width="1000"
						height="394"
						class="sub-onb-art is-medium"
					/>
					<p>
						Substrata is still an early
						access public beta. Please
						report bugs you find to me
						directly:
						<a
							href={{BUG_MAILTO}}
							class="sub-onb-link"
						>tools@rmv.fyi</a>
						or press the Feedback button up
						in the top bar.
					</p>
					<p>Thanks for being here this early.</p>
				{{/if}}
			</div>

			<div class="sub-onb-dots" aria-hidden="true">
				{{#each this.slideIds as |id|}}
					<span
						class="sub-onb-dot
							{{if
								(this.isCurrent
									id
								)
								'is-active'
							}}"
					></span>
				{{/each}}
			</div>

			<div class="sub-modal-footer">
				<button
					type="button"
					class="sub-modal-btn is-ghost"
					disabled={{this.atStart}}
					{{on "click" this.back}}
				>
					Back
				</button>
				{{#if this.atEnd}}
					<button
						type="button"
						class="sub-modal-btn is-primary"
						{{on "click" this.done}}
					>
						let’s go
					</button>
				{{else}}
					<button
						type="button"
						class="sub-modal-btn is-primary"
						{{on "click" this.next}}
					>
						Next
					</button>
				{{/if}}
			</div>
		</div>
	</template>
}
