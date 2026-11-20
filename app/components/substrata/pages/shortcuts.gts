import type { TOC } from '@ember/component/template-only';
import CanonHeading from 'delphicanon/components/canon-heading';
import { EDITOR_TOOLS } from 'delphitools-v2/components/substrata/editor/tools';

interface Row {
	keys: string;
	action: string;
}

const title = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

const TOOL_ROWS: Row[] = EDITOR_TOOLS.flatMap((tool) =>
	Object.entries(tool.keys).map(([key, [, sub]]) => ({
		keys: key.toUpperCase(),
		action: title(sub),
	})),
);

const GROUPS: { title: string; rows: Row[] }[] = [
	{ title: 'Tools', rows: TOOL_ROWS },
	{
		title: 'Edit',
		rows: [
			{ keys: '⌘Z', action: 'Undo' },
			{ keys: '⇧⌘Z / Ctrl+Y', action: 'Redo' },
			{ keys: '⌘A', action: 'Select all' },
			{ keys: '⌘D', action: 'Duplicate' },
			{ keys: '⌘G', action: 'Group' },
			{ keys: '⇧⌘G', action: 'Ungroup' },
			{ keys: '⌘]', action: 'Bring Forward' },
			{ keys: '⌘[', action: 'Send Backward' },
			{ keys: '⇧⌘]', action: 'Bring to Front' },
			{ keys: '⇧⌘[', action: 'Send to Back' },
			{ keys: '⌫', action: 'Delete selection' },
			{ keys: '← ↑ → ↓', action: 'Nudge selection (⇧ ×10)' },
			{ keys: '⏎', action: 'Extract pixel selection' },
			{ keys: 'Esc', action: 'Deselect / leave crop' },
		],
	},
	{
		title: 'Scene',
		rows: [
			{ keys: '⌘S', action: 'Save' },
			{ keys: '⇧⌘S', action: 'Save a copy' },
			{ keys: '⌘O', action: 'Open' },
			{ keys: '⌘I', action: 'Import image' },
			{ keys: '⌘E', action: 'Export' },
		],
	},
	{
		title: 'View',
		rows: [
			{ keys: '⌘0', action: 'Zoom to Fit' },
			{ keys: '⌘1', action: 'Zoom to 100%' },
			{ keys: 'Space + drag', action: 'Pan' },
			{ keys: 'Scroll', action: 'Pan' },
			{ keys: '⌘ Scroll / pinch', action: 'Zoom' },
			{
				keys: 'Two fingers (touch)',
				action: 'Pan + pinch zoom',
			},
		],
	},
];

const Shortcuts: TOC<object> = <template>
	{{#each GROUPS key="title" as |group|}}
		<CanonHeading @text={{group.title}} />
		{{#each group.rows key="@index" as |row|}}
			<div class="sub-pg-key-row">
				<span>{{row.action}}</span>
				<kbd>{{row.keys}}</kbd>
			</div>
		{{/each}}
	{{/each}}
</template>;

export default Shortcuts;
