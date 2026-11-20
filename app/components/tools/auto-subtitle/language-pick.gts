import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import type { ComponentLike } from '@glint/template';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCommand, {
	type CanonCommandItem,
} from 'delphicanon/components/canon-command';
import CanonDialog, {
	type CanonDialogClose,
} from 'delphicanon/components/canon-dialog';
import CanonRow from 'delphicanon/components/canon-row';
import { IconSvg } from 'delphitools-v2/components/icon';
import { LANGUAGES } from 'delphitools-v2/lib/transcribe';

export interface LanguagePickSignature {
	Args: {
		value: string;
		disabled?: boolean;
		onChange: (code: string) => void;
	};
}

const AUTO = 'Auto-detect';
const COMMON_COUNT = 12;

const Globe = <template><IconSvg @name="globe" /></template>;

const flag = (code: string): ComponentLike => <template>
	<img
		class="as-flag"
		src="/flags/{{code}}.svg"
		width="16"
		height="16"
		alt=""
		loading="lazy"
	/>
</template>;

const FLAGS = new Map(LANGUAGES.map(({ code }) => [code, flag(code)]));

const item = (
	id: string,
	code: string,
	name: string,
	group?: string,
): CanonCommandItem => ({
	id,
	title: name,
	group,
	keywords: [code],
	icon: FLAGS.get(code),
	detail: group === 'All languages' ? code : undefined,
});

const autoItem: CanonCommandItem = {
	id: 'auto',
	title: AUTO,
	keywords: ['auto', 'detect'],
	icon: Globe,
};
const COMMON = LANGUAGES.slice(0, COMMON_COUNT).map((l) =>
	item(`common-${l.code}`, l.code, l.name, 'Common'),
);
const ALL = [...LANGUAGES]
	.sort((a, b) => a.name.localeCompare(b.name))
	.map((l) => item(l.code, l.code, l.name, 'All languages'));

export default class LanguagePick extends Component<LanguagePickSignature> {
	@tracked open = false;
	@tracked query = '';

	get current() {
		return LANGUAGES.find((lang) => lang.code === this.args.value);
	}

	get text() {
		return this.current?.name ?? AUTO;
	}

	get icon() {
		const code = this.current?.code;
		return (code && FLAGS.get(code)) || Globe;
	}

	get items() {
		return this.query.trim()
			? [autoItem, ...ALL]
			: [autoItem, ...COMMON, ...ALL];
	}

	show = () => (this.open = true);

	closed = () => {
		this.open = false;
		this.query = '';
	};

	search = (query: string) => (this.query = query);

	pick = (close: CanonDialogClose, picked: CanonCommandItem) => {
		this.args.onChange(
			picked.id === 'auto'
				? ''
				: picked.id.replace(/^common-/, ''),
		);
		close();
	};

	<template>
		<CanonRow
			class="as-language"
			@title="Language"
			@form="flush"
			as |titleId|
		>
			<CanonButton
				class="as-language-pick"
				@kind="cell"
				@text={{this.text}}
				@icon={{this.icon}}
				@disabled={{@disabled}}
				aria-describedby={{titleId}}
				aria-haspopup="dialog"
				@onClick={{this.show}}
			/>
		</CanonRow>
		<CanonDialog
			class="as-language-dialog"
			@open={{this.open}}
			@onClose={{this.closed}}
			aria-label="Language"
		>
			<:default as |close|>
				<CanonCommand
					@items={{this.items}}
					@placeholder="Search languages…"
					@label="Language"
					@empty="No language found"
					@onSelect={{fn this.pick close}}
					@onQuery={{this.search}}
				/>
			</:default>
		</CanonDialog>
	</template>
}
