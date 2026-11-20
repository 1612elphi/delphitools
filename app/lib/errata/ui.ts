import { channel, type Channel } from 'delphitools-v2/lib/channel';
import type { PageCrop, Stamped } from './doc-model';
import { activeTool, type ToolId } from './tool';

export interface PageRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface CanvasActions {
	deleteSelection(): void;
	/** client coordinates of a page, for rigs */
	pageRect(index: number): PageRect | null;
	/** outline boxes in displayed page space, for rigs; empty clears */
	debugBoxes(index: number, boxes: DebugBox[]): void;
	/** filled outlines in displayed page space, scrolled into view; empty clears */
	highlight(index: number, boxes: Box[]): void;
	/** client coordinates of an object */
	objectRect(id: string): PageRect | null;
	selectObject(id: string): void;
	/** non-interactive stand-ins for objects a mode would add; empty clears */
	preview(items: Stamped[]): void;
}

export interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface DebugBox extends Box {
	colour: string;
}

let actions: CanvasActions | null = null;

export function registerCanvasActions(next: CanvasActions | null): void {
	actions = next;
}

export function deleteSelection(): void {
	actions?.deleteSelection();
}

export function pageRect(index: number): PageRect | null {
	return actions?.pageRect(index) ?? null;
}

export function debugBoxes(index: number, boxes: DebugBox[]): void {
	actions?.debugBoxes(index, boxes);
}

export function objectRect(id: string): PageRect | null {
	return actions?.objectRect(id) ?? null;
}

export function selectObject(id: string): void {
	actions?.selectObject(id);
}

export function preview(items: Stamped[]): void {
	actions?.preview(items);
}

const dismissers: (() => void)[] = [];

/** escape: newest first */
export function pushDismiss(dismiss: () => void): () => void {
	dismissers.push(dismiss);
	return () => {
		const i = dismissers.lastIndexOf(dismiss);
		if (i !== -1) dismissers.splice(i, 1);
	};
}

/** false when empty */
export function dismissTop(): boolean {
	const dismiss = dismissers.pop();
	dismiss?.();
	return dismiss !== undefined;
}

const FLASH_MS = 4000;
let clearFlash: (() => void) | null = null;

/** a temporary highlight, gone on the next click, Escape or timeout */
export function flashHighlight(index: number, boxes: Box[]): void {
	clearFlash?.();
	if (!actions || boxes.length === 0) return;
	actions.highlight(index, boxes);
	const off = () => {
		clearFlash = null;
		clearTimeout(timer);
		window.removeEventListener('pointerdown', off, true);
		undismiss();
		actions?.highlight(index, []);
	};
	const timer = setTimeout(off, FLASH_MS);
	window.addEventListener('pointerdown', off, true);
	const undismiss = pushDismiss(off);
	clearFlash = off;
}

export type ModalId = 'signature';

export const modal = channel<ModalId | null>(null);

export const toolbox = channel(false);

export interface HostFrame {
	scroller: HTMLElement;
	content: HTMLElement;
	pages: () => HTMLElement[];
	zoom: (factor: number) => void;
	fit: () => void;
	/** leaves the marks and puts the caret at a client point */
	edit: (x: number, y: number) => void;
}

/** the view whose pages the canvas follows, marks drawn over it */
export const hostFrame = channel<HostFrame | null>(null);

let imagePicker: (() => void) | null = null;

/** the shell owns the hidden file input; tools ask for it here */
export function registerImagePicker(open: (() => void) | null): void {
	imagePicker = open;
}

export function pickImageFile(): void {
	imagePicker?.();
}

/** the comment whose popover is open */
export const openNote = channel<string | null>(null);

/** ids of the objects selected on the canvas */
export const selection = channel<readonly string[]>(
	[],
	(a, b) => a.join() === b.join(),
);

export interface CropDraft {
	pageId: string;
	/** displayed page space */
	rect: PageCrop;
}

/** crop rect awaiting apply */
export const cropDraft = channel<CropDraft | null>(null);

export type BoxMode =
	| 'crop'
	| 'page-numbers'
	| 'watermark'
	| 'stamp'
	| 'compress'
	| 'impose'
	| 'form'
	| 'organise'
	| 'preflight'
	| 'comment'
	| 'redact'
	| 'page-size'
	| 'rotate'
	| 'insert'
	| 'as-pdf';

export interface ModeHooks {
	enter?: () => void;
	exit?: () => void;
	/** true when handled */
	key?: (event: KeyboardEvent) => boolean;
}

const hooks = new Map<BoxMode, ModeHooks>();

export function onMode(id: BoxMode, modeHooks: ModeHooks): () => void {
	hooks.set(id, modeHooks);
	return () => {
		if (hooks.get(id) === modeHooks) hooks.delete(id);
	};
}

const MODE_TOOL: Partial<Record<BoxMode, ToolId>> = {
	crop: 'crop',
	form: 'field',
	redact: 'redact',
	comment: 'comment',
};

const mode = channel<BoxMode | null>(null);

/** written by setMode */
export const boxMode: Pick<Channel<BoxMode | null>, 'get' | 'subscribe'> = mode;

/** all exits run hooks */
export function setMode(next: BoxMode | null): void {
	const prev = mode.get();
	if (next === prev) return;
	if (prev) hooks.get(prev)?.exit?.();
	actions?.preview([]);
	activeTool.set((next && MODE_TOOL[next]) ?? 'select');
	mode.set(next);
	if (next) hooks.get(next)?.enter?.();
}

export const closeMode = (): void => setMode(null);

export function modeKey(event: KeyboardEvent): boolean {
	const current = mode.get();
	return !!current && !!hooks.get(current)?.key?.(event);
}

onMode('crop', { exit: () => cropDraft.set(null) });
