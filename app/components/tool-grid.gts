import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { LinkTo } from '@ember/routing';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { modifier } from 'ember-modifier';
import { or } from 'ember-truth-helpers';
import CanonGrid from 'delphicanon/components/canon-grid';
import Icon from 'delphitools-v2/components/icon';
import { patternStyle } from 'delphitools-v2/lib/icon-pattern';
import type { Tool } from 'delphitools-v2/lib/tools';
import type MagazineService from 'delphitools-v2/services/magazine';
import { isPlainClick } from 'delphitools-v2/services/magazine';
import './tool-grid.css';

export interface ToolGridSignature {
	Element: HTMLDivElement;
	Args: {
		tools: Tool[];
		query?: Record<string, string>;
		carryLabel?: string;
		onPick?: (id: string) => void;
	};
}

const EMPTY_QUERY: Record<string, string> = {};
const noop = () => {};

export function queryOrEmpty(query?: Record<string, string>) {
	return query ?? EMPTY_QUERY;
}

const COLUMN_WIDTH = 195;

export function latticeColumns(width: number) {
	return Math.min(6, Math.max(2, Math.floor(width / COLUMN_WIDTH)));
}

export default class ToolGrid extends Component<ToolGridSignature> {
	@service declare magazine: MagazineService;

	@tracked columns = 2;

	openMagazine = (id: string, event: MouseEvent) => {
		if (!isPlainClick(event)) return;
		event.preventDefault();
		this.magazine.open(id);
	};

	measure = modifier((element: HTMLElement) => {
		let frame = 0;
		const observer = new ResizeObserver(([entry]) => {
			const columns = latticeColumns(
				entry?.contentRect.width ?? 0,
			);
			cancelAnimationFrame(frame);
			if (columns !== this.columns)
				frame = requestAnimationFrame(
					() => (this.columns = columns),
				);
		});
		observer.observe(element);
		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
		};
	});

	<template>
		<CanonGrid
			@columns={{this.columns}}
			class="dt-grid"
			{{this.measure}}
			...attributes
		>
			{{#each @tools as |tool|}}
				{{#if tool.magazine}}
					<a
						href={{tool.href}}
						class="dt-cell"
						data-magazine={{tool.id}}
						{{on
							"click"
							(fn
								this.openMagazine
								tool.id
							)
						}}
					>
						<span
							class="dt-cell-pattern"
							style={{patternStyle
								tool.icon
							}}
							aria-hidden="true"
						></span>
						<Icon
							@name={{tool.icon}}
							class="dt-cell-icon"
						/>
						<span
							class="dt-cell-name"
						>{{tool.name}}</span>
						<span
							class="dt-cell-desc"
						>{{tool.description}}</span>
					</a>
				{{else if tool.external}}
					<a
						href={{tool.href}}
						class="dt-cell"
						target="_blank"
						rel="noopener noreferrer"
					>
						<span
							class="dt-cell-pattern"
							style={{patternStyle
								tool.icon
							}}
							aria-hidden="true"
						></span>
						<Icon
							@name={{tool.icon}}
							class="dt-cell-icon"
						/>
						<span
							class="dt-cell-name"
						>{{tool.name}}</span>
						<span
							class="dt-cell-desc"
						>{{tool.description}}</span>
					</a>
				{{else if tool.route}}
					<LinkTo
						@route={{tool.route}}
						class="dt-cell
							{{if
								tool.highlight
								'is-highlight'
							}}"
					>
						<span
							class="dt-cell-pattern"
							style={{patternStyle
								tool.icon
							}}
							aria-hidden="true"
						></span>
						<Icon
							@name={{tool.icon}}
							class="dt-cell-icon"
						/>
						<span
							class="dt-cell-name"
						>{{tool.name}}</span>
						<span
							class="dt-cell-desc"
						>{{tool.description}}</span>
					</LinkTo>
				{{else}}
					<LinkTo
						@route="tools.tool"
						@model={{tool.id}}
						@query={{queryOrEmpty @query}}
						data-tool={{tool.id}}
						class="dt-cell
							{{if
								tool.highlight
								'is-highlight'
							}}"
						{{on
							"click"
							(fn
								(or
									@onPick
									noop
								)
								tool.id
							)
						}}
					>
						<span
							class="dt-cell-pattern"
							style={{patternStyle
								tool.icon
							}}
							aria-hidden="true"
						></span>
						<Icon
							@name={{tool.icon}}
							class="dt-cell-icon"
						/>
						<span
							class="dt-cell-name"
						>{{tool.name}}</span>
						<span
							class="dt-cell-desc"
						>{{tool.description}}</span>
						{{#if @carryLabel}}
							<span
								class="dt-cell-carry"
							>{{@carryLabel}}</span>
						{{/if}}
					</LinkTo>
				{{/if}}
			{{/each}}
		</CanonGrid>
	</template>
}
