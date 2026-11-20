import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import CanonButton from 'delphicanon/components/canon-button';
import CanonDialog from 'delphicanon/components/canon-dialog';
import CanonSheet from 'delphicanon/components/canon-sheet';
import { IconSvg } from 'delphitools-v2/components/icon';
import { finishOnboarding } from 'delphitools-v2/lib/substrata/onboarding-pref';
import {
	getPersistenceEnabled,
	setPersistenceEnabled,
	subscribePersistence,
} from 'delphitools-v2/lib/substrata/persistence-pref';
import { toast } from 'delphitools-v2/lib/substrata/toast';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import './pages.css';

const BUG_MAILTO = 'mailto:tools@rmv.fyi?subject=substrata%20bug%20report';
const REPO_URL = 'https://github.com/1612elphi/delphitools';

const touch = navigator.maxTouchPoints > 1;
const SLIDES = touch
	? (['hello', 'local', 'private', 'storage', 'touch', 'beta'] as const)
	: (['hello', 'local', 'private', 'storage', 'beta'] as const);

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
		<CanonButton
			class="sub-pg-onb-storage"
			@kind="primary"
			@text="Save in this browser"
			@icon={{component
				IconSvg
				name=(if
					this.enabled.current
					"check"
					"hard-drive"
				)
			}}
			@disabled={{this.enabled.current}}
			@onClick={{this.turnOn}}
		/>
	</template>
}

export default class Onboarding extends Component<{
	Args: { open: boolean; phone: boolean };
}> {
	@tracked slide = 0;

	slides = SLIDES;

	get id() {
		return SLIDES[this.slide] ?? 'hello';
	}

	get last() {
		return this.slide === SLIDES.length - 1;
	}

	get first() {
		return this.slide === 0;
	}

	is = (id: string) => this.id === id;
	dotOn = (index: number) => index === this.slide;

	back = () => {
		this.slide = Math.max(0, this.slide - 1);
	};

	next = () => {
		if (this.last) finishOnboarding();
		else this.slide += 1;
	};

	closed = () => {
		if (this.args.open) finishOnboarding();
	};

	<template>
		{{#let (if @phone CanonSheet CanonDialog) as |Frame|}}
			<Frame
				class="sub-pg-onb"
				@open={{@open}}
				@onClose={{this.closed}}
				aria-label="Substrata"
			>
				<:default>
					<div class="sub-pg-onb-page">
						{{#if (this.is "hello")}}
							<img
								src="/substrata/onboarding/welcome.webp"
								alt=""
								width="1000"
								height="786"
								class="sub-pg-onb-art"
							/>
							<p>
								Hi, this is
								Substrata, the
								delphitools
								image editor. It
								does effects,
								layers, filters,
								film sims,
								cropping, text
								and more.
							</p>
							<p>It's still in early
								access, so
								calibrate your
								excitement.</p>
						{{else if (this.is "local")}}
							<img
								src="/substrata/onboarding/local.webp"
								alt=""
								width="1000"
								height="731"
								class="sub-pg-onb-art"
							/>
							<p>
								Everything is
								local,
								everything runs
								on your browser.
								This means that
								it might be slow
								on low-end
								machines.
							</p>
						{{else if (this.is "private")}}
							<img
								src="/substrata/onboarding/private.webp"
								alt=""
								width="1000"
								height="749"
								class="sub-pg-onb-art"
							/>
							<p>
								Because this is
								in your browser,
								it’s entirely
								private by
								design. Nothing
								of your data, no
								images, no
								clicks, no mouse
								movements, no
								analytics, will
								be sent back to
								the server. And
								I can prove
								this, since it’s
								all
								<a
									href={{REPO_URL}}
									target="_blank"
									rel="noopener noreferrer"
								>open source</a>.
							</p>
							<p
								class="sub-pg-onb-note"
							>
								One footnote: a
								few heavyweight
								tools download
								themselves on
								first use — the
								background
								remover fetches
								its model, for
								instance. This
								is data going to
								you, not to me.
							</p>
						{{else if (this.is "storage")}}
							<p>
								If you want to
								store your
								settings, files
								or preferences,
								you have to turn
								on local
								storage.
							</p>
							<img
								src="/substrata/onboarding/still-private.webp"
								alt=""
								width="800"
								height="561"
								class="sub-pg-onb-art"
							/>
							<StorageButton />
							<p>
								Substrata will
								still work if
								you leave this
								off, and won’t
								save any cookies
								or local data,
								but you won’t be
								able to autosave
								or remember tool
								preferences.
							</p>
						{{else if (this.is "touch")}}
							<p>
								Since you’re on
								touch: two
								fingers pan and
								zoom the canvas,
								one finger — or
								your pencil —
								uses the
								selected tool.
								Touch support is
								in alpha, so
								please watch for
								bugs.
							</p>
						{{else}}
							<img
								src="/substrata/onboarding/not-finished.webp"
								alt=""
								width="1000"
								height="394"
								class="sub-pg-onb-art"
							/>
							<p>
								Substrata is
								still an early
								access public
								beta. Please
								report bugs you
								find to me
								directly:
								<a
									href={{BUG_MAILTO}}
								>tools@rmv.fyi</a>
								or press the
								Feedback button
								up in the top
								bar.
							</p>
							<p>Thanks for being here
								this early.</p>
						{{/if}}
					</div>
				</:default>
				<:footer>
					<div class="sub-pg-onb-bar">
						<CanonButton
							@kind="cell"
							@text="Back"
							@icon={{component
								IconSvg
								name="chevron-left"
							}}
							@disabled={{this.first}}
							@onClick={{this.back}}
						/>
						<span
							class="sub-pg-onb-dots"
							aria-hidden="true"
						>
							{{#each
								this.slides
								as |s i|
							}}
								<span
									class="sub-pg-onb-dot
										{{if
											(this.dotOn
												i
											)
											'is-on'
										}}"
									data-slide={{s}}
								></span>
							{{/each}}
						</span>
						<CanonButton
							@kind="primary"
							@text={{if
								this.last
								"Let’s Go"
								"Next"
							}}
							@onClick={{this.next}}
						/>
					</div>
				</:footer>
			</Frame>
		{{/let}}
	</template>
}
