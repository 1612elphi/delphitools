import { LinkTo } from '@ember/routing';
import type { TOC } from '@ember/component/template-only';
import Icon from 'delphitools-v2/components/icon';
import type { Tool } from 'delphitools-v2/lib/tools';

export interface ToolGridSignature {
	Element: HTMLDivElement;
	Args: {
		tools: Tool[];
		query?: Record<string, string>;
		carryLabel?: string;
	};
}

const EMPTY_QUERY: Record<string, string> = {};

function queryOrEmpty(query?: Record<string, string>) {
	return query ?? EMPTY_QUERY;
}

const ToolGrid: TOC<ToolGridSignature> = <template>
	<div class="dt-grid" ...attributes>
		{{#each @tools as |tool|}}
			{{#if tool.external}}
				<a
					href={{tool.href}}
					class="dt-cell"
					target="_blank"
					rel="noopener noreferrer"
				>
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
					class="dt-cell
						{{if
							tool.highlight
							'is-highlight'
						}}"
				>
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
	</div>
</template>;

export default ToolGrid;
