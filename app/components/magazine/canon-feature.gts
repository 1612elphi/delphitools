import type { TOC } from '@ember/component/template-only';
import CanonButton from 'delphicanon/components/canon-button';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonLamps from 'delphicanon/components/canon-lamps';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonStepper from 'delphicanon/components/canon-stepper';
import CanonSwitch from 'delphicanon/components/canon-switch';
import { IconSvg } from 'delphitools-v2/components/icon';
import type { PageSignature } from 'delphitools-v2/components/magazine/pages';

const GAP = String.fromCharCode(0x2211) + 'CG';
const LOREM =
	'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat'.split(
		' ',
	);

// ponytail: an unfilled gap shows lorem at its word budget, so the layout shows how much text fits
export function text(value: string, words: number) {
	if (value !== GAP) return value;
	const out = Array.from(
		{ length: words },
		(_, i) => LOREM[i % LOREM.length]!,
	);
	out[0] = out[0]!.charAt(0).toUpperCase() + out[0]!.slice(1);
	return `${out.join(' ')}.`;
}

const copy = {
	headline: 'A new look',

	standfirst: 'Adapted from the UIKit tooling, delphitools now uses the new Canon Design Language and UI Kit, built from the ground up.',

	intro: 'Long time fans of delphitools have been through two redesigns so far. First, when we switched from primitives to shadcn/ui modules, then later when those modules were redesigned with version 1.4. Now, for the first time, all elements in delphitools are new, creative and custom. An interview with the designer.',

	question1: 'Canon is a big departure from the previous style. Why redesign what worked?',

	answer1: "The previous iteration was just... safe. It was boring. I didn't much like it, it didn't take many risks, and it looked like every other website out there. With the powerful layout options that UIKit gave me in the new 2.0 version of the iOS app, I figured we might as well try to port it to web as well.",

	captionLeft: 'Fig. 1: Canon components.',

	pullQuote: "Anyone can make an interface these days, and that's great. But I do think you owe it to your users to make something special, make something with love.",

	question2: 'So Canon started as an iOS only idea, and then moved to web?',

	answer2: "That's right. I initially expected the web version to be a lot more compact and simple, since many of the UIKit options (like a reliable 3D transform) simply weren't available, but I'm pleased to say it wasn't too difficult.",

	question3: 'The biggest change is the typeface situation. Why change this?',

	answer3: "While I love iA Writer Quattro, our previous font, I did feel like it was an overly safe and boring choice. Recently, I've been using Open Sans Condensed a lot, and kind of fell in love with it. As for the mono change from Plex to Iosevka, you'll have to thank my esteemed colleague Ash for that.",

	captionRight: 'Fig. 2: A Canon settings pane.',
};

const SEGMENTS = ['Live', 'Source'];
const LIT = ['play'] as const;
const noop = () => {};

const Question: TOC<{ Args: { value: string } }> = <template>
	<p class="dt-mag-q">{{text @value 15}}</p>
</template>;

export const CanonFeatureLeft: TOC<PageSignature> = <template>
	<article class="dt-mag-feature">
		<p class="dt-mag-kicker">Feature</p>
		<h2 class="dt-mag-feature-head">{{text copy.headline 6}}</h2>
		<p class="dt-mag-standfirst">{{text copy.standfirst 30}}</p>
		<p class="dt-mag-byline">By Emma Perkins</p>
		<div class="dt-mag-columns">
			<p>{{text copy.intro 62}}</p>
			<Question @value={{copy.question1}} />
			<p>{{text copy.answer1 70}}</p>
		</div>
		<figure class="dt-mag-specimen" aria-hidden="true" inert>
			<div class="dt-mag-specimen-parts">
				<CanonButton
					@kind="primary"
					@text="Apply"
					@icon={{component IconSvg name="check"}}
					@iconStyle="inline"
				/>
				<CanonSegmented
					aria-label="View"
					@items={{SEGMENTS}}
					@selected={{0}}
					@onChange={{noop}}
				/>
				<CanonSlider @value={{0.62}} @label="Amount" />
				<CanonSwitch @on={{true}} aria-label="On" />
			</div>
			<figcaption>{{text copy.captionLeft 12}}</figcaption>
		</figure>
	</article>
</template>;

export const CanonFeatureRight: TOC<PageSignature> = <template>
	<article class="dt-mag-feature">
		<blockquote class="dt-mag-pull">{{text
				copy.pullQuote
				16
			}}</blockquote>
		<div class="dt-mag-columns">
			<Question @value={{copy.question2}} />
			<p>{{text copy.answer2 75}}</p>
			<Question @value={{copy.question3}} />
			<p>{{text copy.answer3 84}}</p>
		</div>
		<figure class="dt-mag-specimen" aria-hidden="true" inert>
			<CanonRows @framed={{true}}>
				<CanonHeading @text="Paper" />
				<CanonStepper @onStep={{noop}}>
					<span
						class="dt-mag-specimen-value"
					>A4</span>
				</CanonStepper>
			</CanonRows>
			<CanonLamps @lit={{LIT}} />
			<figcaption>{{text copy.captionRight 12}}</figcaption>
		</figure>
		<div class="dt-mag-links">
			{{#each @page.links as |link|}}
				<a
					href={{link.href}}
					class="dt-mag-link"
					data-magazine-link
				>{{link.label}}</a>
			{{/each}}
		</div>
	</article>
</template>;
