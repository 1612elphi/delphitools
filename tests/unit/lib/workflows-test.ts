import { module, test } from 'qunit';
import { getToolById } from 'delphitools-v2/lib/tools';
import {
	WORKFLOWS,
	pendingFor,
	workflowTools,
} from 'delphitools-v2/lib/workflows';

const item = (name: string, type: string) => ({
	file: new File(['x'], name, { type }),
});

module('Unit | lib | workflows', function () {
	test('every step names a registry tool that can take a hand-off', function (assert) {
		for (const workflow of WORKFLOWS) {
			assert.strictEqual(
				workflowTools(workflow).length,
				workflow.steps.length,
				`${workflow.id}: every step resolves`,
			);
			for (const id of workflow.steps.slice(1)) {
				const tool = getToolById(id)!;
				const takesHandoff =
					Boolean(tool.accepts?.length) ||
					tool.carryColour === true;
				assert.true(
					takesHandoff,
					`${workflow.id}: ${id} accepts files or a colour`,
				);
			}
		}
		assert.strictEqual(
			new Set(WORKFLOWS.map((w) => w.id)).size,
			WORKFLOWS.length,
			'ids are unique',
		);
	});

	test('pendingFor takes the newest match per accept pattern, once', function (assert) {
		const a = item('a.png', 'image/png');
		const b = item('b.png', 'image/png');
		const v = item('cut.webm', 'video/webm');
		const s = item('cues.srt', '');
		const bag = [a, v, b, s];

		assert.deepEqual(
			pendingFor(bag, 'image/*'),
			[b],
			'newest image',
		);
		assert.deepEqual(
			pendingFor(bag, 'video/*,.srt,.vtt'),
			[v, s],
			'one per pattern, bag order',
		);
		assert.deepEqual(
			pendingFor(bag, 'image/*,image/png'),
			[b],
			'two patterns hitting one file deliver it once',
		);
		assert.deepEqual(
			pendingFor(bag, '.pdf'),
			[],
			'nothing matches',
		);
		assert.deepEqual(
			pendingFor(bag),
			[s],
			'no accept list: newest file',
		);
		assert.deepEqual(pendingFor([], 'image/*'), [], 'empty bag');
	});
});
