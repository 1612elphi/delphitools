import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import type Owner from '@ember/owner';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonEmptyRow from 'delphicanon/components/canon-empty-row';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonJumpHeading from 'delphicanon/components/canon-jump-heading';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import type CanonToastService from 'delphicanon/services/canon-toast';
import Icon, { IconSvg } from 'delphitools-v2/components/icon';
import {
	REGISTRY_LABELS,
	STATUS_CLASSES,
	TOTAL_STATUSES,
	filterStatuses,
	lookupStatus,
	type StatusClass,
} from 'delphitools-v2/lib/http-status';
import Chart from './http-status/chart';
import './http-status/http-status.css';

const CopyIcon = <template><IconSvg @name="copy" /></template>;
const ClearIcon = <template><IconSvg @name="circle-x" /></template>;

const classTitles = ['All', ...STATUS_CLASSES.map((info) => `${info.class}xx`)];
const placeholder = `Search ${TOTAL_STATUSES} codes…`;
const fallback = lookupStatus(200)!;

export default class HttpStatusTool extends Component {
	@service('canon-toast') declare toast: CanonToastService;

	@tracked search = '';
	@tracked statusClass: StatusClass | null = null;
	@tracked selected = 200;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		this.search = query.get('httpSearch') ?? '';
		const cls = Number(query.get('httpClass'));
		if (cls >= 1 && cls <= 5) this.statusClass = cls as StatusClass;
		const code = Number(query.get('httpSelect'));
		if (lookupStatus(code)) this.selected = code;
	}

	get classIndex() {
		return this.statusClass ?? 0;
	}

	get groups() {
		return filterStatuses(this.search, this.statusClass).map(
			(group) => ({
				heading: `${group.class}xx · ${group.name}`,
				detail: `${group.items.length} codes`,
				items: group.items.map((status) => ({
					status,
					lit: status.code === this.selected,
					note:
						status.registered === 'standard'
							? undefined
							: REGISTRY_LABELS[
									status
										.registered
								],
				})),
			}),
		);
	}

	get matches() {
		return new Set(
			this.groups.flatMap((group) =>
				group.items.map((item) => item.status.code),
			),
		);
	}

	get empty() {
		return `No matches: “${this.search}”`;
	}

	get chosen() {
		return lookupStatus(this.selected) ?? fallback;
	}

	setSearch = (text: string) => {
		this.search = text;
	};

	clear = () => {
		this.search = '';
	};

	setClass = (index: number) => {
		this.statusClass = index === 0 ? null : (index as StatusClass);
	};

	select = (code: number) => {
		this.selected = code;
	};

	copy = (code: number) => void this.toast.copy(String(code));

	<template>
		<CanonSplit class="http-status">
			<:banner>
				<CanonCanvas
					@fitting={{true}}
					@animated={{true}}
				>
					<Chart
						@selected={{this.chosen}}
						@matches={{this.matches}}
						@onSelect={{this.select}}
					/>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Search" />
					<div class="hs-search">
						<Icon
							class="hs-search-icon"
							@name="search"
						/>
						<CanonTextCell
							class="hs-search-field"
							type="search"
							autocomplete="off"
							spellcheck="false"
							@value={{this.search}}
							@placeholder={{placeholder}}
							@onChange={{this.setSearch}}
							aria-label="Search"
						/>
						{{#if this.search}}
							<CanonButton
								@kind="cell"
								@icon={{ClearIcon}}
								@label="Clear"
								@onClick={{this.clear}}
							/>
						{{/if}}
					</div>
					<CanonHeading @text="Class" />
					<CanonSegmented
						@items={{classTitles}}
						@selected={{this.classIndex}}
						@columns={{3}}
						@onChange={{this.setClass}}
						aria-label="Class"
					/>
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonRows class="hs-list" @framed={{true}}>
					{{#each
						this.groups key="heading"
						as |group|
					}}
						<CanonJumpHeading
							@text={{group.heading}}
							@detail={{group.detail}}
						/>
						{{#each
							group.items
							key="status.code"
							as |item|
						}}
							<div class="hs-row">
								<button
									type="button"
									class="hs-row-body
										{{if
											item.lit
											'hs-row-body--lit'
										}}"
									aria-pressed={{if
										item.lit
										"true"
										"false"
									}}
									{{on
										"click"
										(fn
											this.select
											item.status.code
										)
									}}
								>
									<span
										class="hs-row-code"
									>{{item.status.code}}</span>
									<span
										class="hs-row-phrase"
									>{{item.status.phrase}}</span>
									{{#if
										item.note
									}}
										<span
											class="hs-row-note"
										>{{item.note}}</span>
									{{/if}}
								</button>
								<CanonButton
									class="hs-row-copy"
									@kind="cell"
									@icon={{CopyIcon}}
									@label="Copy {{item.status.code}}"
									@onClick={{fn
										this.copy
										item.status.code
									}}
								/>
							</div>
						{{/each}}
					{{else}}
						<CanonEmptyRow
							@text={{this.empty}}
						/>
					{{/each}}
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
