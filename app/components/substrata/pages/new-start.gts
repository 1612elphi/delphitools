import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import { Cell } from 'delphitools-v2/components/substrata/editor/cells';
import { editorUi } from 'delphitools-v2/lib/substrata/editor-ui';
import { ensureScene, startBlank } from 'delphitools-v2/lib/substrata/file-ops';
import {
	getPersistenceEnabled,
	setPersistenceEnabled,
	subscribePersistence,
} from 'delphitools-v2/lib/substrata/persistence-pref';
import { toast } from 'delphitools-v2/lib/substrata/toast';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import { pageState } from './page-state';
import 'delphitools-v2/components/substrata/editor/tool-bar/tools.css';
import './pages.css';

const close = () => {
	editorUi.newOpen = false;
	ensureScene();
};

export default class NewStart extends Component {
	persist = new TrackedExternal(
		subscribePersistence,
		getPersistenceEnabled,
	);

	willDestroy() {
		super.willDestroy();
		this.persist.unsubscribe();
	}

	escape = modifier((el: HTMLElement) => {
		el.querySelector<HTMLElement>(
			'.sub-empty-card button',
		)?.focus();
		const onKey = (e: KeyboardEvent) => {
			const inDialog = (
				e.target as Element | null
			)?.closest?.('dialog, [role=dialog]:not(.sub-new)');
			if (e.key === 'Escape' && !inDialog) close();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	scratch = () => {
		editorUi.newOpen = false;
		pageState.anchor = null;
		startBlank();
	};

	templates = () => editorUi.openGallery('templates');

	@tracked hot = false;

	get offering() {
		return !this.persist.current;
	}

	get asking() {
		return this.offering && this.hot;
	}

	warm = () => (this.hot = true);
	cool = () => (this.hot = false);

	projects = () => {
		if (!this.offering) {
			editorUi.openGallery('projects');
			return;
		}
		setPersistenceEnabled(true);
		toast('saved');
	};

	<template>
		{{#if editorUi.newOpen}}
			<div
				class="sub-new"
				role="dialog"
				aria-label="New"
				{{this.escape}}
			>
				<button
					type="button"
					class="sub-new-dismiss"
					aria-label="Close"
					tabindex="-1"
					{{on "click" close}}
				></button>
				<div class="sub-empty-card">
					<div class="sub-empty-actions">
						<Cell
							@label="Start from scratch"
							@text="Start from scratch"
							@icon="file-plus"
							@onClick={{this.scratch}}
						/>
						<Cell
							@label="Use a template"
							@text="Use a template"
							@icon="layout-template"
							@onClick={{this.templates}}
						/>
						<Cell
							class={{if
								this.offering
								"is-offer"
							}}
							@label={{if
								this.offering
								"Turn on saving?"
								"Open a project"
							}}
							@text={{if
								this.asking
								"Turn on saving?"
								"Open a project"
							}}
							@icon={{if
								this.asking
								"hard-drive"
								"folder-open"
							}}
							@onClick={{this.projects}}
							{{on
								"pointerenter"
								this.warm
							}}
							{{on
								"pointerleave"
								this.cool
							}}
							{{on "focus" this.warm}}
							{{on "blur" this.cool}}
						/>
					</div>
				</div>
			</div>
		{{/if}}
	</template>
}
