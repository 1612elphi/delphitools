import Route from '@ember/routing/route';
import { getToolById, getCategoryByToolId } from 'delphitools-v2/lib/tools';
import type { Tool, ToolCategory } from 'delphitools-v2/lib/tools';

export interface ToolModel {
  tool: Tool;
  category: ToolCategory | undefined;
}

export default class ToolRoute extends Route<ToolModel> {
  model(params: { tool_id: string }): ToolModel {
    const tool = getToolById(params.tool_id);
    // matches notFound() in the Next app's tools/[toolId]/page.tsx
    if (!tool) throw new Error(`Unknown tool: ${params.tool_id}`);
    return { tool, category: getCategoryByToolId(params.tool_id) };
  }
}
