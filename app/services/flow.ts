import Service, { service } from '@ember/service';
import { cached, tracked } from '@glimmer/tracking';
import type Owner from '@ember/owner';
import type RouterService from '@ember/routing/router-service';
import { modifier } from 'ember-modifier';
import { colourToQuery } from 'delphitools-v2/lib/colour-query';
import { saveBlob } from 'delphitools-v2/lib/download';
import { flowHooks, reducedMotion } from 'delphitools-v2/lib/flow-hooks';
import {
	addFlowFile,
	allFlowFiles,
	clearFlowFiles,
	hasBag,
	hasFlowStore,
	sweepFlowFiles,
	type FlowFile,
} from 'delphitools-v2/lib/flow-store';
import type { Tool } from 'delphitools-v2/lib/tools';
import {
	getWorkflowById,
	pendingFor,
	workflowTools,
	type Workflow,
} from 'delphitools-v2/lib/workflows';

const KEY = 'flow';
const CHANNEL = 'flow';
const ROLL_CALL_MS = 300;

interface FlowRecord {
	workflow: string;
	step: number;
	run: string;
}

type Direction = 'forward' | 'back';

const SLIDE_PX = 48;
const OUT_MS = 140;
const IN_MS = 200;

// avoid view transition snapshots
async function slide(
	main: HTMLElement,
	direction: Direction,
	swap: () => Promise<void>,
): Promise<void> {
	const away = direction === 'forward' ? -SLIDE_PX : SLIDE_PX;
	const out = main.animate(
		[
			{ translate: '0 0', opacity: 1 },
			{ translate: `${away}px 0`, opacity: 0 },
		],
		{ duration: OUT_MS, easing: 'ease-in', fill: 'forwards' },
	);
	await out.finished.catch(() => undefined);
	await swap();
	// wait for ember render
	await new Promise((resolve) => setTimeout(resolve, 0));
	main.animate(
		[
			{ translate: `${-away}px 0`, opacity: 0 },
			{ translate: '0 0', opacity: 1 },
		],
		{ duration: IN_MS, easing: 'ease-out' },
	);
	out.cancel();
}

function readRecord(): FlowRecord | null {
	try {
		const raw = sessionStorage.getItem(KEY);
		const record = raw ? (JSON.parse(raw) as FlowRecord) : null;
		return record?.run ? record : null;
	} catch {
		return null;
	}
}

function writeRecord(record: FlowRecord | null): void {
	try {
		if (record) sessionStorage.setItem(KEY, JSON.stringify(record));
		else sessionStorage.removeItem(KEY);
	} catch {
		// retain in-memory flow
	}
}

const isAborted = (error: unknown) =>
	(error as { name?: string } | null)?.name === 'TransitionAborted';

export default class FlowService extends Service {
	@service declare router: RouterService;

	@tracked workflow: Workflow | null = null;
	@tracked step = 0;
	@tracked files: FlowFile[] = [];
	@tracked colour: string | null = null;
	@tracked landing = false;
	runId = '';

	captureListener: ((origin: DOMRect | null) => Promise<void>) | null =
		null;

	#delivered = new Set<number>();
	#ready: Promise<void> = Promise.resolve();
	#lastClick: DOMRect | null = null;
	#main: HTMLElement | null = null;
	#provisional = 0;
	#channel: BroadcastChannel | null = null;

	constructor(owner: Owner) {
		super(owner);
		if (typeof sessionStorage === 'undefined' || !hasFlowStore())
			return;
		flowHooks.current = this;
		const record = readRecord();
		const workflow = record
			? getWorkflowById(record.workflow)
			: undefined;
		if (!record || !workflow) {
			writeRecord(null);
			void this.#sweep();
			return;
		}
		this.workflow = workflow;
		this.step = record.step;
		this.runId = record.run;
		this.#listen(true);
		this.#ready = allFlowFiles(record.run).then((files) => {
			this.files = files;
		});
	}

	willDestroy() {
		super.willDestroy();
		this.#listen(false);
		this.#channel?.close();
		this.#channel = null;
		if (flowHooks.current === this) flowHooks.current = null;
	}

	main = modifier((element: HTMLElement) => {
		this.#main = element;
		return () => {
			this.#main = null;
		};
	});

	#listen(on: boolean) {
		if (typeof document === 'undefined') return;
		const channel = this.#openChannel();
		if (on) {
			document.addEventListener(
				'click',
				this.#rememberClick,
				true,
			);
			this.router.on('routeDidChange', this.#syncStep);
			channel?.addEventListener('message', this.#answer);
		} else {
			document.removeEventListener(
				'click',
				this.#rememberClick,
				true,
			);
			this.router.off('routeDidChange', this.#syncStep);
			channel?.removeEventListener('message', this.#answer);
		}
	}

	#openChannel(): BroadcastChannel | null {
		if (typeof BroadcastChannel === 'undefined') return null;
		this.#channel ??= new BroadcastChannel(CHANNEL);
		return this.#channel;
	}

	#answer = (event: MessageEvent<{ type?: string }>) => {
		if (event.data?.type === 'roll-call' && this.runId)
			this.#channel?.postMessage({
				type: 'alive',
				run: this.runId,
			});
	};

	async #sweep() {
		if (!hasBag()) return;
		const alive = new Set<string>();
		const channel = this.#openChannel();
		if (channel) {
			const collect = (
				event: MessageEvent<{
					type?: string;
					run?: string;
				}>,
			) => {
				if (
					event.data?.type === 'alive' &&
					event.data.run
				)
					alive.add(event.data.run);
			};
			channel.addEventListener('message', collect);
			channel.postMessage({ type: 'roll-call' });
			await new Promise((resolve) =>
				setTimeout(resolve, ROLL_CALL_MS),
			);
			channel.removeEventListener('message', collect);
		}
		await sweepFlowFiles(alive);
	}

	#rememberClick = (event: Event) => {
		const control = (event.target as Element | null)?.closest?.(
			'button, a, [role="button"]',
		);
		this.#lastClick = control?.getBoundingClientRect() ?? null;
	};

	// retain workflow on detours
	#syncStep = () => {
		const workflow = this.workflow;
		const id = this.router.currentRoute?.params?.['tool_id'];
		if (!workflow || typeof id !== 'string') return;
		if (id === this.tools[this.step]?.id) return;
		const index = workflow.steps.indexOf(id);
		if (index < 0) return;
		this.step = index;
		this.#delivered.clear();
		this.#record();
	};

	#record() {
		if (!this.workflow) return;
		writeRecord({
			workflow: this.workflow.id,
			step: this.step,
			run: this.runId,
		});
	}

	get active() {
		return this.workflow !== null;
	}

	@cached
	get tools(): Tool[] {
		return this.workflow ? workflowTools(this.workflow) : [];
	}

	get nextTool(): Tool | undefined {
		return this.tools[this.step + 1];
	}

	get isLast() {
		return this.step >= this.tools.length - 1;
	}

	get captured(): FlowFile[] {
		return this.files.filter((item) => item.step === this.step);
	}

	get canAdvance() {
		const next = this.nextTool;
		if (!next) return false;
		return next.carryColour
			? this.colour !== null
			: this.captured.length > 0;
	}

	get finished() {
		return this.isLast && this.captured.length > 0;
	}

	get finale() {
		return this.finished && !this.landing;
	}

	get onStepPage() {
		return (
			this.router.currentRoute?.params?.['tool_id'] ===
			this.tools[this.step]?.id
		);
	}

	get capturing() {
		return this.workflow !== null && this.onStepPage;
	}

	async start(workflow: Workflow) {
		if (this.runId) await clearFlowFiles(this.runId);
		this.workflow = workflow;
		this.files = [];
		this.colour = null;
		this.runId = crypto.randomUUID();
		this.#listen(true);
		await this.#go(0);
	}

	goTo = (step: number) => {
		if (step < 0 || step >= this.tools.length)
			return Promise.resolve();
		return this.#go(step, step > this.step ? 'forward' : 'back');
	};

	advance = () => {
		if (!this.canAdvance) return Promise.resolve();
		return this.#go(this.step + 1, 'forward');
	};

	finish = () => {
		const last = this.captured.at(-1);
		if (!this.finished || !last) return;
		saveBlob(last.file, last.file.name);
		void this.exit();
	};

	exit = async () => {
		this.#listen(false);
		const run = this.runId;
		this.workflow = null;
		this.files = [];
		this.colour = null;
		this.runId = '';
		this.#delivered.clear();
		writeRecord(null);
		if (run) await clearFlowFiles(run);
	};

	#go(step: number, direction?: Direction): Promise<void> {
		const target = this.tools[step];
		if (!this.workflow || !target) return Promise.resolve();
		const queryParams =
			target.carryColour && this.colour
				? { color: colourToQuery(this.colour) }
				: {};
		// commit step during swap
		const swap = async () => {
			this.step = step;
			this.#delivered.clear();
			this.#record();
			await this.router
				.transitionTo('tools.tool', target.id, {
					queryParams,
				})
				.catch((error: unknown) => {
					if (!isAborted(error)) throw error;
				});
		};
		const main = this.#main;
		if (!direction || !main || reducedMotion()) return swap();
		return slide(main, direction, swap);
	}

	capture(file: File) {
		const origin = this.#lastClick;
		this.#lastClick = null;
		const step = this.step;
		// preserve capture before persistence
		const item: FlowFile = { id: -++this.#provisional, step, file };
		this.files = [...this.files, item];
		void addFlowFile(this.runId, step, file)
			.then(({ id }) => {
				if (this.#delivered.delete(item.id))
					this.#delivered.add(id);
				item.id = id;
			})
			.catch(() => undefined);
		void (async () => {
			try {
				await this.captureListener?.(origin);
				if (this.workflow && !this.isLast)
					await this.advance();
			} catch {
				// errors intentionally ignored
			}
		})();
	}

	// one delivery per visit
	async pending(accept?: string): Promise<File[]> {
		await this.#ready;
		if (!this.workflow || !this.onStepPage) return [];
		const earlier = this.files.filter(
			(item) =>
				item.step < this.step &&
				!this.#delivered.has(item.id),
		);
		const picked = pendingFor(earlier, accept);
		for (const item of picked) this.#delivered.add(item.id);
		return picked.map((item) => item.file);
	}
}

declare module '@ember/service' {
	interface Registry {
		flow: FlowService;
	}
}
