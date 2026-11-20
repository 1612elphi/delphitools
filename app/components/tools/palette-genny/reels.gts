import type { TOC } from '@ember/component/template-only';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import type { SafeString } from '@ember/template';
import CanonContextMenu from 'delphicanon/components/canon-context-menu';
import type {
	CanonMenuEntry,
	CanonMenuItem,
} from 'delphicanon/components/canon-menu';
import { IconSvg } from 'delphitools-v2/components/icon';

export interface ReelColumn {
	key: string;
	index: number;
	number: string;
	hex: string;
	value: string;
	name: string;
	locked: boolean;
	wide: boolean;
	style: SafeString;
	reel?: { panels: SafeString[] };
	info?: {
		lines: { label: string; value: string }[];
		contrasts: {
			against: string;
			ratio: string;
			white: boolean;
			lamps: { label: string; on: boolean }[];
		}[];
	};
	menu: CanonMenuEntry[];
}

interface ReelsSignature {
	Args: {
		columns: ReelColumn[];
		widened: boolean;
		onWiden: (index: number) => void;
		onLock: (index: number) => void;
		onEdit: (index: number, event: Event) => void;
		onLanded: (index: number) => void;
		onMenu: (index: number, item: CanonMenuItem) => void;
		onCopy: (value: string) => void;
	};
}

const Reels: TOC<ReelsSignature> = <template>
	<div class="pg-reels {{if @widened 'pg-reels--widened'}}">
		{{#each @columns key="key" as |column|}}
			<CanonContextMenu
				class="pg-col
					{{if column.wide 'pg-col--wide'}}
					{{if column.reel 'pg-col--spun'}}"
				style={{column.style}}
				@items={{column.menu}}
				@onSelect={{fn @onMenu column.index}}
			>
				{{#if column.reel}}
					<div
						class="pg-reel"
						aria-hidden="true"
						{{on
							"animationend"
							(fn
								@onLanded
								column.index
							)
						}}
					>
						{{#each
							column.reel.panels
							as |panel|
						}}
							<span
								style={{panel}}
							></span>
						{{/each}}
					</div>
				{{/if}}
				<button
					type="button"
					class="pg-col-widen"
					aria-label="{{column.name}} {{column.value}}"
					aria-pressed={{if
						column.wide
						"true"
						"false"
					}}
					{{on
						"click"
						(fn @onWiden column.index)
					}}
				></button>
				<span
					class="pg-col-number pg-col-text"
				>{{column.number}}</span>
				{{#if column.info}}
					<div class="pg-col-info pg-col-text">
						{{#each
							column.info.lines
							as |line|
						}}
							<button
								type="button"
								class="pg-info-line"
								{{on
									"click"
									(fn
										@onCopy
										line.value
									)
								}}
							>
								<span
									class="pg-info-label"
								>{{line.label}}</span>
								<span
									class="pg-info-value"
								>{{line.value}}</span>
							</button>
						{{/each}}
						{{#each
							column.info.contrasts
							as |row|
						}}
							<div
								class="pg-info-contrast"
							>
								<span
									class="pg-info-chip
										{{if
											row.white
											'pg-info-chip--white'
										}}"
								>Aa</span>
								<span
									class="pg-info-ratio"
								>
									<span
									>{{row.ratio}}</span>
									<span
										class="pg-info-against"
									>{{row.against}}</span>
								</span>
								{{#each
									row.lamps
									as |lamp|
								}}
									<span
										class="pg-info-lamp
											{{if
												lamp.on
												'pg-info-lamp--on'
											}}"
									>{{lamp.label}}</span>
								{{/each}}
							</div>
						{{/each}}
					</div>
				{{/if}}
				<span class="pg-col-readout pg-col-text">
					<span
						class="pg-col-value"
					>{{column.value}}</span>
					<span
						class="pg-col-name"
					>{{column.name}}</span>
					<input
						type="color"
						class="pg-col-picker"
						value={{column.hex}}
						aria-label="Edit colour {{column.value}}"
						{{on
							"input"
							(fn
								@onEdit
								column.index
							)
						}}
					/>
				</span>
				<button
					type="button"
					class="pg-col-lamp pg-col-text
						{{if
							column.locked
							'pg-col-lamp--on'
						}}"
					aria-label={{if
						column.locked
						"Unlock colour"
						"Lock colour"
					}}
					aria-pressed={{if
						column.locked
						"true"
						"false"
					}}
					{{on "click" (fn @onLock column.index)}}
				><IconSvg
						@name={{if
							column.locked
							"lock"
							"lock-open"
						}}
					/></button>
			</CanonContextMenu>
		{{/each}}
	</div>
</template>;

export default Reels;
