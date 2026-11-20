import type Owner from '@ember/owner';
import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { array } from '@ember/helper';
import { modifier } from 'ember-modifier';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import { IconSvg } from 'delphitools-v2/components/icon';
import {
	Cell,
	RailPanel,
} from 'delphitools-v2/components/substrata/editor/cells';
import { caption } from 'delphitools-v2/components/substrata/colour/caption';
import ChannelSliders from 'delphitools-v2/components/substrata/colour/channel-sliders';
import Eyedropper from 'delphitools-v2/components/substrata/colour/eyedropper';
import HexKeypad from 'delphitools-v2/components/substrata/colour/hex-keypad';
import { readTheme } from 'delphitools-v2/components/substrata/colour/ring-paint';
import SwatchGrid, {
	type GridColumn,
} from 'delphitools-v2/components/substrata/colour/swatch-grid';
import {
	takeStill,
	type Still,
} from 'delphitools-v2/components/substrata/colour/still';
import type { Swatch } from 'delphitools-v2/lib/substrata/colour-ring/geometry';
import {
	ColourLibrary,
	swatchFor,
} from 'delphitools-v2/lib/substrata/colour-ring/library';
import {
	HexDigits,
	RING_TYPES,
	hexOf,
	sameColour,
	shelf,
	usedColours,
	type RingColour,
} from 'delphitools-v2/lib/substrata/colour-ring/model';
import { ColourWriter } from 'delphitools-v2/lib/substrata/colour-ring/writer';
import {
	getColour,
	subscribeColour,
} from 'delphitools-v2/lib/substrata/colour-store';
import { getSnapshot } from 'delphitools-v2/lib/substrata/doc-store';
import {
	editorUi,
	type TrayStop,
} from 'delphitools-v2/lib/substrata/editor-ui';
import {
	loadLayout,
	saveLayout,
} from 'delphitools-v2/lib/substrata/layout-storage';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import './colour.css';

const TYPE_KEY = 'colourTrayType';

const LIBRARY_COLUMNS: Record<string, GridColumn[]> = {
	markers: ColourLibrary.markers.columns,
	freetone: ColourLibrary.freetone.columns,
	palettes: ColourLibrary.palettes.columns,
};

const close = () => editorUi.close('colour');

export default class ColourTray extends Component {
	writer = new ColourWriter();
	digits = new HexDigits();
	store = new TrackedExternal(subscribeColour, getColour);
	titles = RING_TYPES.map((t) => t.title);

	@tracked typeIndex = clampType(loadLayout<number>(TYPE_KEY, 0));
	@tracked typing = false;
	@tracked still: Still | null = null;
	@tracked picked: string | null = null;
	#documentColours: string[];
	#beforeTyping: RingColour | null = null;
	#stopBefore: TrayStop = 'short';
	#editor: HTMLElement | null = null;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		this.writer.begin(editorUi.ringTarget);
		this.picked = hexOf(this.writer.current, false);
		const doc = getSnapshot();
		this.#documentColours = doc ? usedColours(doc) : [];
	}

	willDestroy() {
		super.willDestroy();
		this.finish();
		this.writer.end();
		editorUi.ringTarget = null;
		this.store.unsubscribe();
	}

	get current(): RingColour {
		void this.store.current;
		void this.writer.targetColour;
		return this.writer.current;
	}

	get type() {
		return RING_TYPES[this.typeIndex]!.id;
	}

	get typeTitle() {
		return RING_TYPES[this.typeIndex]!.title;
	}

	get isSliders() {
		return this.type === 'sliders';
	}

	get flows() {
		return !(this.type in LIBRARY_COLUMNS);
	}

	get columns(): GridColumn[] {
		const library = LIBRARY_COLUMNS[this.type];
		if (library) return library;
		if (this.type === 'starred')
			return [
				{
					label: 'Starred',
					swatches: shelf.stars.map(swatchFor),
				},
			];
		return [
			{
				label: 'Recent',
				swatches: shelf.recent.map(swatchFor),
			},
			{
				label: '',
				swatches: this.#documentColours.map(swatchFor),
			},
		];
	}

	editorAnchor = modifier((element: HTMLElement) => {
		this.#editor = element.closest<HTMLElement>('.sub-ed');
	});

	get editorElement() {
		return this.#editor ?? document.body;
	}

	pickType = (index: number) => {
		this.typeIndex = index;
		saveLayout(TYPE_KEY, index);
	};

	write = (colour: RingColour, final: boolean) => {
		this.writer.set(colour, final);
	};

	pick = (swatch: Swatch) => {
		const colour = this.writer.atCurrentOpacity(swatch.hex);
		if (!colour) return;
		this.picked = swatch.hex;
		this.write(colour, true);
		caption.show(swatch);
	};

	toggleEyedropper = () => {
		this.finish();
		if (this.still) {
			this.still = null;
			return;
		}
		const editor = this.#editor;
		if (editor)
			this.still = takeStill(editor, readTheme(editor).muted);
	};

	eyedropped = (colour: RingColour) => {
		this.still = null;
		this.pick(swatchFor(hexOf(colour, false)));
	};

	toggleHex = () => (this.typing ? this.finish() : this.editHex());

	editHex() {
		this.still = null;
		this.#beforeTyping = this.current;
		this.digits.show(this.current);
		this.typing = true;
		this.#stopBefore = editorUi.trayStop;
		editorUi.trayStop = 'tall';
	}

	typed = () => {
		const typed = this.digits.colour;
		if (!typed) return;
		this.write(
			this.digits.digits.length === 8
				? typed
				: { ...typed, alpha: this.current.alpha },
			false,
		);
	};

	finish = () => {
		if (!this.typing) return;
		this.typing = false;
		editorUi.trayStop = this.#stopBefore;
		const before = this.#beforeTyping;
		this.#beforeTyping = null;
		if (before && !sameColour(before, this.current)) {
			this.write(this.current, true);
			this.picked = hexOf(this.current, false);
			caption.show(swatchFor(this.picked));
		} else if (before) this.writer.revert(before);
	};

	<template>
		<RailPanel @id="colour" @title="Colour" @onClose={{close}}>
			<:header>
				<Cell
					@label="Eyedropper"
					@icon="pipette"
					@selected={{if this.still true false}}
					@onClick={{this.toggleEyedropper}}
				/>
				<Cell
					@label="Hex"
					@icon="hash"
					@selected={{this.typing}}
					@onClick={{this.toggleHex}}
				/>
			</:header>
			<:default>
				<div class="sub-ct" {{this.editorAnchor}}>
					{{#if this.typing}}
						<HexKeypad
							class="sub-ct-pad"
							@digits={{this.digits}}
							@onChange={{this.typed}}
							@onDone={{this.finish}}
						/>
					{{else}}
						<CanonSegmented
							class="sub-ct-types"
							@items={{this.titles}}
							@icons={{array
								(component
									IconSvg
									name="highlighter"
								)
								(component
									IconSvg
									name="droplet"
								)
								(component
									IconSvg
									name="sliders-horizontal"
								)
								(component
									IconSvg
									name="swatch-book"
								)
								(component
									IconSvg
									name="star"
								)
								(component
									IconSvg
									name="clock"
								)
							}}
							@selected={{this.typeIndex}}
							@onChange={{this.pickType}}
						/>
						{{#if this.isSliders}}
							<ChannelSliders
								@colour={{this.current}}
								@onColour={{this.write}}
							/>
						{{else}}
							<SwatchGrid
								@columns={{this.columns}}
								@flows={{this.flows}}
								@picked={{this.picked}}
								@label={{this.typeTitle}}
								@onPick={{this.pick}}
							/>
						{{/if}}
					{{/if}}
				</div>
				{{#if this.still}}
					{{#in-element
						this.editorElement
						insertBefore=null
					}}
						<Eyedropper
							@still={{this.still}}
							@onPick={{this.eyedropped}}
						/>
					{{/in-element}}
				{{/if}}
			</:default>
		</RailPanel>
	</template>
}

function clampType(index: unknown): number {
	return typeof index === 'number' && RING_TYPES[index] ? index : 0;
}
