import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { guidFor } from '@ember/object/internals';
import { eq } from 'ember-truth-helpers';
import { LinkTo } from '@ember/routing';
import CanonButton from 'delphicanon/components/canon-button';
import CanonDialog from 'delphicanon/components/canon-dialog';
import Icon from 'delphitools-v2/components/icon';
import './whats-new.css';

const PILL_TEXT = 'welcome to delphitools 2.0!';

const EMBER_URL = 'https://emberjs.com';
const CRAYON_URL = 'https://github.com/TeriyakiBomb/crayon';

const SLIDES = [0, 1, 2, 3];

export default class WhatsNew extends Component {
	@tracked slide = 0;
	@tracked revealed = false;
	@tracked isOpen = false;

	pillId = `${guidFor(this)}-pill`;
	titleId = `${guidFor(this)}-title`;

	open = (event: Event) => {
		(event.currentTarget as HTMLElement).focus();
		this.isOpen = true;
	};

	toggle = () => {
		this.revealed = !this.revealed;
	};

	get atStart() {
		return this.slide === 0;
	}

	get atEnd() {
		return this.slide === SLIDES.length - 1;
	}

	back = () => {
		this.slide = Math.max(0, this.slide - 1);
	};

	next = () => {
		this.slide = Math.min(SLIDES.length - 1, this.slide + 1);
	};

	closed = () => {
		this.isOpen = false;
		this.slide = 0;
	};

	<template>
		<button
			type="button"
			class="dt-hero-reveal"
			aria-label={{if
				this.revealed
				"Hide welcome"
				"Show welcome"
			}}
			aria-expanded={{if this.revealed "true" "false"}}
			aria-controls={{if this.revealed this.pillId}}
			{{on "click" this.toggle}}
		>
			<Icon @name="chevron-right" />
		</button>
		{{#if this.revealed}}
			<button
				type="button"
				id={{this.pillId}}
				class="dt-hero-pill"
				{{on "click" this.open}}
			>
				<Icon @name="party-popper" />
				{{PILL_TEXT}}
			</button>
		{{/if}}
		<CanonDialog
			class="dt-wn"
			@open={{this.isOpen}}
			@onClose={{this.closed}}
			aria-labelledby={{this.titleId}}
		>
			<:default>
				<h2
					class="dt-sr-only"
					id={{this.titleId}}
				>delphitools 2.0</h2>
				<div class="dt-wn-slide">
					{{#if (eq this.slide 0)}}
						<img
							src="/art/delphi-house.webp"
							width="640"
							height="639"
							alt=""
							class="dt-wn-art"
						/>
						<p>
							After half a year, I'd
							like to welcome you to
							delphitools 2.0, rebuilt
							from the ground up using
							<a
								href={{EMBER_URL}}
								target="_blank"
								rel="noopener noreferrer"
								class="dt-wn-link"
							>Ember 7</a>
							and
							<a
								href={{CRAYON_URL}}
								target="_blank"
								rel="noopener noreferrer"
								class="dt-wn-link"
							>Crayon CSS</a>, both
							excellent frameworks you
							should be checking out
							if you are also a
							habitual computer
							toucher chronically ill
							with The Internet.
						</p>
					{{else if (eq this.slide 1)}}
						<img
							src="/art/wn-av.webp"
							width="960"
							height="440"
							alt=""
							class="dt-wn-art"
						/>
						<p>
							Version 2.0 comes with a
							lot of improvements. I
							won't spoil all of them
							here, but do check out
							the new Audio & Video
							category with
							oft-requested features
							such as an
							<LinkTo
								@route="tools.tool"
								@model="auto-subtitle"
								class="dt-wn-link"
							>automatic subtitle
								generator</LinkTo>,
							a
							<LinkTo
								@route="tools.tool"
								@model="video-trimmer"
								class="dt-wn-link"
							>video trimmer</LinkTo>
							and - somehow - a
							<LinkTo
								@route="tools.tool"
								@model="screen-recorder"
								class="dt-wn-link"
							>screen recorder</LinkTo>.
							Try them today! Or
							don't! I won't know
							either way!
						</p>
					{{else if (eq this.slide 2)}}
						<img
							src="/art/wn-workflows.webp"
							width="960"
							height="726"
							alt=""
							class="dt-wn-art"
						/>
						<p>
							In addition, delphitools
							now offers
							<LinkTo
								@route="workflows"
								class="dt-wn-link"
							>Workflows</LinkTo>!
							These are currently
							experimental, but let
							you chain single tools
							into a sequence of
							actions that you can
							carry your files between
							without uploading. And
							as you're well aware,
							dear reader, this is
							done without any cloud
							capabilities at all, and
							none of your files ever
							leave your computer,
							cross my heart and hope
							to die.
						</p>
					{{else}}
						<img
							src="/art/wn-home.webp"
							width="960"
							height="497"
							alt=""
							class="dt-wn-art"
						/>
						<p>
							There's more, so please,
							make yourself at home.
							Stay as long as you
							like, and be sure to
							reload the front page to
							view the many incredible
							donated pieces of hero
							art by talented human
							artists! Below that
							you'll find the omnibox,
							which is so much more
							than a search bar... try
							typing some colour codes
							in there for a laugh.
							Something might happen!
						</p>
					{{/if}}
				</div>
				<div class="dt-wn-dots" aria-hidden="true">
					{{#each SLIDES as |index|}}
						<span
							class="dt-wn-dot
								{{if
									(eq
										index
										this.slide
									)
									'is-active'
								}}"
						></span>
					{{/each}}
				</div>
			</:default>
			<:footer as |close|>
				<CanonButton
					class="dt-wn-btn is-ghost"
					@text="Back"
					@disabled={{this.atStart}}
					@onClick={{this.back}}
				/>
				{{#if this.atEnd}}
					<CanonButton
						class="dt-wn-btn is-primary"
						@kind="primary"
						@text="let’s go"
						@onClick={{fn close ""}}
					/>
				{{else}}
					<CanonButton
						class="dt-wn-btn is-primary"
						@kind="primary"
						@text="Next"
						@onClick={{this.next}}
					/>
				{{/if}}
			</:footer>
		</CanonDialog>
	</template>
}
