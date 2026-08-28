import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import Icon from 'delphitools-v2/components/icon';
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
} from 'delphitools-v2/components/ui/select';
import {
	Popover,
	PopoverTrigger,
	PopoverContent,
} from 'delphitools-v2/components/ui/popover';

export interface GlyphCategory {
	name: string;
	ranges: [number, number][];
}

export const CATEGORIES: GlyphCategory[] = [
	{ name: 'Latin Basic', ranges: [[0x0020, 0x007f]] },
	{
		name: 'Latin Extended',
		ranges: [
			[0x0080, 0x00ff],
			[0x0100, 0x017f],
		],
	},
	{ name: 'Greek', ranges: [[0x0370, 0x03ff]] },
	{ name: 'Cyrillic', ranges: [[0x0400, 0x04ff]] },
	{ name: 'Punctuation', ranges: [[0x2000, 0x206f]] },
	{ name: 'Currency', ranges: [[0x20a0, 0x20cf]] },
	{ name: 'Arrows', ranges: [[0x2190, 0x21ff]] },
	{ name: 'Math Operators', ranges: [[0x2200, 0x22ff]] },
	{ name: 'Box Drawing', ranges: [[0x2500, 0x257f]] },
	{ name: 'Geometric Shapes', ranges: [[0x25a0, 0x25ff]] },
	{ name: 'Symbols', ranges: [[0x2600, 0x26ff]] },
	{ name: 'Dingbats', ranges: [[0x2700, 0x27bf]] },
	{
		name: 'Emoji',
		ranges: [
			[0x1f300, 0x1f5ff],
			[0x1f600, 0x1f64f],
			[0x1f680, 0x1f6ff],
		],
	},
];

export type GlyphFormat = 'char' | 'html' | 'css' | 'js';

const FORMATS: { id: GlyphFormat; label: string }[] = [
	{ id: 'char', label: 'Char' },
	{ id: 'html', label: 'HTML' },
	{ id: 'css', label: 'CSS' },
	{ id: 'js', label: 'JS' },
];

const MAX_GLYPHS = 400;

const COPIED_MS = 1500;

export function codesForCategory(name: string): number[] {
	const category = CATEGORIES.find((c) => c.name === name);
	if (!category) return [];

	const codes: number[] = [];
	for (const [start, end] of category.ranges) {
		for (let code = start; code <= end; code++) codes.push(code);
	}
	return codes;
}

export function filterCodes(codes: number[], search: string): number[] {
	if (!search) return codes;
	const lower = search.toLowerCase();
	return codes.filter((code) => {
		const hex = code.toString(16).toLowerCase();
		return (
			String.fromCodePoint(code) === search ||
			hex.includes(lower) ||
			`u+${hex}`.includes(lower)
		);
	});
}

export function codeLabel(code: number): string {
	return `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
}

export function codeText(code: number, format: GlyphFormat): string {
	const hex = code.toString(16);
	switch (format) {
		case 'char':
			return String.fromCodePoint(code);
		case 'html':
			return `&#x${hex};`;
		case 'css':
			return `\\${hex}`;
		case 'js':
			// astral escapes need braces
			return code <= 0xffff
				? `\\u${hex.padStart(4, '0')}`
				: `\\u{${hex}}`;
	}
}

export function categoryForCode(code: number): string | null {
	for (const category of CATEGORIES) {
		for (const [start, end] of category.ranges) {
			if (code >= start && code <= end) return category.name;
		}
	}
	return null;
}

export function describeGlyph(
	input: string,
): { char: string; label: string; category: string } | null {
	const trimmed = input.trim();
	let code: number | null = null;

	const hexMatch = /^U\+([0-9A-Fa-f]+)$/i.exec(trimmed);
	if (hexMatch) {
		code = parseInt(hexMatch[1]!, 16);
	} else if ([...trimmed].length === 1) {
		code = trimmed.codePointAt(0) ?? null;
	}

	if (code === null || Number.isNaN(code)) return null;
	try {
		const char = String.fromCodePoint(code);
		const category = categoryForCode(code);
		return {
			char,
			label: codeLabel(code),
			category: category ?? 'Unknown block',
		};
	} catch {
		return null;
	}
}

export default class GlyphBrowserTool extends Component {
	@tracked selectedCategory = CATEGORIES[0]!.name;
	@tracked search = '';
	@tracked copiedFormat: GlyphFormat | 'grid' | null = null;
	@tracked copiedChar: string | null = null;
	@tracked openPopover: number | null = null;

	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
	}

	get categories() {
		return CATEGORIES;
	}

	get filtered() {
		return filterCodes(
			codesForCategory(this.selectedCategory),
			this.search,
		);
	}

	get total() {
		return this.filtered.length;
	}

	get overflowing() {
		return this.total > MAX_GLYPHS;
	}

	get countLabel() {
		return `${this.total} glyphs`;
	}

	get glyphs() {
		return this.filtered.slice(0, MAX_GLYPHS).map((code) => {
			const char = String.fromCodePoint(code);
			const isOpen = this.openPopover === code;
			return {
				code,
				char,
				label: codeLabel(code),
				isOpen,
				isCopied:
					this.copiedFormat === 'grid' &&
					this.copiedChar === char,
				formats: isOpen
					? FORMATS.map((format) => ({
							id: format.id,
							label: format.label,
							isCopied:
								this
									.copiedFormat ===
									format.id &&
								this
									.copiedChar ===
									char,
						}))
					: [],
			};
		});
	}

	setSearch = (event: Event) => {
		this.search = (event.target as HTMLInputElement).value;
	};

	chooseCategory = (name: string) => {
		this.selectedCategory = name;
		this.search = '';
		this.openPopover = null;
	};

	setPopover = (code: number, open: boolean) => {
		this.openPopover = open ? code : null;
	};

	#markCopied = (char: string, format: GlyphFormat | 'grid') => {
		this.copiedChar = char;
		this.copiedFormat = format;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(() => {
			this.copiedChar = null;
			this.copiedFormat = null;
		}, COPIED_MS);
	};

	copyGlyph = (code: number, event: Event) => {
		event.preventDefault();
		const char = String.fromCodePoint(code);
		void navigator.clipboard
			.writeText(char)
			.then(() => this.#markCopied(char, 'grid'));
	};

	copyFormat = (code: number, format: GlyphFormat) => {
		void navigator.clipboard
			.writeText(codeText(code, format))
			.then(() =>
				this.#markCopied(
					String.fromCodePoint(code),
					format,
				),
			);
	};

	<template>
		<div class="dt-glyph">
			<div class="dt-glyph-bar">
				<span class="dt-glyph-search">
					<Icon @name="search" />
					{{! wording carried over from the Next app }}
					<input
						type="text"
						value={{this.search}}
						placeholder="Search by character or hex code…"
						aria-label="Search glyphs"
						{{on "input" this.setSearch}}
					/>
				</span>
				<span class="dt-glyph-category">
					<Select
						@value={{this.selectedCategory}}
						@onValueChange={{this.chooseCategory}}
					>
						<SelectTrigger>
							<SelectValue
							>{{this.selectedCategory}}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{{#each
								this.categories
								key="name"
								as |category|
							}}
								<SelectItem
									@value={{category.name}}
								>{{category.name}}</SelectItem>
							{{/each}}
						</SelectContent>
					</Select>
				</span>
			</div>

			<div class="dt-glyph-head">
				<span
					class="dt-glyph-head-name"
				>{{this.selectedCategory}}</span>
				<span
					class="dt-glyph-head-count"
				>{{this.countLabel}}</span>
			</div>

			<div class="dt-glyph-grid">
				{{#each this.glyphs key="code" as |glyph|}}
					<Popover
						@open={{glyph.isOpen}}
						@onOpenChange={{fn
							this.setPopover
							glyph.code
						}}
					>
						<PopoverTrigger
							@asChild={{true}}
							as |trigger|
						>
							<button
								type="button"
								class="dt-glyph-cell
									{{if
										glyph.isOpen
										'is-open'
									}}
									{{if
										glyph.isCopied
										'is-copied'
									}}"
								title={{glyph.label}}
								{{on
									"dblclick"
									(fn
										this.copyGlyph
										glyph.code
									)
								}}
								{{trigger.modifiers}}
							>{{glyph.char}}</button>
						</PopoverTrigger>
						<PopoverContent
							class="dt-glyph-popover"
							@side="top"
							@align="center"
						>
							<div
								class="dt-glyph-detail"
							>
								<span
									class="dt-glyph-detail-char"
								>{{glyph.char}}</span>
								<span
									class="dt-glyph-detail-meta"
								>
									<span
										class="dt-glyph-detail-code"
									>{{glyph.label}}</span>
									{{! wording carried over from the Next app }}
									<span
										class="dt-glyph-detail-decimal"
									>Decimal:
										{{glyph.code}}</span>
								</span>
							</div>
							<div
								class="segmented dt-glyph-formats"
							>
								{{#each
									glyph.formats
									key="id"
									as |format|
								}}
									<button
										type="button"
										class="dt-glyph-format
											{{if
												format.isCopied
												'is-copied'
											}}"
										{{on
											"click"
											(fn
												this.copyFormat
												glyph.code
												format.id
											)
										}}
									>
										<Icon
											@name={{if
												format.isCopied
												"check"
												"copy"
											}}
										/>
										{{format.label}}
									</button>
								{{/each}}
							</div>
						</PopoverContent>
					</Popover>
				{{/each}}
			</div>

			{{#if this.overflowing}}
				{{! wording carried over from the Next app }}
				<p class="dt-glyph-overflow">Showing 400 of
					{{this.total}}
					glyphs. Use search to narrow results.</p>
			{{/if}}

			{{! wording carried over from the Next app }}
			<p class="dt-glyph-tip"><strong>Tip:</strong>
				Double-click any glyph to quickly copy the
				character.</p>
		</div>
	</template>
}
