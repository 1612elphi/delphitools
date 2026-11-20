import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { eq } from 'ember-truth-helpers';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSwitch from 'delphicanon/components/canon-switch';
import PaperMenu from 'delphitools-v2/components/errata/paper-menu';
import { Cell } from 'delphitools-v2/components/substrata/editor/cells';
import ToolPanel, {
	AnchorPicker,
	Field,
	Group,
	InputField,
	PageScope,
	PageScopeState,
	Segmented,
	readText,
} from 'delphitools-v2/components/errata/tool-panel';
import {
	flipAnchor,
	pageSize,
	rotateAnchor,
	totalRotation,
	type Anchor,
	type ErrataPage,
	type PageResize,
	type ResizeMode,
} from 'delphitools-v2/lib/errata/doc-model';
import { resizePages } from 'delphitools-v2/lib/errata/page-ops';
import {
	currentPage,
	getPageIndex,
	store,
	subscribePage,
} from 'delphitools-v2/lib/errata/store';
import { closeMode, onMode } from 'delphitools-v2/lib/errata/ui';
import {
	BLEED_MM,
	MM_TO_POINTS,
	PAPER_SIZES,
} from 'delphitools-v2/lib/imposition';
import { findPaperSize, matchPaperSize } from 'delphitools-v2/lib/paper-sizes';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import './page-size-panel.css';

const PRESET_IDS = ['a4', 'a3', 'sra4', 'letter', 'legal', 'tabloid'];
const PRESETS = PRESET_IDS.map((id) => {
	const size = PAPER_SIZES.find((p) => p.id === id)!;
	return { ...size, value: id, label: size.label.split(' ')[0]! };
});

const PRESET_LABELS = PRESETS.map((p) => p.label);

const PLACEMENTS = [
	{ value: 'anchor', label: 'Anchor to page' },
	{ value: 'resample', label: 'Resample' },
] as const;

const RESAMPLES = [
	{ value: 'fit', label: 'Fit page' },
	{ value: 'fill', label: 'Fill page' },
] as const;

function mm(points: number): string {
	return (points / MM_TO_POINTS).toFixed(1).replace(/\.0$/, '');
}

function parseMm(value: string): number | null {
	const n = Number(value.replace(',', '.'));
	return Number.isFinite(n) && n > 0 ? n * MM_TO_POINTS : null;
}

export default class PageSizePanel extends Component<{
	Args: { open: boolean };
}> {
	doc = new TrackedExternal(store.subscribe, store.getSnapshot);
	pageIndex = new TrackedExternal(subscribePage, getPageIndex);
	@tracked width = '';
	@tracked height = '';
	@tracked placement: 'anchor' | 'resample' = 'anchor';
	@tracked resample: 'fit' | 'fill' = 'fit';
	@tracked anchor: Anchor = 'top-left';
	@tracked bleed = false;
	@tracked otherId = 'custom';
	pages = new PageScopeState('current');
	#off = onMode('page-size', {
		enter: () => {
			const page = currentPage();
			if (page) this.seed(page);
		},
	});

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.pageIndex.unsubscribe();
		this.#off();
	}

	seed(page: ErrataPage) {
		const { width, height } = pageSize(page);
		const turns = totalRotation(page) / 90;
		const bleed = page.resize?.bleed ?? 0;
		this.width = mm(width - 2 * bleed);
		this.height = mm(height - 2 * bleed);
		this.bleed = bleed > 0;
		const mode: ResizeMode = page.resize?.mode ?? 'anchor';
		this.placement = mode === 'anchor' ? 'anchor' : 'resample';
		this.resample = mode === 'fill' ? 'fill' : 'fit';
		this.anchor = page.resize
			? rotateAnchor(
					flipAnchor(page.resize.anchor, page),
					turns,
				)
			: 'top-left';
		this.otherId = 'custom';
	}

	@cached
	get indices(): number[] | null {
		return this.pages.indices(
			this.doc.current?.pages.length ?? 0,
			this.pageIndex,
		);
	}

	setWidth = (v: string) => {
		this.width = v;
		this.otherId = 'custom';
	};

	setHeight = (v: string) => {
		this.height = v;
		this.otherId = 'custom';
	};

	#setMm(widthMm: number, heightMm: number) {
		const landscape = this.isLandscape;
		this.width = String(landscape ? heightMm : widthMm);
		this.height = String(landscape ? widthMm : heightMm);
	}

	preset = (id: string) => {
		const size = PRESETS.find((p) => p.id === id);
		if (!size) return;
		this.#setMm(size.widthMm, size.heightMm);
		this.otherId = 'custom';
	};

	pickOther = (id: string) => {
		const size = findPaperSize(id);
		if (!size) return;
		this.#setMm(size.widthMm, size.heightMm);
		this.otherId = id;
	};

	get isLandscape() {
		return (parseMm(this.width) ?? 0) > (parseMm(this.height) ?? 0);
	}

	get activePreset(): string | null {
		const w = parseMm(this.width);
		const h = parseMm(this.height);
		if (w === null || h === null) return null;
		return matchPaperSize(w, h, PRESETS) ?? null;
	}

	get presetIndex(): number {
		return PRESETS.findIndex((p) => p.id === this.activePreset);
	}

	pickPreset = (index: number) => this.preset(PRESETS[index]!.id);

	swap = () => {
		[this.width, this.height] = [this.height, this.width];
	};

	setBleed = (on: boolean) => (this.bleed = on);
	setPlacement = (placement: 'anchor' | 'resample') =>
		(this.placement = placement);
	setAnchor = (anchor: Anchor) => (this.anchor = anchor);
	setResample = (resample: 'fit' | 'fill') => (this.resample = resample);

	get valid() {
		return (
			parseMm(this.width) !== null &&
			parseMm(this.height) !== null &&
			this.indices !== null
		);
	}

	get targets(): Set<string> {
		const pages = this.doc.current?.pages ?? [];
		return new Set(
			(this.indices ?? []).flatMap((i) =>
				pages[i] ? [pages[i].id] : [],
			),
		);
	}

	resizeFor(page: ErrataPage, w: number, h: number): PageResize {
		const turns = totalRotation(page) / 90;
		const swap = turns % 2 !== 0;
		const bleed = this.bleed ? BLEED_MM * MM_TO_POINTS : 0;
		return {
			width: (swap ? h : w) + 2 * bleed,
			height: (swap ? w : h) + 2 * bleed,
			mode:
				this.placement === 'anchor'
					? 'anchor'
					: this.resample,
			anchor: flipAnchor(
				rotateAnchor(this.anchor, -turns),
				page,
			),
			...(bleed > 0 ? { bleed } : {}),
		};
	}

	apply = () => {
		const w = parseMm(this.width);
		const h = parseMm(this.height);
		if (w === null || h === null || this.indices === null) return;
		resizePages(this.targets, (page) => this.resizeFor(page, w, h));
		closeMode();
	};

	reset = () => {
		if (this.indices === null) return;
		resizePages(this.targets, () => null);
		closeMode();
	};

	<template>
		<ToolPanel
			@open={{@open}}
			@mode="page-size"
			@icon="scaling"
			@label="Page size"
			@onCancel={{closeMode}}
			@onApply={{this.apply}}
			@canApply={{this.valid}}
		>
			<:actions>
				<Cell
					@label="Reset"
					@icon="undo-2"
					@text="Reset"
					@disabled={{if this.indices false true}}
					@onClick={{this.reset}}
				/>
			</:actions>
			<:default>
				<Group class="is-tall">
					<Field @label="Preset">
						<CanonSegmented
							class="err-mode-seg"
							@items={{PRESET_LABELS}}
							@columns={{3}}
							@selected={{this.presetIndex}}
							@onChange={{this.pickPreset}}
							aria-label="Preset"
						/>
						<PaperMenu
							class="err-paper-other"
							@value={{this.otherId}}
							@label="Paper size"
							@placeholder="Other…"
							@onChange={{this.pickOther}}
						/>
					</Field>
					<Field @label="Size">
						<input
							class="err-mode-input err-size-input"
							inputmode="decimal"
							aria-label="Width"
							value={{this.width}}
							{{on
								"input"
								(readText
									this.setWidth
								)
							}}
						/>
						<Cell
							class="err-swap"
							@label="Swap"
							@icon="arrow-left-right"
							@onClick={{this.swap}}
						/>
						<input
							class="err-mode-input err-size-input"
							inputmode="decimal"
							aria-label="Height"
							value={{this.height}}
							{{on
								"input"
								(readText
									this.setHeight
								)
							}}
						/>
						<span class="err-unit">mm</span>
					</Field>
					<InputField @label="Bleed">
						<CanonSwitch
							@on={{this.bleed}}
							@onChange={{this.setBleed}}
							aria-label="Bleed"
						/>
						<span class="err-unit">3 mm</span>
					</InputField>
				</Group>
				<Group>
					<Field @label="Content">
						<Segmented
							@options={{PLACEMENTS}}
							@value={{this.placement}}
							@onChange={{this.setPlacement}}
						/>
					</Field>
					{{#if (eq this.placement "anchor")}}
						<AnchorPicker
							@value={{this.anchor}}
							@onChange={{this.setAnchor}}
						/>
					{{else}}
						<Field @label="Scale">
							<Segmented
								@options={{RESAMPLES}}
								@value={{this.resample}}
								@onChange={{this.setResample}}
							/>
						</Field>
					{{/if}}
				</Group>
				<PageScope
					@state={{this.pages}}
					@invalid={{if this.indices false true}}
				/>
			</:default>
		</ToolPanel>
	</template>
}
