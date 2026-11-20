import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { isDestroying } from '@ember/destroyable';
import CanonButton from 'delphicanon/components/canon-button';
import { IconSvg } from 'delphitools-v2/components/icon';
import { JobProgress } from 'delphitools-v2/components/tools/media/job';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import { zipFiles, type NamedBlob } from 'delphitools-v2/lib/zip-files';
import './download-all.css';

const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;
const Archive = <template><IconSvg @name="archive" /></template>;

const isSet = (value: unknown) => value !== undefined;

const GAP_MS = 150;

export interface DownloadAllSignature {
	Args: {
		files: () => NamedBlob[] | Promise<NamedBlob[]>;
		zipName: string;
		kind?: 'primary' | 'secondary';
		disabled?: boolean;
		progress?: number;
		onCancel?: () => void;
	};
	Element: HTMLDivElement;
}

export default class DownloadAll extends Component<DownloadAllSignature> {
	@tracked busy = false;

	get off() {
		return this.args.disabled === true || this.busy;
	}

	all = () =>
		void this.#run(async (files) => {
			for (const [i, file] of files.entries()) {
				if (i)
					await new Promise((r) =>
						setTimeout(r, GAP_MS),
					);
				downloadBlob(file.blob, file.name);
			}
		});

	zip = () =>
		void this.#run(async (files) =>
			downloadBlob(await zipFiles(files), this.args.zipName),
		);

	async #run(save: (files: NamedBlob[]) => Promise<void>) {
		if (this.off) return;
		this.busy = true;
		try {
			const files = await this.args.files();
			if (files.length && !isDestroying(this))
				await save(files);
		} finally {
			if (!isDestroying(this)) this.busy = false;
		}
	}

	<template>
		<div class="media-download-all" ...attributes>
			<CanonButton
				class="media-download-all-each"
				@kind={{if @kind @kind "primary"}}
				@text={{passAlong "Download all"}}
				@icon={{Save}}
				@disabled={{this.off}}
				@onClick={{this.all}}
			/>
			<CanonButton
				class="media-download-all-zip"
				@kind="cell"
				@text="Zip"
				@icon={{Archive}}
				@disabled={{this.off}}
				@onClick={{this.zip}}
			/>
		</div>
		{{#if (isSet @progress)}}
			<JobProgress
				@progress={{@progress}}
				@onCancel={{@onCancel}}
			/>
		{{/if}}
	</template>
}
