import Component from '@glimmer/component';
import { service } from '@ember/service';
import CanonButton from 'delphicanon/components/canon-button';
import CanonEmptyRow from 'delphicanon/components/canon-empty-row';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRows from 'delphicanon/components/canon-rows';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import { downloadText } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import './text-tool.css';

interface ResultSignature {
	Args: {
		heading: string;
		text: string;
		fileName: string;
		busy?: boolean;
	};
	Blocks: {
		default: [];
		extra: [];
	};
	Element: HTMLDivElement;
}

const CopyIcon = <template><IconSvg @name="copy" /></template>;
const DownloadIcon = <template><IconSvg @name={{(downloadIcon)}} /></template>;

export default class Result extends Component<ResultSignature> {
	@service('canon-toast') declare toast: CanonToastService;

	get blank() {
		return this.args.text.trim() === '';
	}

	get downloadText() {
		return passAlong('Download');
	}

	copy = () => void this.toast.copy(this.args.text);

	download = () => downloadText(this.args.text, this.args.fileName);

	<template>
		<CanonRows class="tt-result" @framed={{true}} ...attributes>
			<CanonHeading @text={{@heading}} />
			{{#if this.blank}}
				{{#unless @busy}}
					<CanonEmptyRow @text="None" />
				{{/unless}}
			{{else}}
				{{#if (has-block)}}
					<output
						class="tt-result-text tt-result-text--marked"
						aria-label={{@heading}}
					>
						{{yield}}
					</output>
				{{else}}
					<output
						class="tt-result-text"
						aria-label={{@heading}}
					>{{@text}}</output>
				{{/if}}
			{{/if}}
			{{yield to="extra"}}
			<CanonGrid>
				<CanonButton
					class="tt-download"
					@text={{this.downloadText}}
					@icon={{DownloadIcon}}
					@disabled={{this.blank}}
					@onClick={{this.download}}
				/>
				<CanonButton
					class="tt-copy"
					@text="Copy"
					@icon={{CopyIcon}}
					@iconStyle="oversized"
					@kind="primary"
					@disabled={{this.blank}}
					@onClick={{this.copy}}
				/>
			</CanonGrid>
		</CanonRows>
	</template>
}
