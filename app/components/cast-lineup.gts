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
		blurb: 'null',
	},
	{
		slug: 'alien',
		name: 'Alien Delphi',
		role: 'Nuisance',
		given: null,
		pronouns: 'they/them',
		blurb: 'null',
	},
	{
		slug: 'emma',
		name: 'Emma',
		role: 'Witch',
		given: 'Amelia Perkins',
		pronouns: 'she/her',
		blurb: 'null',
	},
	{
		slug: 'vito',
		name: 'Vito',
		role: 'Judgmental Machine',
		given: 'Digital VT-100 S/N 37345A/4',
		pronouns: 'he/him',
		blurb: 'null',
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
