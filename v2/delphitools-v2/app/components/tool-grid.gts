import { LinkTo } from '@ember/routing';
import type { TOC } from '@ember/component/template-only';
import Icon from 'delphitools-v2/components/icon';
import type { Tool } from 'delphitools-v2/lib/tools';

export interface ToolGridSignature {
  Element: HTMLDivElement;
  Args: { tools: Tool[] };
}

// `external` entries (App Store, GitHub) have no /tools/:id route, so they
// render as plain anchors. See the field's note in app/lib/tools.ts.
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
          <Icon @name={{tool.icon}} class="dt-cell-icon" />
          <span class="dt-cell-name">{{tool.name}}</span>
          <span class="dt-cell-desc">{{tool.description}}</span>
        </a>
      {{else}}
        <LinkTo @route="tools.tool" @model={{tool.id}} class="dt-cell">
          <Icon @name={{tool.icon}} class="dt-cell-icon" />
          <span class="dt-cell-name">{{tool.name}}</span>
          <span class="dt-cell-desc">{{tool.description}}</span>
        </LinkTo>
      {{/if}}
    {{/each}}
  </div>
</template>;

export default ToolGrid;
