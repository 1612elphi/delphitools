import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { modifier } from 'ember-modifier';
import { eq } from 'ember-truth-helpers';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonTooltip from 'delphicanon/components/canon-tooltip';
import StampPanel, {
	CompressPanel,
	ImposePanel,
	RedactPanel,
} from 'delphitools-v2/components/errata/box-mode';
import Organise from 'delphitools-v2/components/errata/organise';
import CommentPanel from 'delphitools-v2/components/errata/comment-mode';
import FormPanel from 'delphitools-v2/components/errata/form-mode';
import PageSizePanel from 'delphitools-v2/components/errata/page-size-panel';
import {
	InsertPanel,
	RotatePanel,
} from 'delphitools-v2/components/errata/page-strips';
import ToolPanel from 'delphitools-v2/components/errata/tool-panel';
import { PanelHeader } from 'delphitools-v2/components/substrata/editor/cells';
import { MenuCard } from 'delphitools-v2/components/substrata/editor/floating-card';
import { cropFromDisplayed } from 'delphitools-v2/lib/errata/doc-model';
import { exportCurrent } from 'delphitools-v2/lib/errata/export-file';
import { cropPage } from 'delphitools-v2/lib/errata/page-ops';
import { store } from 'delphitools-v2/lib/errata/store';
import {
	boxMode,
	closeMode,
	cropDraft,
	modal,
	setMode,
	toolbox,
	type BoxMode,
} from 'delphitools-v2/lib/errata/ui';
import { inserts } from 'delphitools-v2/components/errata/write/insert-menu';
import { startMarkup } from 'delphitools-v2/lib/errata/write/markup';
import {
	continueAsPdf,
	exportWrite,
} from 'delphitools-v2/lib/errata/write/session';
import { writeStore } from 'delphitools-v2/lib/errata/write/store';
import { showTab, writePanel } from 'delphitools-v2/lib/errata/write/view';
import { allTools } from 'delphitools-v2/lib/tools';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

type BoxTool = 'fill-sign' | 'export' | BoxMode;

const STAMP_MODES = ['page-numbers', 'watermark', 'stamp'] as const;

interface BoxCell {
	label: string;
	icon: string;
	description: string;
	tool: BoxTool;
}

function fromRegistry(id: string): string {
	return allTools.find((t) => t.id === id)?.description ?? '';
}

const BOX_GROUPS: { heading: string; cells: BoxCell[] }[] = [
	{
		heading: 'Pages',
		cells: [
			{
				label: 'Organise',
				icon: 'layout-grid',
				description: fromRegistry('pdf-organiser'),
				tool: 'organise',
			},
			{
				label: 'Page size',
				icon: 'scaling',
				description: 'Resize, crop and rescale pages',
				tool: 'page-size',
			},
			{
				label: 'Rotate',
				icon: 'rotate-cw',
				description: fromRegistry('pdf-rotate-crop'),
				tool: 'rotate',
			},
			{
				label: 'Crop',
				icon: 'crop',
				description:
					'Drag a rectangle to crop the page',
				tool: 'crop',
			},
			{
				label: 'Insert page',
				icon: 'file-plus',
				description: 'Add a blank page, or several',
				tool: 'insert',
			},
			{
				label: 'Page numbers',
				icon: 'hash',
				description: fromRegistry('pdf-page-numberer'),
				tool: 'page-numbers',
			},
		],
	},
	{
		heading: 'Prepare',
		cells: [
			{
				label: 'Prepare form',
				icon: 'text-cursor-input',
				description:
					'Add interactive fields like checkboxes',
				tool: 'form',
			},
			{
				label: 'Fill & sign',
				icon: 'signature',
				description:
					'Draw or upload your signature and place it',
				tool: 'fill-sign',
			},
			{
				label: 'Stamp',
				icon: 'stamp',
				description:
					'Stamp text or an image on the document',
				tool: 'stamp',
			},
			{
				label: 'Watermark',
				icon: 'droplet',
				description: 'Add a watermark to the document',
				tool: 'watermark',
			},
			{
				label: 'Redact',
				icon: 'eye-off',
				description: 'Remove content for good',
				tool: 'redact',
			},
		],
	},
	{
		heading: 'Review',
		cells: [
			{
				label: 'Comment',
				icon: 'message-square',
				description: 'Leave notes PDF viewers can read',
				tool: 'comment',
			},
			{
				label: 'Preflight',
				icon: 'list-checks',
				description: fromRegistry('pdf-preflight'),
				tool: 'preflight',
			},
			{
				label: 'Compress',
				icon: 'archive',
				description: fromRegistry('pdf-compressor'),
				tool: 'compress',
			},
		],
	},
	{
		heading: 'Output',
		cells: [
			{
				label: 'Impose',
				icon: 'book-open',
				description: fromRegistry('imposer'),
				tool: 'impose',
			},
			{
				label: 'Export',
				icon: 'download',
				description: 'Download the finished file',
				tool: 'export',
			},
		],
	},
];

const WRITE_TOOLS = new Set<BoxTool>([
	'page-size',
	'insert',
	'page-numbers',
	'fill-sign',
	'stamp',
	'watermark',
	'comment',
	'export',
]);

const WRITE_TEXT: Partial<Record<BoxTool, string>> = {
	'page-size': 'Set paper size and orientation',
	insert: 'Start a new page at the caret',
};

const WRITE_GROUPS = [
	...BOX_GROUPS.map((g) => ({
		heading: g.heading,
		cells: g.cells
			.filter((c) => WRITE_TOOLS.has(c.tool))
			.map((c) => ({
				...c,
				description:
					WRITE_TEXT[c.tool] ?? c.description,
			})),
	})).filter((g) => g.cells.length),
	{
		heading: 'As a PDF',
		cells: BOX_GROUPS.flatMap((g) =>
			g.cells.filter((c) => !WRITE_TOOLS.has(c.tool)),
		),
	},
];

let session = writeStore.session();
writeStore.subscribe(() => {
	const now = writeStore.session();
	if (now !== session && boxMode.get() === 'as-pdf') closeMode();
	session = now;
});

export default class Toolbox extends Component<{
	Args: { phone: boolean; write?: boolean };
}> {
	@tracked pending: BoxMode | null = null;
	@tracked busy = false;
	@tracked failed = false;

	boxOpen = new TrackedExternal(toolbox.subscribe, toolbox.get);
	mode = new TrackedExternal(boxMode.subscribe, boxMode.get);
	draft = new TrackedExternal(cropDraft.subscribe, cropDraft.get);

	cropHint = 'Drag on the page';
	asPdfHint = 'Text will no longer be editable';

	get groups() {
		return this.args.write ? WRITE_GROUPS : BOX_GROUPS;
	}

	willDestroy() {
		super.willDestroy();
		this.boxOpen.unsubscribe();
		this.mode.unsubscribe();
		this.draft.unsubscribe();
		toolbox.set(false);
		closeMode();
	}

	closeBox = () => toolbox.set(false);

	applyCrop = () => {
		const draft = cropDraft.get();
		const page = store
			.getSnapshot()
			?.pages.find((p) => p.id === draft?.pageId);
		const crop =
			page && draft && cropFromDisplayed(page, draft.rect);
		if (page && crop) cropPage(page.id, crop);
		closeMode();
	};

	outsideClose = modifier((sheet: HTMLElement, [open]: [boolean]) => {
		if (!open) return;
		const onDown = (event: PointerEvent) => {
			const target = event.target as HTMLElement;
			if (
				sheet.contains(target) ||
				target.closest('[data-toolbox]')
			)
				return;
			toolbox.set(false);
		};
		document.addEventListener('pointerdown', onDown);
		return () =>
			document.removeEventListener('pointerdown', onDown);
	});

	run = (tool: BoxTool) => {
		toolbox.set(false);
		if (this.args.write) return this.runWrite(tool);
		if (tool === 'fill-sign') modal.set('signature');
		else if (tool === 'export') void exportCurrent();
		else setMode(tool);
	};

	runWrite(tool: BoxTool) {
		writePanel.set(null);
		if (tool === 'export') void exportWrite();
		else if (tool === 'page-size') {
			if (!showTab('paper')) writePanel.set('setup');
		} else if (tool === 'insert') inserts.pageBreak();
		else if (tool === 'page-numbers') inserts.numbers();
		else if (tool === 'fill-sign') {
			startMarkup();
			modal.set('signature');
		} else if (WRITE_TOOLS.has(tool)) {
			startMarkup();
			setMode(tool);
		} else {
			this.pending = tool;
			this.failed = false;
			setMode('as-pdf');
		}
	}

	asPdf = async () => {
		const tool = this.pending;
		this.busy = true;
		const ok = await continueAsPdf(
			() => boxMode.get() !== 'as-pdf',
		).catch(() => false);
		this.busy = false;
		this.failed = !ok;
		if (ok) setMode(tool);
	};

	<template>
		{{#if (eq this.mode.current "organise")}}
			<Organise />
		{{/if}}
		<section
			class="err-sheet
				{{if this.boxOpen.current 'is-open'}}
				{{if @phone 'is-phone'}}"
			aria-label="Toolbox"
			inert={{unless this.boxOpen.current true}}
			{{this.outsideClose this.boxOpen.current}}
		>
			<PanelHeader
				@title="Toolbox"
				@onClose={{this.closeBox}}
			/>
			<div class="err-sheet-body">
				{{#each this.groups key="heading" as |g|}}
					<div class="err-sheet-group">
						<CanonHeading
							@text={{g.heading}}
						/>
						<div class="err-sheet-grid">
							{{#each
								g.cells
								key="label"
								as |c|
							}}
								<CanonTooltip
									@text={{c.description}}
									as |t|
								>
									<MenuCard
										@title={{c.label}}
										@icon={{c.icon}}
										@onClick={{fn
											this.run
											c.tool
										}}
										{{t.trigger}}
									/>
								</CanonTooltip>
							{{/each}}
						</div>
					</div>
				{{/each}}
			</div>
		</section>

		<div class="err-modes">
			<ToolPanel
				@open={{eq this.mode.current "crop"}}
				@mode="crop"
				@icon="crop"
				@label="Crop"
				@onCancel={{closeMode}}
				@onApply={{this.applyCrop}}
				@canApply={{if this.draft.current true false}}
			>
				<:status>
					<span
						class="err-mode-tag"
					>{{this.cropHint}}</span>
				</:status>
			</ToolPanel>
			<ToolPanel
				@open={{eq this.mode.current "as-pdf"}}
				@mode="as-pdf"
				@label="Continue as PDF"
				@onCancel={{closeMode}}
				@onApply={{this.asPdf}}
				@applyLabel="Continue"
				@busy={{this.busy}}
				@failed={{this.failed}}
			>
				<:status>
					<span
						class="err-mode-tag"
					>{{this.asPdfHint}}</span>
				</:status>
			</ToolPanel>
			{{#each STAMP_MODES as |m|}}
				<StampPanel
					@mode={{m}}
					@open={{eq this.mode.current m}}
				/>
			{{/each}}
			<CompressPanel
				@open={{eq this.mode.current "compress"}}
			/>
			<ImposePanel @open={{eq this.mode.current "impose"}} />
			<RedactPanel @open={{eq this.mode.current "redact"}} />
			<FormPanel @open={{eq this.mode.current "form"}} />
			<CommentPanel
				@open={{eq this.mode.current "comment"}}
			/>
			<PageSizePanel
				@open={{eq this.mode.current "page-size"}}
			/>
			<RotatePanel @open={{eq this.mode.current "rotate"}} />
			<InsertPanel @open={{eq this.mode.current "insert"}} />
		</div>
	</template>
}
