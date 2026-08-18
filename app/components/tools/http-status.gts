import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import Icon from 'delphitools-v2/components/icon';
import {
	HTTP_STATUSES,
	STATUS_CLASSES,
	TOTAL_STATUSES,
	filterStatuses,
} from 'delphitools-v2/lib/http-status';
import type {
	RegistryStatus,
	StatusClass,
	StatusClassInfo,
} from 'delphitools-v2/lib/http-status';

const COPIED_MS = 1500;

const REGISTRY_LABELS: Record<RegistryStatus, string> = {
	standard: 'Standard',
	deprecated: 'Deprecated',
	unused: 'Unused',
};

export default class HttpStatusTool extends Component {
	@tracked search = '';
	@tracked copied: number | null = null;
	@tracked activeClass: StatusClass | null = null;
	@tracked expandedCodes: number[] = [];
	@tracked collapsed: StatusClass[] = [];

	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
	}

	get placeholder() {
		return `Search ${TOTAL_STATUSES} codes…`;
	}

	get classButtons() {
		return this.classCounts.map(({ info, count }) => ({
			count,
			cls: info.class,
			label: `${info.class}xx`,
			isActive: this.activeClass === info.class,
			tint: `is-${info.class}xx`,
		}));
	}

	// Static data — computed once, not per render.
	classCounts = STATUS_CLASSES.map((info: StatusClassInfo) => ({
		info,
		count: HTTP_STATUSES.filter(
			(status) => status.class === info.class,
		).length,
	}));

	get groups() {
		return filterStatuses(this.search, this.activeClass).map(
			(group) => ({
				cls: group.class,
				name: group.name,
				tint: `is-${group.class}xx`,
				count: group.items.length,
				isExpanded: !this.collapsed.includes(
					group.class,
				),
				items: group.items.map((item) => ({
					...item,
					isOpen: this.expandedCodes.includes(
						item.code,
					),
					isCopied: this.copied === item.code,
					registryLabel:
						REGISTRY_LABELS[
							item.registered
						],
					hasRegistryNote:
						item.registered !== 'standard',
				})),
			}),
		);
	}

	setSearch = (event: Event) => {
		this.search = (event.target as HTMLInputElement).value;
	};

	clearSearch = () => {
		this.search = '';
	};

	setClass = (cls: StatusClass) => {
		this.activeClass = this.activeClass === cls ? null : cls;
	};

	showAll = () => {
		this.activeClass = null;
	};

	toggleGroup = (cls: StatusClass) => {
		this.collapsed = this.collapsed.includes(cls)
			? this.collapsed.filter((entry) => entry !== cls)
			: [...this.collapsed, cls];
	};

	toggleRow = (code: number) => {
		this.expandedCodes = this.expandedCodes.includes(code)
			? this.expandedCodes.filter((entry) => entry !== code)
			: [...this.expandedCodes, code];
	};

	copyCode = (code: number) => {
		void navigator.clipboard.writeText(String(code));
		this.copied = code;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = null),
			COPIED_MS,
		);
	};

	<template>
		<div class="dt-http">
			<div class="dt-http-search">
				<span class="dt-http-search-icon"><Icon
						@name="search"
					/></span>
				<input
					type="text"
					class="dt-http-search-input"
					value={{this.search}}
					placeholder={{this.placeholder}}
					aria-label="Search"
					{{on "input" this.setSearch}}
				/>
				{{#if this.search}}
					<button
						type="button"
						class="dt-http-clear"
						{{on "click" this.clearSearch}}
					>Clear</button>
				{{/if}}
			</div>

			<div class="dt-http-filters segmented">
				<button
					type="button"
					class="dt-http-filter is-all
						{{unless
							this.activeClass
							'is-active'
						}}"
					{{on "click" this.showAll}}
				>All
					<span
						class="dt-http-filter-count"
					>{{TOTAL_STATUSES}}</span></button>
				{{#each
					this.classButtons key="cls"
					as |filter|
				}}
					<button
						type="button"
						class="dt-http-filter
							{{filter.tint}}
							{{if
								filter.isActive
								'is-active'
							}}"
						{{on
							"click"
							(fn
								this.setClass
								filter.cls
							)
						}}
					>{{filter.label}}
						<span
							class="dt-http-filter-count"
						>{{filter.count}}</span></button>
				{{/each}}
			</div>

			{{#if this.groups}}
				{{#each this.groups key="cls" as |group|}}
					<div class="dt-http-group">
						<button
							type="button"
							class="dt-http-group-head"
							{{on
								"click"
								(fn
									this.toggleGroup
									group.cls
								)
							}}
						>
							<span
								class="dt-http-tint
									{{group.tint}}"
							>{{group.cls}}xx</span>
							<span
								class="dt-http-group-name"
							>{{group.name}}</span>
							<span
								class="dt-http-group-meta"
							>
								<span
								>{{group.count}}
									codes</span>
								<Icon
									class="dt-http-chevron
										{{unless
											group.isExpanded
											'is-collapsed'
										}}"
									@name="chevron-down"
								/>
							</span>
						</button>

						{{#if group.isExpanded}}
							<div
								class="dt-http-table"
							>
								{{#each
									group.items
									key="code"
									as |item|
								}}
									<div
										class="dt-http-row"
									>
										<button
											type="button"
											class="dt-http-tint
												{{group.tint}}"
											title="Filter class"
											aria-label="Filter {{group.cls}}xx"
											{{on
												"click"
												(fn
													this.setClass
													group.cls
												)
											}}
										>{{group.cls}}xx</button>
										<button
											type="button"
											class="dt-http-code
												{{group.tint}}"
											title="Copy code"
											aria-label="Copy {{item.code}}"
											{{on
												"click"
												(fn
													this.copyCode
													item.code
												)
											}}
										>
											{{#if
												item.isCopied
											}}
												<Icon
													@name="check"
												/>
											{{else}}
												{{item.code}}
											{{/if}}
										</button>
										<button
											type="button"
											class="dt-http-row-expand"
											aria-expanded={{if
												item.isOpen
												"true"
												"false"
											}}
											{{on
												"click"
												(fn
													this.toggleRow
													item.code
												)
											}}
										>
											<span
												class="dt-http-phrase"
											>{{item.phrase}}</span>
											<Icon
												class="dt-http-chevron
													{{unless
														item.isOpen
														'is-collapsed'
													}}"
												@name="chevron-down"
											/>
										</button>
									</div>

									{{#if
										item.isOpen
									}}
										<div
											class="dt-http-detail"
										>
											<span
												class="dt-http-detail-label"
											>Reference</span>
											<a
												href={{item.url}}
												target="_blank"
												rel="noopener noreferrer"
												class="dt-http-ref"
											>{{item.ref}}<Icon
													@name="arrow-up-right"
												/></a>
											<span
												class="dt-http-detail-label"
											>Cacheable</span>
											<span
												class="dt-http-cacheable"
											>{{#if
													item.cacheable
												}}Yes{{else}}No{{/if}}</span>
											{{#if
												item.hasRegistryNote
											}}
												<span
													class="dt-http-detail-label"
												>Registry</span>
												<span
													class="dt-http-registry"
												>{{item.registryLabel}}</span>
											{{/if}}
										</div>
									{{/if}}
								{{/each}}
							</div>
						{{/if}}
					</div>
				{{/each}}
			{{else}}
				<div class="dt-http-empty">No matches: &ldquo;{{this.search}}&rdquo;</div>
			{{/if}}
		</div>
	</template>
}
