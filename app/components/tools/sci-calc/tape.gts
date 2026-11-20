import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import type { TOC } from '@ember/component/template-only';
import CanonButton from 'delphicanon/components/canon-button';
import CanonContextMenu from 'delphicanon/components/canon-context-menu';
import type {
	CanonMenuEntry,
	CanonMenuItem,
} from 'delphicanon/components/canon-menu';
import CanonEmptyRow from 'delphicanon/components/canon-empty-row';
import CanonGrid from 'delphicanon/components/canon-grid';
import press from 'delphicanon/modifiers/canon-press';
import { IconSvg } from 'delphitools-v2/components/icon';
import type { Piece } from 'delphitools-v2/components/tools/sci-calc/entry';

export interface TapeEntry {
	id: number;
	expression: string;
	result: string;
	pieces: Piece[];
	written: string;
}

export interface TapeSignature {
	Args: {
		entries: TapeEntry[];
		onLoad: (entry: TapeEntry) => void;
		onMenu: (entry: TapeEntry, item: CanonMenuItem) => void;
		onClear: () => void;
	};
}

const CopyIcon = <template><IconSvg @name="copy" /></template>;
const UseIcon = <template><IconSvg @name="corner-left-up" /></template>;
const TrashIcon = <template><IconSvg @name="trash-2" /></template>;

export const menu: CanonMenuEntry[] = [
	{ title: 'Copy', icon: CopyIcon },
	{ title: 'Use', icon: UseIcon },
];

const Tape: TOC<TapeSignature> = <template>
	{{#each @entries key="id" as |entry|}}
		<CanonContextMenu
			class="sci-tape-entry"
			@items={{menu}}
			@onSelect={{fn @onMenu entry}}
		>
			<button
				type="button"
				class="sci-tape-row"
				{{press}}
				{{on "click" (fn @onLoad entry)}}
			>
				<span class="sci-tape-expression"><span>
						{{~#each
							entry.pieces
							as |piece|
						~}}
							<span
								class="sci-piece sci-piece--{{piece.kind}}
									{{if
										piece.raised
										'is-raised'
									}}"
							>{{piece.text}}</span>
						{{~/each~}}
					</span></span>
				<span class="sci-tape-result">=
					{{entry.written}}</span>
			</button>
		</CanonContextMenu>
	{{else}}
		<CanonEmptyRow @text="No history yet" />
	{{/each}}
	{{#if @entries.length}}
		<CanonGrid>
			<CanonButton
				@kind="cell"
				@text="Clear"
				@icon={{TrashIcon}}
				@onClick={{@onClear}}
			/>
		</CanonGrid>
	{{/if}}
</template>;

export default Tape;
