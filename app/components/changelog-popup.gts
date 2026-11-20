import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { guidFor } from '@ember/object/internals';
import { eq } from 'ember-truth-helpers';
import { LinkTo } from '@ember/routing';
import CanonButton from 'delphicanon/components/canon-button';
import CanonDialog from 'delphicanon/components/canon-dialog';
import CanonGrid from 'delphicanon/components/canon-grid';
import Icon from 'delphitools-v2/components/icon';
import { RELEASES, type Release } from 'delphitools-v2/lib/changelog';
import { allTools, type Tool } from 'delphitools-v2/lib/tools';
import './changelog-popup.css';

const PILL_TEXT = "what's new?";

const TOOLS_BY_NAME = new Map(
	allTools.map((tool) => [tool.name.toLowerCase(), tool]),
);

type TabId = 'features' | 'fixes' | 'technical';

const TABS: { id: TabId; title: string }[] = [
	{ id: 'features', title: 'Features' },
	{ id: 'fixes', title: 'Fixes' },
	{ id: 'technical', title: 'Technical' },
];

interface Entry {
	line: string;
	tool?: Tool;
	lead: string;
	rest: string;
}

function parse(line: string): Entry {
	const colon = line.indexOf(': ');
	if (colon === -1) return { line, lead: line, rest: '' };
	const lead = line.slice(0, colon);
	const tool = TOOLS_BY_NAME.get(lead.toLowerCase());
	return { line, tool, lead, rest: line.slice(colon + 1) };
}

function filledTabs(release: Release): TabId[] {
	return TABS.map((tab) => tab.id).filter((id) => release[id].length > 0);
}

export default class ChangelogPopup extends Component {
	@tracked isOpen = false;
	@tracked release: Release = RELEASES[0]!;
	@tracked tab: TabId = filledTabs(RELEASES[0]!)[0] ?? 'technical';

	uid = guidFor(this);
	titleId = `${this.uid}-title`;

	get tabs() {
		const filled = filledTabs(this.release);
		return TABS.map((tab) => ({
			...tab,
			tabId: `${this.uid}-tab-${tab.id}`,
			selected: tab.id === this.tab,
			disabled: !filled.includes(tab.id),
		}));
	}

	get panelId() {
		return `${this.uid}-panel`;
	}

	get activeTabId() {
		return `${this.uid}-tab-${this.tab}`;
	}

	get entries(): Entry[] {
		const lines = this.release[this.tab];
		return this.tab === 'features'
			? lines.map(parse)
			: lines.map((line) => ({ line, lead: line, rest: '' }));
	}

	open = (event: Event) => {
		(event.currentTarget as HTMLElement).focus();
		this.isOpen = true;
	};

	closed = () => {
		this.isOpen = false;
	};

	selectVersion = (event: Event) => {
		const version = (event.target as HTMLSelectElement).value;
		this.release =
			RELEASES.find((entry) => entry.version === version) ??
			RELEASES[0]!;
		this.tab = filledTabs(this.release)[0] ?? 'technical';
	};

	setTab = (id: TabId) => {
		this.tab = id;
	};

	tabKey = (event: KeyboardEvent) => {
		const list = event.currentTarget as HTMLElement;
		const enabled = filledTabs(this.release);
		const at = enabled.indexOf(this.tab);
		let next: TabId | undefined;
		switch (event.key) {
			case 'ArrowRight':
			case 'ArrowDown':
				next = enabled[(at + 1) % enabled.length];
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
				next =
					enabled[
						(at - 1 + enabled.length) %
							enabled.length
					];
				break;
			case 'Home':
				next = enabled[0];
				break;
			case 'End':
				next = enabled.at(-1);
				break;
			default:
				return;
		}
		event.preventDefault();
		if (!next) return;
		this.tab = next;
		list.querySelector<HTMLElement>(
			`#${this.uid}-tab-${next}`,
		)?.focus();
	};

	<template>
		<button
			type="button"
			class="dt-hero-link"
			{{on "click" this.open}}
		>
			{{PILL_TEXT}}
		</button>
		<CanonDialog
			class="dt-cl"
			@open={{this.isOpen}}
			@onClose={{this.closed}}
			aria-labelledby={{this.titleId}}
		>
			<:header>
				<h2 class="dt-cl-title" id={{this.titleId}}>
					What's new in version
					<select
						class="dt-cl-version"
						aria-label="Version"
						{{on
							"change"
							this.selectVersion
						}}
					>
						{{#each
							RELEASES key="version"
							as |entry|
						}}
							<option
								value={{entry.version}}
								selected={{eq
									entry
									this.release
								}}
							>{{entry.version}}</option>
						{{/each}}
					</select>?
				</h2>
				<CanonGrid
					class="dt-cl-tabs"
					role="tablist"
					{{on "keydown" this.tabKey}}
				>
					{{#each this.tabs key="id" as |tab|}}
						<CanonButton
							class="dt-cl-tab"
							role="tab"
							id={{tab.tabId}}
							aria-selected={{if
								tab.selected
								"true"
								"false"
							}}
							aria-controls={{this.panelId}}
							tabindex={{if
								tab.selected
								"0"
								"-1"
							}}
							@kind="segment"
							@text={{tab.title}}
							@selected={{tab.selected}}
							@disabled={{tab.disabled}}
							@onClick={{fn
								this.setTab
								tab.id
							}}
						/>
					{{/each}}
				</CanonGrid>
			</:header>
			<:default>
				<div
					class="dt-cl-body"
					role="tabpanel"
					id={{this.panelId}}
					aria-labelledby={{this.activeTabId}}
					tabindex="0"
				>
					<ul class="dt-cl-list">
						{{#each
							this.entries
							as |entry|
						}}
							<li class="dt-cl-item">
								{{#if
									entry.tool
								}}
									<LinkTo
										@route="tools.tool"
										@model={{entry.tool.id}}
										class="dt-cl-tool"
									>
										<span
											class="dt-cl-badge"
											aria-hidden="true"
										>
											<Icon
												@name="star"
											/>
											<Icon
												@name="wrench"
											/>
										</span>
										{{entry.lead}}</LinkTo>:{{entry.rest}}
								{{else}}
									{{entry.line}}
								{{/if}}
							</li>
						{{/each}}
					</ul>
				</div>
			</:default>
			<:footer as |close|>
				<CanonButton
					class="dt-cl-close"
					@text="Close"
					@onClick={{fn close ""}}
				/>
			</:footer>
		</CanonDialog>
	</template>
}
