import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import type Owner from '@ember/owner';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonEmptyRow from 'delphicanon/components/canon-empty-row';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonSwitch from 'delphicanon/components/canon-switch';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadText } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import {
	diffLines,
	diffPatch,
	pieces,
	rowSpans,
	sideMarks,
} from 'delphitools-v2/components/tools/text-diff/diff';
import Picture, {
	ACCEPT,
	type SideId,
} from 'delphitools-v2/components/tools/text-diff/picture';
import Ribbons, {
	ribbonsHeight,
} from 'delphitools-v2/components/tools/text-diff/ribbons';
import './text-diff/text-diff.css';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const CopyIcon = <template><IconSvg @name="copy" /></template>;
const DownloadIcon = <template><IconSvg @name={{(downloadIcon)}} /></template>;

const sample = {
	old: '# delphitools\nPrivacy-first tools for designers.\nNothing leaves the device.\n\nTools:\n- Colour converter\n- Regex tester\n- Paper sizes\n- Unit converter\n\nEvery tool works offline, on iPhone and iPad.\nVersion 1.0, built in Karlsruhe.',
	new: '# delphitools\nPrivacy-first tools for designers and developers.\nNothing leaves the device.\n\nTools:\n- Colour converter\n- Regex tester\n- Text diff\n- JSON formatter\n- Paper sizes\n\nEvery tool works offline, on iPhone, iPad and iPhone Duo.\nVersion 1.1, built in Karlsruhe.',
};

const LARGE = 20_000;
const SETTLE_MS = 150;

export default class TextDiffTool extends Component {
	@service('canon-toast') declare toast: CanonToastService;

	@tracked oldText = '';
	@tracked newText = '';
	@tracked diffed: [string, string] = ['', ''];
	#settleTimer?: ReturnType<typeof setTimeout>;
	@tracked wrap = true;
	@tracked pictureHeight?: number;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const sampled = query.has('diffSample');
		this.oldText =
			query.get('diffOld') ?? (sampled ? sample.old : '');
		this.newText =
			query.get('diffNew') ?? (sampled ? sample.new : '');
		if (query.has('diffWrap'))
			this.wrap = query.get('diffWrap') !== '0';
		this.diffed = [this.oldText, this.newText];
	}

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#settleTimer);
	}

	#settle() {
		clearTimeout(this.#settleTimer);
		const run = () => (this.diffed = [this.oldText, this.newText]);
		if (this.oldText.length + this.newText.length > LARGE)
			this.#settleTimer = setTimeout(run, SETTLE_MS);
		else run();
	}

	// ponytail: main thread; a worker if multi-megabyte diffs stall
	@cached
	get diff() {
		return diffLines(...this.diffed);
	}

	@cached
	get spans() {
		return rowSpans(this.diff);
	}

	@cached
	get marks() {
		const [old, next] = this.diffed;
		if (old !== this.oldText || next !== this.newText)
			return { old: [], new: [] };
		return sideMarks(this.diff, this.spans);
	}

	get patch() {
		return diffPatch(this.diff);
	}

	get hasText() {
		return this.diff.length > 0;
	}

	get same() {
		return this.diff.every((line) => line.type === 'same');
	}

	get changed() {
		return this.hasText && !this.same;
	}

	get ribbonsHeight() {
		return ribbonsHeight(this.diff);
	}

	get listingStyle() {
		let highest = 1;
		for (const line of this.diff)
			highest = Math.max(
				highest,
				'oldLine' in line ? line.oldLine : 0,
				'newLine' in line ? line.newLine : 0,
			);
		return htmlSafe(`--td-digits: ${String(highest).length}`);
	}

	get rows() {
		return this.diff.map((line, index) => ({
			type: line.type,
			oldNum: line.type === 'add' ? '' : String(line.oldLine),
			newNum: line.type === 'del' ? '' : String(line.newLine),
			marker:
				line.type === 'add'
					? '+'
					: line.type === 'del'
						? '−'
						: ' ',
			pieces: line.text
				? pieces(line.text, this.spans[index]!)
				: [{ text: ' ', on: false }],
		}));
	}

	get downloadText() {
		return passAlong('Download');
	}

	setText = (side: SideId, text: string) => {
		if (side === 'old') this.oldText = text;
		else this.newText = text;
		this.#settle();
	};

	readFile = (side: SideId, file: File) => void this.#load(side, file);

	async #load(side: SideId, file: File) {
		if (file.size > MAX_FILE_BYTES) return;
		const text = await file.text();
		if (!this.isDestroying) this.setText(side, text);
	}

	readOriginal = (file: File) => this.readFile('old', file);

	drop = (event: DragEvent) => {
		const file = event.dataTransfer?.files[0];
		if (!file || event.defaultPrevented) return;
		event.preventDefault();
		this.readOriginal(file);
	};

	dragOver = (event: DragEvent) => {
		if (event.dataTransfer?.types.includes('Files'))
			event.preventDefault();
	};

	swap = () => {
		[this.oldText, this.newText] = [this.newText, this.oldText];
		this.#settle();
	};

	setWrap = (on: boolean) => {
		this.wrap = on;
	};

	copySide = (side: SideId) =>
		void this.toast.copy(
			side === 'old' ? this.oldText : this.newText,
		);

	copyPatch = () => void this.toast.copy(this.patch);

	download = () =>
		downloadText(
			this.patch,
			'changes.diff',
			'text/x-diff;charset=utf-8',
		);

	measured = (height: number) => {
		if (height + 2 !== this.pictureHeight)
			this.pictureHeight = height + 2;
	};

	<template>
		<CanonSplit
			class="text-diff"
			@halves={{true}}
			@collapsesTo={{150}}
			{{filePaste this.readOriginal accept=ACCEPT}}
			{{on "drop" this.drop}}
			{{on "dragover" this.dragOver}}
		>
			<:sidebar>
				<CanonCanvas @height={{this.pictureHeight}}>
					<Picture
						@oldText={{this.oldText}}
						@newText={{this.newText}}
						@oldMarks={{this.marks.old}}
						@newMarks={{this.marks.new}}
						@onInput={{this.setText}}
						@onFile={{this.readFile}}
						@onCopy={{this.copySide}}
						@onSwap={{this.swap}}
						@onHeight={{this.measured}}
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonCanvas @height={{this.ribbonsHeight}}>
					<Ribbons @diff={{this.diff}} />
				</CanonCanvas>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Differences" />
					<CanonRow @title="Wrap" as |titleId|>
						<CanonSwitch
							aria-labelledby={{titleId}}
							@on={{this.wrap}}
							@onChange={{this.setWrap}}
						/>
					</CanonRow>
					{{#if this.changed}}
						<div
							class="td-listing
								{{if
									this.wrap
									'td-listing--wrap'
								}}"
							role="region"
							aria-label="Differences"
							tabindex="0"
							style={{this.listingStyle}}
						>
							{{#each
								this.rows
								key="@index"
								as |row|
							}}
								<div
									class="td-row td-row--{{row.type}}"
								><span
										class="td-num"
										aria-hidden="true"
									>{{row.oldNum}}</span><span
										class="td-num"
										aria-hidden="true"
									>{{row.newNum}}</span><span
										class="td-marker"
									>{{row.marker}}</span><span
										class="td-row-text"
									>{{~#each
											row.pieces
											key="@index"
											as |piece|
										~}}<span
												class={{if
													piece.on
													"td-word"
												}}
											>{{piece.text}}</span>{{~/each~}}</span></div>
							{{/each}}
						</div>
					{{else if this.hasText}}
						<CanonEmptyRow
							@text="Texts are identical"
						/>
					{{else}}
						<CanonEmptyRow
							@text="Nothing to compare"
						/>
					{{/if}}
					<CanonGrid>
						<CanonButton
							class="td-download"
							@text={{this.downloadText}}
							@icon={{DownloadIcon}}
							@disabled={{if
								this.changed
								false
								true
							}}
							@onClick={{this.download}}
						/>
						<CanonButton
							class="td-copy"
							@text="Copy patch"
							@icon={{CopyIcon}}
							@iconStyle="oversized"
							@kind="primary"
							@disabled={{if
								this.changed
								false
								true
							}}
							@onClick={{this.copyPatch}}
						/>
					</CanonGrid>
				</CanonRows>
				<p class="td-credit">
					contributed by
					<a
						href="https://github.com/Pranavk-official"
						target="_blank"
						rel="noopener noreferrer"
					>Pranav K</a>
					with some tweaks: word wrap toggle with
					synced line numbers, flat typed array
					for the lcs table, deferred diff
					computation, file size cap, and a few
					accessibility fixes.
				</p>
			</:main>
		</CanonSplit>
	</template>
}
