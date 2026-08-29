import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { eq } from 'ember-truth-helpers';

interface Character {
	slug: string;
	name: string;
	role: string;
	given: string | null;
	pronouns: string;
	blurb: string;
}

const CAST: Character[] = [
	{
		slug: 'delphi',
		name: 'Delphi',
		role: 'Designer',
		given: 'Ruby Morgan',
		pronouns: 'they/them',
		// ∑CG: blurb under the cast lineup in the about dialog, shown while Delphi is hovered
		//   spec: 1-2 sentences, max 140 chars, third person singular they, deadpan, matches the site voice, no exclamation marks
		//   sample: "Draws the art, writes the tools, and refuses to add a login screen."
		blurb: '∑CG',
	},
	{
		slug: 'ad',
		name: 'Alien Delphi',
		role: 'Nuisance',
		given: null,
		pronouns: 'they/them',
		// ∑CG: blurb under the cast lineup in the about dialog, shown while Alien Delphi is hovered
		//   spec: 1-2 sentences, max 140 chars, third person singular they, deadpan, matches the site voice, no exclamation marks
		//   sample: "Turns up uninvited, moves things one pixel, and denies everything."
		blurb: '∑CG',
	},
	{
		slug: 'emma',
		name: 'Emma',
		role: 'Witch',
		given: 'Amelia Perkins',
		pronouns: 'she/her',
		// ∑CG: blurb under the cast lineup in the about dialog, shown while Emma is hovered
		//   spec: 1-2 sentences, max 140 chars, third person, she/her, deadpan, matches the site voice, no exclamation marks
		//   sample: "Handles the parts of the stack that only respond to superstition."
		blurb: '∑CG',
	},
	{
		slug: 'vito',
		name: 'Vito',
		role: 'Judgmental Machine',
		given: 'Digital VT-100 S/N 37345A/4',
		pronouns: 'he/him',
		// ∑CG: blurb under the cast lineup in the about dialog, shown while Vito is hovered
		//   spec: 1-2 sentences, max 140 chars, third person, he/him, deadpan, matches the site voice, no exclamation marks
		//   sample: "Has opinions about your kerning and shares them without being asked."
		blurb: '∑CG',
	},
];

export default class CastLineup extends Component {
	@tracked active = 0;

	get current(): Character {
		return CAST[this.active]!;
	}

	select = (index: number) => {
		this.active = index;
	};

	<template>
		<div class="dt-cast is-{{this.current.slug}}">
			<p class="dt-cast-head">
				<span class="dt-cast-role">
					{{this.current.pronouns}}
				</span>
				<span
					class="dt-cast-name"
				>{{this.current.name}}</span>
				<span
					class="dt-cast-role"
				>{{this.current.role}}</span>
			</p>

			<div class="dt-cast-lineup">
				{{#each CAST key="slug" as |char index|}}
					<button
						type="button"
						class="dt-cast-fig is-{{char.slug}}
							{{if
								(eq
									index
									this.active
								)
								'is-active'
							}}"
						aria-pressed={{if
							(eq index this.active)
							"true"
							"false"
						}}
						{{on
							"mouseenter"
							(fn this.select index)
						}}
						{{on
							"focus"
							(fn this.select index)
						}}
						{{on
							"click"
							(fn this.select index)
						}}
					>
						<img
							src="/characters/{{char.slug}}.webp"
							alt={{char.name}}
							loading="lazy"
							decoding="async"
						/>
					</button>
				{{/each}}
			</div>
		</div>
	</template>
}
