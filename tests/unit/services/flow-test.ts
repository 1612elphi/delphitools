import { module, test } from 'qunit';
import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { waitUntil } from '@ember/test-helpers';
import { destroy } from '@ember/destroyable';
import { setupTest } from 'delphitools-v2/tests/helpers';
import { clearFlowFiles } from 'delphitools-v2/lib/flow-store';
import { flowHooks } from 'delphitools-v2/lib/flow-hooks';
import { getWorkflowById } from 'delphitools-v2/lib/workflows';
import type FlowService from 'delphitools-v2/services/flow';

interface Ctx {
	owner: {
		lookup(name: string): unknown;
		unregister(name: string): void;
		register(name: string, factory: unknown): void;
	};
}

const transitions: unknown[][] = [];

class RouterStub extends Service {
	@tracked currentRoute: { params: Record<string, string> } | null = null;

	transitionTo(...args: unknown[]) {
		transitions.push(args);
		const id = args[1];
		if (typeof id === 'string')
			this.currentRoute = { params: { tool_id: id } };
		return Promise.resolve();
	}

	on() {}

	off() {}
}

const png = (name = 'shot.png') => new File(['x'], name, { type: 'image/png' });

const onPage = (flow: FlowService, id: string) => {
	(
		flow.router as unknown as { currentRoute: object | null }
	).currentRoute = { params: { tool_id: id } };
};

module('Unit | Service | flow', function (hooks) {
	setupTest(hooks);

	hooks.beforeEach(async function () {
		transitions.length = 0;
		sessionStorage.removeItem('flow');
		await clearFlowFiles();
		const { owner } = this as unknown as Ctx;
		owner.unregister('service:router');
		owner.register('service:router', RouterStub);
	});

	hooks.afterEach(async function () {
		sessionStorage.removeItem('flow');
		flowHooks.current = null;
		await clearFlowFiles();
	});

	const lookup = (ctx: unknown) =>
		(ctx as Ctx).owner.lookup('service:flow') as FlowService;

	test('start records the flow, clears the bag and opens the first tool', async function (assert) {
		const flow = lookup(this);
		assert.false(flow.active);
		assert.strictEqual(
			flowHooks.current,
			flow,
			'registers the hooks',
		);

		await flow.start(getWorkflowById('paste-and-strip')!);
		assert.true(flow.active);
		assert.strictEqual(flow.step, 0);
		assert.deepEqual(JSON.parse(sessionStorage.getItem('flow')!), {
			workflow: 'paste-and-strip',
			step: 0,
			run: flow.runId,
		});
		assert.true(flow.runId.length > 0, 'a run id for the rows');
		assert.deepEqual(transitions, [
			['tools.tool', 'paste-image', { queryParams: {} }],
		]);
	});

	test('a capture advances the flow; the last step finishes', async function (assert) {
		const flow = lookup(this);
		await flow.start(getWorkflowById('paste-and-strip')!);
		assert.false(flow.canAdvance, 'nothing captured yet');
		assert.true(flow.capturing);

		onPage(flow, 'word-counter');
		assert.false(
			flow.capturing,
			'another tool page saves for real',
		);
		onPage(flow, 'paste-image');

		flow.capture(png());
		assert.strictEqual(
			flow.captured.length,
			1,
			'in memory at once',
		);
		await waitUntil(() => flow.step === 1);
		assert.deepEqual(transitions.at(-1), [
			'tools.tool',
			'metadata-stripper',
			{ queryParams: {} },
		]);
		assert.true(flow.capturing, 'the last step captures too');
		assert.false(
			flow.finished,
			'nothing captured on the last step yet',
		);
		assert.false(flow.canAdvance, 'no step after the last');

		onPage(flow, 'word-counter');
		assert.deepEqual(
			await flow.pending('image/*'),
			[],
			'a detour to another tool receives nothing',
		);
		onPage(flow, 'metadata-stripper');
		assert.deepEqual(
			(await flow.pending('image/*')).map((f) => f.name),
			['shot.png'],
		);
		assert.deepEqual(
			await flow.pending('image/*'),
			[],
			'delivered once per visit',
		);

		await flow.goTo(0);
		assert.deepEqual(
			await flow.pending('image/*'),
			[],
			'a step never gets its own output back',
		);
		await flow.goTo(1);
		assert.strictEqual(
			(await flow.pending('image/*')).length,
			1,
			'revisiting a step delivers again',
		);

		flow.capture(png('final.png'));
		await waitUntil(() => flow.finished);
		assert.strictEqual(flow.step, 1, 'the last step stays put');
	});

	test('a colour step advances on the pushed colour and carries it', async function (assert) {
		const flow = lookup(this);
		await flow.start(getWorkflowById('colour-to-gradient')!);
		assert.false(flow.canAdvance);
		flow.colour = '#ff0000';
		assert.true(flow.canAdvance);
		await flow.advance();
		assert.deepEqual(transitions.at(-1), [
			'tools.tool',
			'gradient-genny',
			{ queryParams: { color: 'ff0000' } },
		]);
	});

	test('a fresh tab sweeps runs no live tab answers for; a record restores its own', async function (assert) {
		const flow = lookup(this);
		await flow.start(getWorkflowById('paste-and-strip')!);
		const run = flow.runId;
		flow.capture(png());
		await waitUntil(() => flow.step === 1);
		await waitUntil(() => flow.files[0]!.id > 0, {
			timeoutMessage: 'the IndexedDB write lands',
		});

		const { owner } = this as unknown as Ctx;
		const relaunch = (record: object | null) => {
			destroy(flowHooks.current!);
			owner.unregister('service:flow');
			if (record)
				sessionStorage.setItem(
					'flow',
					JSON.stringify(record),
				);
			else sessionStorage.removeItem('flow');
			return owner.lookup('service:flow') as FlowService;
		};

		const restored = relaunch({
			workflow: 'paste-and-strip',
			step: 1,
			run,
		});
		onPage(restored, 'metadata-stripper');
		assert.strictEqual(restored.step, 1);
		assert.deepEqual(
			(await restored.pending('image/*')).map((f) => f.name),
			['shot.png'],
			'the bag comes back from IndexedDB',
		);

		const other = relaunch({
			workflow: 'paste-and-strip',
			step: 1,
			run: 'another-tab',
		});
		onPage(other, 'metadata-stripper');
		assert.deepEqual(
			await other.pending('image/*'),
			[],
			"another run never sees this run's rows",
		);

		const fresh = relaunch(null);
		assert.false(fresh.active);
		await waitUntil(
			() => localStorage.getItem('flow-bag') === null,
			{
				timeoutMessage: 'the orphaned run is swept',
			},
		);
		const after = relaunch({
			workflow: 'paste-and-strip',
			step: 1,
			run,
		});
		onPage(after, 'metadata-stripper');
		assert.deepEqual(
			await after.pending('image/*'),
			[],
			'the orphaned bag was cleared',
		);
	});

	test('exit clears everything', async function (assert) {
		const flow = lookup(this);
		await flow.start(getWorkflowById('paste-and-strip')!);
		flow.capture(png());
		await waitUntil(() => flow.step === 1);
		await flow.exit();
		assert.false(flow.active);
		assert.strictEqual(sessionStorage.getItem('flow'), null);
		assert.strictEqual(localStorage.getItem('flow-bag'), null);
		assert.deepEqual(await flow.pending('image/*'), []);
	});
});
