import { matchesAccept } from 'delphitools-v2/modifiers/file-paste';
import { getCategoryByToolId, getToolById, type Tool } from './tools';

/**
 * A predefined chain of tools. The flow service carries each step's output
 * (captured in lib/download.ts) to the next step's intake (delivered by the
 * filePaste modifier), so the tools themselves never know they are in a chain.
 */
export interface Workflow {
	id: string;
	name: string;
	steps: string[];
}

export const WORKFLOWS: Workflow[] = [
	{
		id: 'audio-to-subtitles',
		name: 'Audio to subtitles',
		steps: ['audio-extractor', 'audio-trimmer', 'auto-subtitle'],
	},
	{
		id: 'trim-caption-burn',
		name: 'Trim, caption, burn',
		steps: ['video-trimmer', 'auto-subtitle', 'subtitle-studio'],
	},
	{
		id: 'paste-and-strip',
		name: 'Paste and strip',
		steps: ['paste-image', 'metadata-stripper'],
	},
	{
		id: 'trim-and-mute',
		name: 'Trim and mute',
		steps: ['video-trimmer', 'video-muter'],
	},
	{
		id: 'extract-and-normalise',
		name: 'Extract and normalise',
		steps: ['audio-extractor', 'audio-normaliser'],
	},
	{
		id: 'colour-to-gradient',
		name: 'Colour to gradient',
		steps: ['colour-converter', 'gradient-genny'],
	},
];

export function getWorkflowById(id: string): Workflow | undefined {
	return WORKFLOWS.find((workflow) => workflow.id === id);
}

/** The registry entries for the steps; an unknown id is dropped (the unit test rejects it). */
export function workflowTools(workflow: Workflow): Tool[] {
	return workflow.steps.flatMap((id) => getToolById(id) ?? []);
}

/** the registry category of the first step, the workflow's home */
export function workflowCategory(workflow: Workflow): string {
	return getCategoryByToolId(workflow.steps[0] ?? '')?.name ?? '';
}

/** how many step columns the table shows; a chain never needs more */
export const SLOTS = 4;

/**
 * Which files from the bag a step takes: for each pattern in its accept list,
 * the newest file matching it, each file once, in bag order. A single-input
 * tool gets one file; Subtitle Studio (`video/*,.srt,.vtt`) gets the trimmed
 * video and the SRT. No accept list takes the newest file of any kind.
 */
export function pendingFor<T extends { file: File }>(
	bag: T[],
	accept?: string,
): T[] {
	const patterns = accept ? accept.split(',') : [''];
	const picked = new Set<T>();
	for (const pattern of patterns) {
		const match = bag.findLast(
			(item) => !pattern || matchesAccept(item.file, pattern),
		);
		if (match) picked.add(match);
	}
	return bag.filter((item) => picked.has(item));
}
