import Component from '@glimmer/component';
import { cached } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { eq, or } from 'ember-truth-helpers';
import CanonMenuCell from 'delphicanon/components/canon-menu-cell';
import CanonSwitch from 'delphicanon/components/canon-switch';
import ToolPanel, {
	Field,
	InputField,
	Segmented,
	livePreview,
	readText,
	type SegmentedOption,
} from 'delphitools-v2/components/errata/tool-panel';
import type {
	FieldObject,
	FieldType,
} from 'delphitools-v2/lib/errata/doc-model';
import {
	fieldDraft,
	parseOptions,
	setFieldDraft,
	type FieldDraft,
} from 'delphitools-v2/lib/errata/fields';
import {
	findObject,
	patchObjects,
	store,
} from 'delphitools-v2/lib/errata/store';
import { closeMode, onMode, selection } from 'delphitools-v2/lib/errata/ui';
import {
	getSourceWidgets,
	loadSourceWidgets,
	subscribeWidgets,
	widgetStandIns,
} from 'delphitools-v2/lib/errata/widgets';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import './form-mode.css';

const TYPES: SegmentedOption<FieldType>[] = [
	{ value: 'text', icon: 'text-cursor-input', label: 'Text' },
	{ value: 'checkbox', icon: 'square-check', label: 'Checkbox' },
	{ value: 'radio', icon: 'circle-dot', label: 'Radio' },
	{ value: 'dropdown', icon: 'chevrons-up-down', label: 'Dropdown' },
	{ value: 'signature', icon: 'signature', label: 'Signature' },
];

export default class FormPanel extends Component<{ Args: { open: boolean } }> {
	doc = new TrackedExternal(store.subscribe, store.getSnapshot);
	selected = new TrackedExternal(selection.subscribe, selection.get);
	draft = new TrackedExternal(fieldDraft.subscribe, fieldDraft.get);
	widgets = new TrackedExternal(subscribeWidgets, getSourceWidgets);
	#off = onMode('form', { enter: loadSourceWidgets });

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.selected.unsubscribe();
		this.draft.unsubscribe();
		this.widgets.unsubscribe();
		this.#off();
	}

	get target(): { pageId: string; field: FieldObject } | null {
		const ids = this.selected.current;
		const hit =
			ids.length === 1
				? findObject(this.doc.current, ids[0])
				: null;
		return hit?.object.kind === 'field'
			? { pageId: hit.page.id, field: hit.object }
			: null;
	}

	@cached
	get standIns() {
		const doc = this.doc.current;
		return doc
			? widgetStandIns(doc, this.widgets.current ?? [])
			: [];
	}

	get props(): FieldDraft {
		return this.target?.field ?? this.draft.current;
	}

	get choices(): string[] {
		return ['None', ...this.props.options];
	}

	get choice(): number | undefined {
		const { value, options } = this.props;
		if (value === '') return 0;
		const i = options.indexOf(value);
		return i === -1 ? undefined : i + 1;
	}

	get checked() {
		return this.props.value !== '';
	}

	get optionsText() {
		return this.props.options.join(', ');
	}

	get duplicate() {
		const name = this.props.name;
		const count = (this.doc.current?.pages ?? []).reduce(
			(n, p) =>
				n +
				p.objects.filter(
					(o) =>
						o.kind === 'field' &&
						o.name === name,
				).length,
			0,
		);
		return name !== '' && count > (this.target ? 1 : 0);
	}

	patch = (changes: Partial<FieldDraft>) => {
		const t = this.target;
		if (t) patchObjects(t.pageId, new Map([[t.field.id, changes]]));
		else setFieldDraft(changes);
	};

	setType = (field: FieldType) => this.patch({ field, value: '' });
	setName = (name: string) => this.patch({ name: name.trim() });
	setValue = (value: string) => this.patch({ value: value.trim() });
	setChoice = (value: string) => this.patch({ value });
	setChecked = (on: boolean) => this.patch({ value: on ? 'on' : '' });
	setRequired = (required: boolean) => this.patch({ required });
	pickChoice = (index: number) =>
		this.setChoice(
			index === 0 ? '' : this.props.options[index - 1]!,
		);
	setOptions = (text: string) => {
		const options = parseOptions(text);
		this.patch({
			options,
			value: options.includes(this.props.value)
				? this.props.value
				: '',
		});
	};

	<template>
		<ToolPanel
			@open={{@open}}
			@mode="form"
			@icon="text-cursor-input"
			@label="Prepare form"
			@onApply={{closeMode}}
			@applyLabel="Done"
			{{livePreview (if @open this.standIns)}}
		>
			<Field @label="Type">
				<Segmented
					@options={{TYPES}}
					@value={{this.props.field}}
					@onChange={{this.setType}}
				/>
			</Field>
			<InputField @label="Name">
				<input
					class="err-mode-input"
					aria-label="Name"
					aria-invalid={{if
						this.duplicate
						"true"
						"false"
					}}
					placeholder={{this.props.field}}
					value={{this.props.name}}
					{{on "change" (readText this.setName)}}
				/>
			</InputField>
			{{#if
				(or
					(eq this.props.field "radio")
					(eq this.props.field "dropdown")
				)
			}}
				<InputField @label="Options">
					<input
						class="err-mode-input"
						aria-label="Options"
						placeholder="One, Two"
						value={{this.optionsText}}
						{{on
							"change"
							(readText
								this.setOptions
							)
						}}
					/>
				</InputField>
				<Field @label="Default">
					<CanonMenuCell
						class="err-form-menu"
						@items={{this.choices}}
						@selected={{this.choice}}
						@label="Default"
						@onChange={{this.pickChoice}}
					/>
				</Field>
			{{else if (eq this.props.field "text")}}
				<InputField @label="Default">
					<input
						class="err-mode-input"
						aria-label="Default"
						value={{this.props.value}}
						{{on
							"change"
							(readText this.setValue)
						}}
					/>
				</InputField>
			{{else if (eq this.props.field "checkbox")}}
				<InputField @label="Checked">
					<CanonSwitch
						@on={{this.checked}}
						@onChange={{this.setChecked}}
						aria-label="Checked"
					/>
				</InputField>
			{{/if}}
			<InputField @label="Required">
				<CanonSwitch
					@on={{this.props.required}}
					@onChange={{this.setRequired}}
					aria-label="Required"
				/>
			</InputField>
		</ToolPanel>
	</template>
}
