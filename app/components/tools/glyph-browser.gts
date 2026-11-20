import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonJumpHeading from 'delphicanon/components/canon-jump-heading';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import type CanonToastService from 'delphicanon/services/canon-toast';
import Card from 'delphitools-v2/components/tools/glyph-browser/card';
import {
	categoryForCode,
	chart,
	codeLabel,
	isVisible,
	valueLines,
} from 'delphitools-v2/components/tools/glyph-browser/glyphs';
import './glyph-browser/glyph-browser.css';

const firstGlyph = 0x67;
const rowHeader = 52;
const minCell = 34;
const collapsedHeight = 140 + 16 * 2;

export default class GlyphBrowserTool extends Component {
	@service('canon-toast') declare toast: CanonToastService;

	@tracked search = '';
	@tracked selected = firstGlyph;
	@tracked columns = 16;
	@tracked cardHeight = 0;
	chartElement?: HTMLElement;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const code = parseInt(query.get('gbCode') ?? '', 16);
		if (code >= 0 && code <= 0x10ffff) this.selected = code;
		this.search = query.get('gbSearch') ?? '';
	}

	get sections() {
		return chart(this.columns, this.search).map((section) => ({
			...section,
			detail: `${section.count} glyphs`,
			rows: section.rows.map((row) => ({
				label: codeLabel(row.start),
				cells: row.cells.map((code, column) =>
					code === undefined
						? { key: column, blank: true }
						: {
								key: column,
								blank: false,
								code,
								char: String.fromCodePoint(
									code,
								),
								label: codeLabel(
									code,
								),
								selected:
									code ===
									this
										.selected,
							},
				),
			})),
		}));
	}

	get visibleCodes() {
		return this.sections.flatMap((section) =>
			section.rows.flatMap((row) =>
				row.cells.flatMap((cell) =>
					cell.blank ? [] : [cell.code!],
				),
			),
		);
	}

	get tabStop() {
		const codes = this.visibleCodes;
		return codes.includes(this.selected) ? this.selected : codes[0];
	}

	get empty() {
		return this.sections.length === 0;
	}

	get char() {
		return String.fromCodePoint(this.selected);
	}

	get label() {
		return codeLabel(this.selected);
	}

	get category() {
		return categoryForCode(this.selected) ?? 'Unknown block';
	}

	get lines() {
		return valueLines(this.selected);
	}

	get chartStyle() {
		return htmlSafe(`--gb-columns: ${this.columns}`);
	}

	get pictureHeight() {
		return this.cardHeight > 0 ? this.cardHeight + 4 : undefined;
	}

	measureChart = modifier((element: HTMLElement) => {
		this.chartElement = element;
		const observer = new ResizeObserver(([entry]) => {
			const room = Math.max(
				0,
				(entry?.contentRect.width ?? 0) - rowHeader,
			);
			const columns = room / 16 >= minCell ? 16 : 8;
			if (columns !== this.columns)
				requestAnimationFrame(
					() => (this.columns = columns),
				);
		});
		observer.observe(element);
		return () => observer.disconnect();
	});

	setSearch = (text: string) => (this.search = text);

	measured = (height: number) => {
		if (height !== this.cardHeight) this.cardHeight = height;
	};

	pick = (code?: number) => {
		if (code !== undefined) this.selected = code;
	};

	copyChar = (code?: number) => {
		if (code !== undefined)
			void this.toast.copy(String.fromCodePoint(code));
	};

	copyLabel = () => void this.toast.copy(this.label);

	key = (event: KeyboardEvent) => {
		const codes = this.visibleCodes;
		const at = codes.indexOf(this.selected);
		if (at < 0) return;
		let next: number | undefined;
		const step = {
			ArrowRight: 1,
			ArrowLeft: -1,
			ArrowDown: this.columns,
			ArrowUp: -this.columns,
		}[event.key];
		if (step === undefined) {
			if (event.key === 'Home') next = codes[0];
			else if (event.key === 'End') next = codes.at(-1);
			else return;
		} else if (Math.abs(step) === 1) next = codes[at + step];
		else {
			const target = this.selected + step;
			next =
				step > 0
					? codes.find((code) => code >= target)
					: codes.findLast(
							(code) =>
								code <= target,
						);
		}
		event.preventDefault();
		if (next === undefined || !isVisible(next)) return;
		this.selected = next;
		requestAnimationFrame(() => {
			const cell =
				this.chartElement?.querySelector<HTMLElement>(
					`[data-code="${next}"]`,
				);
			cell?.focus({ preventScroll: true });
			cell?.scrollIntoView({ block: 'nearest' });
		});
	};

	<template>
		<CanonSplit
			class="glyph-browser"
			@halves={{true}}
			@collapsesTo={{collapsedHeight}}
		>
			<:sidebar>
				<CanonCanvas @height={{this.pictureHeight}}>
					<Card
						@char={{this.char}}
						@code={{this.selected}}
						@label={{this.label}}
						@category={{this.category}}
						@lines={{this.lines}}
						@onCopyLabel={{this.copyLabel}}
						@onHeight={{this.measured}}
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonTextCell
						class="gb-search"
						@value={{this.search}}
						@placeholder="Search by character or hex code…"
						@onChange={{this.setSearch}}
						aria-label="Search glyphs"
						autocomplete="off"
						spellcheck="false"
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					{{! template-lint-disable no-invalid-interactive }}
					<div
						class="gb-chart"
						role="grid"
						aria-label="Glyphs"
						style={{this.chartStyle}}
						{{this.measureChart}}
						{{on "keydown" this.key}}
					>
						{{#each
							this.sections key="name"
							as |section|
						}}
							<div
								class="gb-section"
								role="rowgroup"
							>
								<CanonJumpHeading
									@text={{section.name}}
									@detail={{section.detail}}
								/>
								{{#each
									section.rows
									key="label"
									as |row|
								}}
									<div
										class="gb-row"
										role="row"
									>
										<span
											class="gb-row-head"
											role="rowheader"
										>{{row.label}}</span>
										{{#each
											row.cells
											key="key"
											as |cell|
										}}
											{{#if
												cell.blank
											}}
												<span
													class="gb-cell gb-cell--blank"
													role="gridcell"
												></span>
											{{else}}
												<button
													type="button"
													class="gb-cell"
													role="gridcell"
													data-code={{cell.code}}
													aria-label={{cell.label}}
													aria-selected={{if
														cell.selected
														"true"
														"false"
													}}
													tabindex={{if
														(isStop
															cell.code
															this.tabStop
														)
														"0"
														"-1"
													}}
													{{on
														"click"
														(fn
															this.pick
															cell.code
														)
													}}
													{{on
														"dblclick"
														(fn
															this.copyChar
															cell.code
														)
													}}
												>{{cell.char}}</button>
											{{/if}}
										{{/each}}
									</div>
								{{/each}}
							</div>
						{{/each}}
					</div>
					{{#if this.empty}}
						<CanonStatus
							@text="No glyphs found"
							@tone="muted"
							@row={{true}}
						/>
					{{/if}}
				</CanonRows>
				<p class="gb-tip">Double-click any glyph to
					quickly copy the character.</p>
			</:main>
		</CanonSplit>
	</template>
}

function isStop(code: number | undefined, stop: number | undefined) {
	return code !== undefined && code === stop;
}
