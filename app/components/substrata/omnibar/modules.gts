import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';
import { on } from '@ember/modifier';
import type { TOC } from '@ember/component/template-only';
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
	ToolModuleBody,
	ToolModuleSub,
} from 'delphitools-v2/components/substrata/omnibar/tool-settings';

/**
 * Module registry + box wrapper (round 3): an open module renders in the
 * RAIL (uniform height, beside the omnibar) or FLOATS at an arbitrary point
 * (natural height, mini-when-idle — see float-layer). The box supplies the
 * header (grip · title · sub · clamp-when-floating · ✕). Titles =
 * mockup/omnibar words.
 */

/** Bodies and subs still to port. The registry entry stays live (the rail and
 *  the omnibar render every module) with nothing inside. */
const ModuleStub: TOC<{ Args: object }> = <template>
	<div class="sub-module-stub"></div>
</template>;

type ModulePart = ComponentLike<{ Args: object }>;

export interface ModuleDef {
	id: ModuleId;
	title: string;
	/** kebab-case lucide name for the omnibar trigger. null for the two units
	 *  the Next app draws differently: `tool` mirrors the active subtool's
	 *  glyph, `colour` is a live swatch. */
	icon: string | null;
	/** box width, as a CSS length (the Next app carried a Tailwind class) */
	width: string;
	body: ModulePart;
	/** the header's sub slot, or null when the module has none */
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
		// pass 2: components/substrata/modules/fx-panel.tsx — FxBody, FxSub
		body: ModuleStub,
		sub: ModuleStub,
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
		// pass 2: components/substrata/modules/colour-panel.tsx —
		// ColourBody, ColourName
		body: ModuleStub,
		sub: ModuleStub,
	},
	looks: {
		id: 'looks',
		title: 'Looks',
		icon: 'film',
		width: '312px',
		// pass 2: components/substrata/modules/looks-panel.tsx —
		// LooksBody, LooksSub
		body: ModuleStub,
		sub: ModuleStub,
	},
	arrange: {
		id: 'arrange',
		title: 'Arrange',
		icon: 'align-horizontal-distribute-center',
		width: '224px',
		// pass 2: components/substrata/modules/arrange-panel.tsx — ArrangeBody
		body: ModuleStub,
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

/** The shared header row: grip · title · sub · (clamp) · ✕. Exported so the
 *  float-layer's mini card can render exactly this and nothing else. */
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

	/** `ml-auto` lands on the first header item that can push the rest to the
	 *  trailing edge: the sub slot, else the clamp button, else the ✕. */
	get clampIsEnd() {
		return this.isFloat && subOf(this.args.id) === null;
	}

	get closeIsEnd() {
		return !this.isFloat && subOf(this.args.id) === null;
	}

	toggleClamp = () => setClamped(this.args.id, !this.clamped);
	close = () => togglePin(this.args.id);

	<template>
		{{! Drag grip (dnd-kit draggable): drag a module out of the rail to
			float it anywhere, drag a floating module to move it, drop on the
			rail zone to re-dock. The shell's manager owns the drop dispatch. }}
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

/**
 * Render a module. `rail` = docked in the rail (own width, uniform height,
 * sticky header); `float` = free-floating (own width, natural height, clamp
 * toggle in the header). The float-layer owns mini/full switching — this box
 * always renders the FULL panel.
 */
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
