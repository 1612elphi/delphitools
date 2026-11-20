import Component from '@glimmer/component';
import type { TOC } from '@ember/component/template-only';
import { tracked } from '@glimmer/tracking';
import CanonButton from 'delphicanon/components/canon-button';
import CanonDialog from 'delphicanon/components/canon-dialog';
import CanonSheet from 'delphicanon/components/canon-sheet';
import { IconSvg } from 'delphitools-v2/components/icon';
import { persist } from 'delphitools-v2/lib/errata/write/library';
import { persistencePref } from 'delphitools-v2/lib/substrata/persistence-pref';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import { eq } from 'ember-truth-helpers';
import 'delphitools-v2/components/substrata/pages/pages.css';

const seen = persistencePref('errata:onboarding-seen');

interface Slide {
	id: string;
	art?: string;
	text: string;
	storage?: boolean;
	touch?: boolean;
}

const SLIDES = (
	[
		{
			id: 'hello',
			art: '/errata/onboarding/hello.webp',
			text: "Hi, welcome to Errata. This new suite contains a document editor and a document writer. You can edit PDFs, for real, and write text documents. It's still in early access.",
		},
		{
			id: 'local',
			art: '/substrata/onboarding/local.webp',
			text: 'Like everything else in delphitools, it runs entirely in your browser. As a result, your computer is pretty important to performance. A long document might be pretty slow on your machine.',
		},
		{
			id: 'private',
			art: '/substrata/onboarding/private.webp',
			text: "It's also completely private by design. Nothing is sent anywhere, least of all your documents. It's also open source, so I can prove this.",
		},
		{
			id: 'storage',
			art: '/substrata/onboarding/still-private.webp',
			storage: true,
			text: "If you want your documents to be kept in this browser, you have to turn on LocalStorage. Errata works fine without this, but you'll have to export what you want to keep.",
		},
		{
			id: 'touch',
			touch: true,
			text: "Since you're on touch: Errata *should* work properly, but I can only test with devides I have. Touch support is pretty new, so please report any bugs.",
		},
		{
			id: 'beta',
			art: '/substrata/onboarding/not-finished.webp',
			text: 'Errata is still in early access. Please report bugs to tools@rmv.fyi. Thanks for being here this early.',
		},
	] satisfies Slide[] as Slide[]
).filter((s) => !s.touch || navigator.maxTouchPoints > 1);

const parts = (text: string) =>
	text.split('*').map((text, i) => ({ text, em: i % 2 === 1 }));

const Words = <template>
	<p>
		{{~#each (parts @text) as |part|~}}
			{{~#if part.em~}}
				<em>{{part.text}}</em>
			{{~else~}}
				{{part.text}}
			{{~/if~}}
		{{~/each~}}
	</p>
</template> satisfies TOC<{ Args: { text: string } }>;

export default class Onboarding extends Component<{
	Args: { phone: boolean };
}> {
	@tracked open = !navigator.webdriver && !seen.get();
	@tracked index = 0;
	stored = new TrackedExternal(persist.subscribe, persist.get);

	willDestroy() {
		super.willDestroy();
		this.stored.unsubscribe();
	}

	get slide(): Slide {
		return SLIDES[this.index]!;
	}

	get last() {
		return this.index === SLIDES.length - 1;
	}

	back = () => {
		this.index = Math.max(0, this.index - 1);
	};

	next = () => {
		if (this.last) this.close();
		else this.index += 1;
	};

	close = () => {
		seen.set(true);
		this.open = false;
	};

	store = () => persist.set(true);

	<template>
		{{#let (if @phone CanonSheet CanonDialog) as |Frame|}}
			<Frame
				class="sub-pg-onb"
				@open={{this.open}}
				@onClose={{this.close}}
				aria-label="Errata"
				data-onboarding
			>
				<:default>
					<div
						class="sub-pg-onb-page"
						data-slide={{this.slide.id}}
					>
						{{#if this.slide.storage}}
							<Words
								@text={{this.slide.text}}
							/>
						{{/if}}
						{{#if this.slide.art}}
							<img
								src={{this.slide.art}}
								alt=""
								class="sub-pg-onb-art"
							/>
						{{/if}}
						{{#if this.slide.storage}}
							<CanonButton
								class="sub-pg-onb-storage"
								@kind="primary"
								@text="Save in this browser"
								@icon={{component
									IconSvg
									name=(if
										this.stored.current
										"check"
										"hard-drive"
									)
								}}
								@disabled={{this.stored.current}}
								@onClick={{this.store}}
							/>
						{{else}}
							<Words
								@text={{this.slide.text}}
							/>
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
							@disabled={{eq
								this.index
								0
							}}
							@onClick={{this.back}}
						/>
						<span
							class="sub-pg-onb-dots"
							aria-hidden="true"
						>
							{{#each
								SLIDES key="id"
								as |s i|
							}}
								<span
									class="sub-pg-onb-dot
										{{if
											(eq
												i
												this.index
											)
											'is-on'
										}}"
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
