import type { ComponentLike } from '@glint/template';

/**
 * Tool id to a loader for its component, mirroring the dynamic-import map in the
 * Next app's tools/[toolId]/page.tsx. The id is the file's own basename, so the
 * map is the directory listing: every `.gts` beside this file registers itself,
 * and an id with no file renders the placeholder.
 *
 * Vite expands the glob at build time into one literal `import()` per file, so
 * each tool is its own chunk. The route awaits the loader in its model hook, so
 * a tool's chunk is fetched during the transition and the template never sees a
 * pending component.
 */
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
