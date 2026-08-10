import Route from '@ember/routing/route';
import { getToolById, getCategoryByToolId } from 'delphitools-v2/lib/tools';
import { loadToolComponent } from 'delphitools-v2/components/tools/registry';
import type { Tool, ToolCategory } from 'delphitools-v2/lib/tools';
import type { ComponentLike } from '@glint/template';

export interface ToolModel {
	tool: Tool;
	category: ToolCategory | undefined;
	component: ComponentLike<object> | undefined;
}

export default class ToolRoute extends Route<ToolModel> {
	async model(params: { tool_id: string }): Promise<ToolModel> {
		const tool = getToolById(params.tool_id);
		// matches notFound() in the Next app's tools/[toolId]/page.tsx
		if (!tool) throw new Error(`Unknown tool: ${params.tool_id}`);
		return {
			tool,
			category: getCategoryByToolId(params.tool_id),
			component: await loadToolComponent(params.tool_id),
		};
	}
}
