import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import type { DragDropManager } from '@dnd-kit/dom';
import CanonMenu, {
	type CanonMenuItem,
} from 'delphicanon/components/canon-menu';
import CanonRows from 'delphicanon/components/canon-rows';
import { IconSvg } from 'delphitools-v2/components/icon';
import sortable from 'delphitools-v2/modifiers/sortable';
import type { RasterLayer } from 'delphitools-v2/lib/substrata/doc-model';
import {
	fxDisplayLabel,
	getFxDef,
	removeFx,
	resetFx,
	toggleFx,
	type FxItem,
	type FxStack,
} from 'delphitools-v2/lib/substrata/fx-ops';
import FxEditor from './fx-editor';
import type { FxContext } from './fx-context';

const ResetIcon = <template><IconSvg @name="rotate-ccw" /></template>;
const RemoveIcon = <template><IconSvg @name="trash-2" /></template>;

const DELETE_WIDTH = 88;

interface Signature {
	Args: {
		layer: RasterLayer;
		stack: FxStack;
		fx: FxItem;
		index: number;
		open: boolean;
		onToggle: (id: string) => void;
		manager: DragDropManager;
	};
}

export default class FxBlock extends Component<Signature> {
	@tracked slide = 0;
	@tracked revealed = false;
	#slid = false;

	get def() {
		return getFxDef(this.args.stack, this.args.fx.type);
	}

	get matte() {
		return this.args.fx.type === 'remove-background';
	}

	get expandable() {
		return this.matte || (this.def?.params.length ?? 0) > 0;
	}

	get isOpen() {
		return this.expandable && this.args.open;
	}

	get label() {
		return fxDisplayLabel(this.args.stack, this.args.fx);
	}

	get ctx(): FxContext | null {
		const def = this.def;
		return def
			? {
					layer: this.args.layer,
					layerId: this.args.layer.id,
					stack: this.args.stack,
					fx: this.args.fx,
					def,
				}
			: null;
	}

	get menu(): CanonMenuItem[] {
		return [
			{
				title: 'Reset',
				icon: ResetIcon,
				disabled:
					!this.expandable ||
					this.matte ||
					!this.args.fx.enabled,
			},
			{
				title: 'Remove',
				icon: RemoveIcon,
				destructive: true,
			},
		];
	}

	get barStyle() {
		return htmlSafe(`--sub-fxp-slide: ${this.slide}px`);
	}

	toggle = () => {
		if (this.#slid) return;
		if (this.revealed) {
			this.revealed = false;
			this.slide = 0;
			return;
		}
		this.args.onToggle(this.args.fx.id);
	};

	toggleEnabled = () =>
		toggleFx(this.args.layer.id, this.args.stack, this.args.fx.id);

	remove = () =>
		removeFx(this.args.layer.id, this.args.stack, this.args.fx.id);

	select = (item: CanonMenuItem) => {
		if (item.title === 'Remove') this.remove();
		else if (item.title === 'Reset')
			resetFx(
				this.args.layer.id,
				this.args.stack,
				this.args.fx.id,
			);
	};

	slider = modifier((bar: HTMLElement) => {
		let pointer: number | undefined;
		let x0 = 0;
		let y0 = 0;
		let from = 0;
		let sliding = false;
		const leads = () =>
			getComputedStyle(bar).direction === 'rtl' ? -1 : 1;
		const down = (e: PointerEvent) => {
			if (
				e.button !== 0 ||
				(e.target as Element).closest(
					'.sub-fxp-grip, .sub-fxp-lamp, .sub-fxp-more',
				)
			)
				return;
			pointer = e.pointerId;
			x0 = e.clientX;
			y0 = e.clientY;
			from = this.revealed ? DELETE_WIDTH : 0;
			sliding = false;
			this.#slid = false;
		};
		const move = (e: PointerEvent) => {
			if (e.pointerId !== pointer) return;
			const dx = (e.clientX - x0) * leads();
			if (!sliding) {
				if (
					Math.abs(dx) <= 6 ||
					Math.abs(dx) <=
						2 * Math.abs(e.clientY - y0)
				)
					return;
				if (dx < 0 && !this.revealed) {
					pointer = undefined;
					return;
				}
				sliding = true;
				this.#slid = true;
				bar.setPointerCapture(e.pointerId);
			}
			const reach = from + dx;
			this.slide =
				leads() *
				Math.max(
					0,
					reach > DELETE_WIDTH
						? DELETE_WIDTH +
								(reach -
									DELETE_WIDTH) /
									3
						: reach,
				);
		};
		const up = (e: PointerEvent) => {
			if (e.pointerId !== pointer) return;
			pointer = undefined;
			if (!sliding) return;
			const reach = Math.abs(this.slide);
			this.revealed =
				e.type === 'pointerup' &&
				reach > DELETE_WIDTH / 2;
			this.slide = this.revealed ? leads() * DELETE_WIDTH : 0;
			window.setTimeout(() => (this.#slid = false));
		};
		bar.addEventListener('pointerdown', down);
		bar.addEventListener('pointermove', move);
		bar.addEventListener('pointerup', up);
		bar.addEventListener('pointercancel', up);
		return () => {
			bar.removeEventListener('pointerdown', down);
			bar.removeEventListener('pointermove', move);
			bar.removeEventListener('pointerup', up);
			bar.removeEventListener('pointercancel', up);
		};
	});

	<template>
		<div
			class="sub-fxp-block
				{{unless @fx.enabled 'is-off'}}
				{{if this.isOpen 'is-open'}}
				{{if this.revealed 'is-revealed'}}"
			data-fx-type={{@fx.type}}
			{{sortable
				id=@fx.id
				index=@index
				group=@stack
				handle=".sub-fxp-grip"
				manager=@manager
			}}
		>
			<div class="sub-fxp-slot">
				<button
					type="button"
					class="sub-fxp-delete"
					tabindex="-1"
					aria-hidden="true"
					{{on "click" this.remove}}
				><IconSvg @name="trash-2" /><span
					>Delete</span></button>
				<div
					class="sub-fxp-bar"
					style={{this.barStyle}}
					{{this.slider}}
				>
					<button
						type="button"
						class="sub-fxp-grip"
						aria-label="Reorder"
						title="Reorder"
					><IconSvg @name="menu" /></button>
					{{#if this.expandable}}
						<button
							type="button"
							class="sub-fxp-title"
							aria-expanded={{if
								this.isOpen
								"true"
								"false"
							}}
							{{on
								"click"
								this.toggle
							}}
						>
							<span
								class="sub-fxp-name"
							>{{this.label}}</span>
							<span
								class="sub-fxp-chevron"
								aria-hidden="true"
							><IconSvg
									@name="chevron-down"
								/></span>
						</button>
					{{else}}
						<span
							class="sub-fxp-title is-static"
						><span
								class="sub-fxp-name"
							>{{this.label}}</span></span>
					{{/if}}
					<button
						type="button"
						class="sub-fxp-lamp"
						aria-label="Enabled"
						aria-pressed={{if
							@fx.enabled
							"true"
							"false"
						}}
						title="Enabled"
						{{on
							"click"
							this.toggleEnabled
						}}
					><span></span></button>
					<CanonMenu
						@items={{this.menu}}
						@placement="bottom-end"
						@onSelect={{this.select}}
						as |m|
					>
						<button
							type="button"
							class="sub-fxp-more"
							aria-label="More"
							title="More"
							{{m.trigger}}
						><IconSvg
								@name="ellipsis"
							/></button>
					</CanonMenu>
				</div>
			</div>
			{{#if this.isOpen}}
				{{#if this.ctx}}
					<CanonRows class="sub-fxp-body">
						<FxEditor @ctx={{this.ctx}} />
					</CanonRows>
				{{/if}}
			{{/if}}
		</div>
	</template>
}
