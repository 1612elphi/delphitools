import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { eq } from 'ember-truth-helpers';
import { LinkTo } from '@ember/routing';
import Dialog from 'delphitools-v2/components/ui/dialog';
import Icon from 'delphitools-v2/components/icon';

// verbatim approved copy
const PILL_TEXT = 'welcome to delphitools 2.0!';

const EMBER_URL = 'https://emberjs.com';
const CRAYON_URL = 'https://github.com/TeriyakiBomb/crayon';

const SLIDES = [0, 1, 2, 3];

export default class WhatsNew extends Component {
	@tracked slide = 0;

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

	reset = () => {
		this.slide = 0;
	};

	<template>
		<Dialog @onClose={{this.reset}} as |d|>
			<button
				type="button"
				class="dt-hero-pill"
				{{d.focusOnClose}}
				{{on "click" d.open}}
			>
				<Icon @name="party-popper" />
				{{PILL_TEXT}}
			</button>
			<d.Content class="dt-wn">
				<h2 class="dt-sr-only">delphitools 2.0</h2>
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
							Over half a year since
							it's initial release,
							delphitools' roof has
							caved in more times than
							I'd like. This is
							indubitably traced back
							to decisions made by the
							scoundrels who developed
							the framework, and
							certainly not my own
							limited competence. The
							React people shall be
							hearing from me.
						</p>
						<p>
							Nevertheless, the
							project has been
							thoroughly rebuilt by
							European standards, with
							actual brick walls, on
							good technology this
							time and with more
							attention to detail. So,
							dear reader, I'd like to
							officially welcome you
							to delphitools 2.0,
							rebuilt from the ground
							up using
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
				<div class="dt-wn-footer">
					<button
						type="button"
						class="dt-wn-btn is-ghost"
						disabled={{this.atStart}}
						{{on "click" this.back}}
					>
						Back
					</button>
					{{#if this.atEnd}}
						<button
							type="button"
							class="dt-wn-btn is-primary"
							{{on "click" d.close}}
						>
							let’s go
						</button>
					{{else}}
						<button
							type="button"
							class="dt-wn-btn is-primary"
							{{on "click" this.next}}
						>
							Next
						</button>
					{{/if}}
				</div>
			</d.Content>
		</Dialog>
	</template>
}
