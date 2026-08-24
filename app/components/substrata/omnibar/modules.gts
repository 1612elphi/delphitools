import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';
import { on } from '@ember/modifier';
import type { ComponentLike } from '@glint/template';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import draggable from 'delphitools-v2/modifiers/draggable';
import { setClamped } from 'delphitools-v2/lib/substrata/dock-pref';
import type { DockDrag } from 'delphitools-v2/lib/substrata/drag-dock';
import {
	togglePin,
	type ModuleId,
} from 'delphitools-v2/lib/substrata/pin-pref';
import {
	LayersBody,
	LayersCount,
} from 'delphitools-v2/components/substrata/modules/layers-panel';
import { InspectorBody } from 'delphitools-v2/components/substrata/modules/inspector-panel';
import {
	LooksBody,
	LooksSub,
} from 'delphitools-v2/components/substrata/modules/looks-panel';
import {
	ColourBody,
	ColourName,
} from 'delphitools-v2/components/substrata/modules/colour-panel';
import {
	FxBody,
	FxSub,
} from 'delphitools-v2/components/substrata/modules/fx-panel';
import { ArrangeBody } from 'delphitools-v2/components/substrata/modules/arrange-panel';
import {
	ToolModuleBody,
	ToolModuleSub,
} from 'delphitools-v2/components/substrata/omnibar/tool-settings';

// open module renders in rail (uniform height) or floats (natural height,
// mini-when-idle — float-layer)

type ModulePart = ComponentLike<{ Args: object }>;

export interface ModuleDef {
	id: ModuleId;
	title: string;
	// lucide name; null for tool (mirrors subtool glyph) and colour (live swatch)
	icon: string | null;
	// css length
	width: string;
	body: ModulePart;
	sub: ModulePart | null;
}

export const MODULES: Record<ModuleId, ModuleDef> = {
	tool: {
		id: 'tool',
		title: 'Tool Settings',
		icon: null,
		width: 'auto',
		body: ToolModuleBody,
		sub: ToolModuleSub,
	},
	layers: {
		id: 'layers',
		title: 'Layers',
		icon: 'layers',
		width: '224px',
		body: LayersBody,
		sub: LayersCount,
	},
	effects: {
		id: 'effects',
		title: 'FX',
		icon: 'sparkles',
		width: '296px',
		body: FxBody,
		sub: FxSub,
	},
	inspector: {
		id: 'inspector',
		title: 'Inspector',
		icon: 'box',
		width: '236px',
		body: InspectorBody,
		sub: null,
	},
	colour: {
		id: 'colour',
		title: 'Colour',
		icon: null,
		width: '236px',
		body: ColourBody,
		sub: ColourName,
	},
	looks: {
		id: 'looks',
		title: 'Looks',
		icon: 'film',
		width: '312px',
		body: LooksBody,
		sub: LooksSub,
	},
	arrange: {
		id: 'arrange',
		title: 'Arrange',
		icon: 'align-horizontal-distribute-center',
		width: '224px',
		body: ArrangeBody,
		sub: null,
	},
};

export type ModuleVariant = 'rail' | 'float';

function widthStyle(id: ModuleId) {
	return htmlSafe(`width: ${MODULES[id].width}`);
}

function titleOf(id: ModuleId): string {
	return MODULES[id].title;
}

function bodyOf(id: ModuleId): ModulePart {
	return MODULES[id].body;
}

function subOf(id: ModuleId): ModulePart | null {
	return MODULES[id].sub;
}

export interface ModuleHeaderSignature {
	Element: HTMLDivElement;
	Args: {
		id: ModuleId;
		variant: ModuleVariant;
		clamped?: boolean;
	};
}

// exported → float-layer's mini card renders exactly this
export class ModuleHeader extends Component<ModuleHeaderSignature> {
	get clamped() {
		return this.args.clamped ?? false;
	}

	get isFloat() {
		return this.args.variant === 'float';
	}

	get dragId() {
		return `dock-module-${this.args.id}`;
	}

	get dragData(): DockDrag {
		return { kind: 'module', id: this.args.id };
	}

	get clampHint() {
		return this.clamped ? 'Unpin' : 'Pin open';
	}

	get clampIcon() {
		return this.clamped ? 'pin-off' : 'pin';
	}

	// ml-auto goes to first item that pushes the rest trailing: sub, else
	// clamp, else ✕
	get clampIsEnd() {
		return this.isFloat && subOf(this.args.id) === null;
	}

	get closeIsEnd() {
		return !this.isFloat && subOf(this.args.id) === null;
	}

	toggleClamp = () => setClamped(this.args.id, !this.clamped);
	close = () => togglePin(this.args.id);

	<template>
		{{! drag out of rail to float, drop on rail zone to re-dock; shell
			manager owns drop dispatch }}
		<div
			class="sub-module-header
				{{if (eq @variant 'rail') 'is-rail'}}"
			{{draggable
				id=this.dragId
				data=this.dragData
				handle=".sub-grip"
			}}
			...attributes
		>
			<span
				class="sub-module-grip sub-grip cursor-grab"
				aria-label="Drag to move"
				title="Drag to move"
			><Icon @name="grip-vertical" /></span>
			<span class="sub-module-title">{{titleOf @id}}</span>
			{{#let (subOf @id) as |Sub|}}
				{{#if Sub}}
					<span class="sub-module-sub"><Sub
						/></span>
				{{/if}}
			{{/let}}
			{{#if this.isFloat}}
				<button
					type="button"
					class="sub-module-hbtn
						{{if this.clampIsEnd 'is-end'}}
						{{if this.clamped 'is-active'}}"
					aria-pressed={{if
						this.clamped
						"true"
						"false"
					}}
					aria-label={{this.clampHint}}
					title={{this.clampHint}}
					{{on "click" this.toggleClamp}}
				>
					<Icon @name={{this.clampIcon}} />
				</button>
			{{/if}}
			<button
				type="button"
				class="sub-module-hbtn
					{{if this.closeIsEnd 'is-end'}}"
				aria-label="Close panel"
				{{on "click" this.close}}
			>
				<Icon @name="x" />
			</button>
		</div>
	</template>
}

export interface ModuleBoxSignature {
	Element: HTMLDivElement;
	Args: {
		id: ModuleId;
		variant?: ModuleVariant;
		clamped?: boolean;
	};
}

// float-layer owns mini/full switching; this box always renders FULL panel
export class ModuleBox extends Component<ModuleBoxSignature> {
	get variant(): ModuleVariant {
		return this.args.variant ?? 'rail';
	}

	get clamped() {
		return this.args.clamped ?? false;
	}

	<template>
		<div
			class="sub-module
				{{if
					(eq this.variant 'rail')
					'is-rail'
					'is-float'
				}}"
			style={{widthStyle @id}}
			...attributes
		>
			<ModuleHeader
				@id={{@id}}
				@variant={{this.variant}}
				@clamped={{this.clamped}}
			/>
			<div class="sub-module-body">
				{{#let (bodyOf @id) as |Body|}}
					<Body />
				{{/let}}
			</div>
		</div>
	</template>
}
