import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { htmlSafe, type SafeString } from '@ember/template';
import type Owner from '@ember/owner';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonEmptyRow from 'delphicanon/components/canon-empty-row';
import CanonJumpHeading from 'delphicanon/components/canon-jump-heading';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import { reducedMotion } from 'delphicanon/lib/motion';
import type CanonToastService from 'delphicanon/services/canon-toast';
import Icon, { IconSvg } from 'delphitools-v2/components/icon';
import {
	TOTAL_CLASSES,
	filterCheatsheet,
	findClass,
	type CheatSheetItem,
} from './tailwind-cheatsheet/data';
import { specimen } from './tailwind-cheatsheet/specimen';
import Stage, { svg } from './tailwind-cheatsheet/stage';
import './tailwind-cheatsheet/tailwind-cheatsheet.css';

export {
	CHEATSHEET,
	TOTAL_CLASSES,
	filterCheatsheet,
	lookupTailwindClass,
	type CheatSheetCategory,
	type CheatSheetItem,
} from './tailwind-cheatsheet/data';

const CopyIcon = <template><IconSvg @name="copy" /></template>;
const ClearIcon = <template><IconSvg @name="circle-x" /></template>;

const placeholder = `Search ${TOTAL_CLASSES} classes…`;
const STAGE_HEIGHT = 196;
const STAGE_COLLAPSED = 116;

const thumbs = new Map<string, SafeString>();
function thumb(item: CheatSheetItem, category: string) {
	let picture = thumbs.get(item.class);
	if (!picture) {
		picture = htmlSafe(svg(specimen(item, category)));
		thumbs.set(item.class, picture);
	}
	return picture;
}

export default class TailwindCheatsheetTool extends Component {
	@service('canon-toast') declare toast: CanonToastService;

	@tracked search = '';
	@tracked selected = 'p-4';

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const search = query.get('twSearch');
		if (search !== null) this.find(search);
		const name = query.get('twSelect');
		if (name && findClass(name)) this.selected = name;
	}

	get groups() {
		return filterCheatsheet(this.search).map((category) => ({
			name: category.name,
			heading: `${category.name} · ${category.items.length}`,
			detail: String(category.items.length),
			items: category.items.map((item) => ({
				item,
				lit: item.class === this.selected,
				thumb: thumb(item, category.name),
				example: item.example && `e.g. ${item.example}`,
				nameStyle: htmlSafe(
					`--tw-chars: ${item.class.length}`,
				),
			})),
		}));
	}

	get shown() {
		return findClass(this.selected) ?? findClass('p-4')!;
	}

	get empty() {
		return `No classes found matching “${this.search}”`;
	}

	find = (text: string) => {
		this.search = text;
		const first = filterCheatsheet(text)[0]?.items[0];
		if (first) this.selected = first.class;
	};

	clear = () => this.find('');

	select = (name: string) => {
		this.selected = name;
	};

	copy = (name: string) => void this.toast.copy(name);

	jump = () => {
		const heading = document.querySelector<HTMLElement>(
			`.tailwind-cheatsheet [data-tw-category="${CSS.escape(this.shown.category.name)}"]`,
		);
		if (!heading) return;
		heading.scrollIntoView({
			block: 'start',
			behavior: reducedMotion() ? 'instant' : 'smooth',
		});
		heading.querySelector('button')?.focus({ preventScroll: true });
	};

	selectAll = (event: FocusEvent) => {
		const field = event.target;
		if (field instanceof HTMLInputElement)
			requestAnimationFrame(() => field.select());
	};

	<template>
		<CanonSplit
			class="tailwind-cheatsheet"
			@oneColumn={{true}}
			@collapsesTo={{STAGE_COLLAPSED}}
		>
			<:banner>
				<CanonCanvas @height={{STAGE_HEIGHT}}>
					<Stage
						@item={{this.shown.item}}
						@category={{this.shown.category}}
						@onJump={{this.jump}}
					/>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<div class="tw-browser">
					<div class="tw-search">
						<Icon
							class="tw-search-icon"
							@name="search"
						/>
						<CanonTextCell
							class="tw-search-field"
							type="search"
							autocomplete="off"
							autocapitalize="none"
							spellcheck="false"
							enterkeyhint="search"
							@value={{this.search}}
							@placeholder={{placeholder}}
							@onChange={{this.find}}
							aria-label="Search"
							{{on
								"focusin"
								this.selectAll
							}}
						/>
						{{#if this.search}}
							<CanonButton
								class="tw-search-clear"
								@kind="cell"
								@icon={{ClearIcon}}
								@label="Clear"
								@onClick={{this.clear}}
							/>
						{{/if}}
					</div>
					{{#each
						this.groups key="name"
						as |group|
					}}
						<CanonJumpHeading
							@text={{group.heading}}
							@detail={{group.detail}}
							data-tw-category={{group.name}}
						/>
						<div class="tw-items">
							{{#each
								group.items
								key="item.class"
								as |entry|
							}}
								<div
									class="tw-item"
								>
									<button
										type="button"
										class="tw-item-body
											{{if
												entry.lit
												'tw-item-body--lit'
											}}"
										aria-pressed={{if
											entry.lit
											"true"
											"false"
										}}
										{{on
											"click"
											(fn
												this.select
												entry.item.class
											)
										}}
									>
										<span
											class="tw-thumb"
										>{{entry.thumb}}</span>
										<span
											class="tw-item-text"
										>
											<span
												class="tw-item-name"
												style={{entry.nameStyle}}
											>{{entry.item.class}}</span>
											<span
												class="tw-item-css"
											>{{entry.item.css}}</span>
											{{#if
												entry.example
											}}
												<span
													class="tw-item-example"
												>{{entry.example}}</span>
											{{/if}}
										</span>
									</button>
									<CanonButton
										class="tw-item-copy"
										@kind="cell"
										@icon={{CopyIcon}}
										@label="Copy {{entry.item.class}}"
										@onClick={{fn
											this.copy
											entry.item.class
										}}
									/>
								</div>
							{{/each}}
						</div>
					{{else}}
						<CanonEmptyRow
							@text={{this.empty}}
						/>
					{{/each}}
				</div>
			</:sidebar>
		</CanonSplit>
	</template>
}
