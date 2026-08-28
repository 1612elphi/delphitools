import type { ComponentLike } from '@glint/template';

// vite expands the glob into one literal import()
// per file, so each tool is its own chunk
const TOOL_LOADERS = import.meta.glob<{ default: ComponentLike<object> }>(
	'./*.gts',
);

export async function loadToolComponent(
	id: string,
): Promise<ComponentLike<object> | undefined> {
	const loader = TOOL_LOADERS[`./${id}.gts`];
	if (!loader) return undefined;
	return (await loader()).default;
}
