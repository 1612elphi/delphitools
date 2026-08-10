import type { TOC } from '@ember/component/template-only';

// Body of the About dialog. Kept as its own component because Substrata's
// Help > About pane renders the same content, as in the Next app: one source
// for the copy, contributor and thanks lists.
//
// All prose here is carried over verbatim. The "Built with" list is the one
// thing that changes for v2, because the stack itself changed.

const CONTRIBUTORS = [
	{ name: 'Himanshu Balani', url: 'https://github.com/himanshubalani' },
	{ name: 'Mahmoud Ashraf', url: 'https://github.com/SNO7E-G' },
	{ name: 'Moamal Alaa', url: 'https://github.com/Moamal-2000' },
	{ name: 'Muhammad Fikri', url: 'https://github.com/MuhammadFikriiii' },
	{
		name: 'Claude',
		url: 'https://rmv.fyi/notes/i-hope-you-don-t-use-generative-ai',
	},
];

const DONORS = [
	{ name: 'Joe Herby', org: 'EFF', url: 'https://www.eff.org' },
	{ name: 'Val C', org: 'EFF', url: 'https://www.eff.org' },
	{
		name: 'Kacper Węgrowski',
		org: 'Wikipedia',
		url: 'https://donate.wikimedia.org',
	},
	{
		name: 'Carlos Araújo',
		org: 'Wikipedia',
		url: 'https://donate.wikimedia.org',
	},
];

const BUILT_WITH = [
	{ name: 'Ember', url: 'https://emberjs.com' },
	{ name: 'Glimmer', url: 'https://github.com/glimmerjs/glimmer-vm' },
	{
		name: 'Embroider',
		url: 'https://github.com/embroider-build/embroider',
	},
	{ name: 'Vite', url: 'https://vite.dev' },
	{ name: 'Crayon', url: 'https://github.com/TeriyakiBomb/crayon' },
	{
		name: 'shadcn-ember',
		url: 'https://github.com/IgnaceMaes/shadcn-ember',
	},
	{ name: 'Lucide', url: 'https://lucide.dev' },
];

const AboutDelphitoolsBody: TOC<{ Element: HTMLDivElement }> = <template>
	<div class="dt-about-body" ...attributes>
		<div class="dt-about-lede">
			<p>
				delphitools is a collection of small, focused
				utilities that respect your privacy and work
				entirely in your browser. No data leaves your
				machine, no accounts required, no tracking. Just
				tools that do what they say.
			</p>
			<p>
				I love the web. The classic, real web full of
				weird things. And that web is out there. You
				just have to find it. And sometimes, you have to
				make it yourself.
			</p>
		</div>

		<div class="dt-about-cols">
			<div>
				<h3>Made by</h3>
				<p>
					<a
						href="https://rmv.fyi"
						target="_blank"
						rel="noopener noreferrer"
					>
						delphi<span
							class="dt-sr-only"
						>(opens in new tab)</span>
					</a>
				</p>
			</div>
			<div>
				<h3>Source</h3>
				<p>
					<a
						href="https://github.com/1612elphi/delphitools"
						target="_blank"
						rel="noopener noreferrer"
					>
						1612elphi/delphitools<span
							class="dt-sr-only"
						>(opens in new tab)</span>
					</a>
				</p>
			</div>
		</div>

		<div class="dt-about-block">
			<h3>Contributors</h3>
			<div class="dt-chips">
				{{#each CONTRIBUTORS as |person|}}
					<a
						href={{person.url}}
						target="_blank"
						rel="noopener noreferrer"
					>
						{{person.name}}<span
							class="dt-sr-only"
						>(opens in new tab)</span>
					</a>
				{{/each}}
			</div>
			<p class="dt-about-note">
				<a
					href="https://rmv.fyi/notes/i-hope-you-don-t-use-generative-ai"
					target="_blank"
					rel="noopener noreferrer"
				>
					Behind the scenes of delphitools<span
						class="dt-sr-only"
					>(opens in new tab)</span>
				</a>
			</p>
		</div>

		<div class="dt-about-block">
			<h3>With thanks to</h3>
			<p class="dt-about-note">
				Folks who, instead of donating to delphitools,
				gave to Wikipedia or the EFF on its behalf.
			</p>
			<div class="dt-chips">
				{{#each DONORS as |donor|}}
					<a
						href={{donor.url}}
						target="_blank"
						rel="noopener noreferrer"
					>
						{{donor.name}}
						·
						{{donor.org}}<span
							class="dt-sr-only"
						>(opens in new tab)</span>
					</a>
				{{/each}}
			</div>
		</div>

		<div class="dt-about-block">
			<h3>Built with</h3>
			<div class="dt-chips">
				{{#each BUILT_WITH as |lib|}}
					<a
						href={{lib.url}}
						target="_blank"
						rel="noopener noreferrer"
					>
						{{lib.name}}<span
							class="dt-sr-only"
						>(opens in new tab)</span>
					</a>
				{{/each}}
			</div>
			<p class="dt-about-note">
				Plus
				<a
					href="https://github.com/1612elphi/delphitools/blob/main/ACKNOWLEDGEMENTS.md"
					target="_blank"
					rel="noopener noreferrer"
				>
					many more open source libraries<span
						class="dt-sr-only"
					>(opens in new tab)</span>
				</a>.
			</p>
		</div>
	</div>
</template>;

export default AboutDelphitoolsBody;
