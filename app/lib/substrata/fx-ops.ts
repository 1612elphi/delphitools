import { getSnapshot, update, updateTransient } from './doc-store';
import { newId } from './doc-model';
import { getEffectDef } from './effects';
import { getFilterDef } from './filters';
import { findLayer, mapLayerInTree } from './layer-tree';
import { defaultParams } from './param-spec';
import type { Layer, SubstrataDoc } from './doc-model';
import type { FxDefinition, PresetsParam } from './param-spec';

export type FxStack = 'filters' | 'effects';

export interface FxItem {
	id: string;
	type: string;
	enabled: boolean;
	params: Record<string, number | string>;
}

export function getFxDef(
	stack: FxStack,
	type: string,
): FxDefinition | undefined {
	return stack === 'effects' ? getEffectDef(type) : getFilterDef(type);
}

export function fxDisplayLabel(stack: FxStack, fx: FxItem): string {
	const def = getFxDef(stack, fx.type);
	const presetSpec = def?.params.find(
		(p): p is PresetsParam => p.kind === 'presets',
	);
	const preset = presetSpec
		? presetSpec.options.find(
				(o) => o.value === fx.params[presetSpec.key],
			)
		: undefined;
	return preset?.label ?? def?.label ?? fx.type;
}

function stackOf(layer: Layer, stack: FxStack): FxItem[] {
	return stack === 'effects' ? layer.effects : layer.filters;
}

function mapStack(
	layers: Layer[],
	layerId: string,
	stack: FxStack,
	fn: (list: FxItem[]) => FxItem[],
): Layer[] {
	return mapLayerInTree(layers, layerId, (l) =>
		stack === 'effects'
			? { ...l, effects: fn(l.effects) }
			: { ...l, filters: fn(l.filters) },
	);
}

function mapItem(
	list: FxItem[],
	fxId: string,
	fn: (fx: FxItem) => FxItem,
): FxItem[] {
	return list.map((fx) => (fx.id === fxId ? fn(fx) : fx));
}

export function addFx(
	layerId: string,
	stack: FxStack,
	type: string,
	params?: Record<string, number | string>,
): string | null {
	const doc = getSnapshot();
	const layer = doc ? findLayer(doc.layers, layerId) : null;
	if (!layer) return null;
	const existing = stackOf(layer, stack).find((fx) => fx.type === type);
	if (existing) return existing.id;
	const def = getFxDef(stack, type);
	if (!def) return null;
	const fx: FxItem = {
		id: newId(),
		type,
		enabled: true,
		params: { ...defaultParams(def.params), ...params },
	};
	update((d) => ({
		...d,
		// film-sim follows adjustments
		layers: mapStack(d.layers, layerId, stack, (list) =>
			type === 'film-sim' ? [...list, fx] : [fx, ...list],
		),
		updatedAt: Date.now(),
	}));
	return fx.id;
}

export function removeFx(layerId: string, stack: FxStack, fxId: string): void {
	update((doc) => ({
		...doc,
		layers: mapStack(doc.layers, layerId, stack, (list) =>
			list.filter((fx) => fx.id !== fxId),
		),
		updatedAt: Date.now(),
	}));
}

export function toggleFx(layerId: string, stack: FxStack, fxId: string): void {
	update((doc) => ({
		...doc,
		layers: mapStack(doc.layers, layerId, stack, (list) =>
			mapItem(list, fxId, (fx) => ({
				...fx,
				enabled: !fx.enabled,
			})),
		),
		updatedAt: Date.now(),
	}));
}

export function resetFx(layerId: string, stack: FxStack, fxId: string): void {
	const doc = getSnapshot();
	const layer = doc ? findLayer(doc.layers, layerId) : null;
	const fx = layer && stackOf(layer, stack).find((f) => f.id === fxId);
	const def = fx && getFxDef(stack, fx.type);
	if (!def) return;
	update((d) => ({
		...d,
		layers: mapStack(d.layers, layerId, stack, (list) =>
			mapItem(list, fxId, (f) => ({
				...f,
				params: defaultParams(def.params),
			})),
		),
		updatedAt: Date.now(),
	}));
}

export function setFxParam(
	layerId: string,
	stack: FxStack,
	fxId: string,
	key: string,
	value: number | string,
	opts?: { transient?: boolean },
): void {
	const apply = (doc: SubstrataDoc): SubstrataDoc => ({
		...doc,
		layers: mapStack(doc.layers, layerId, stack, (list) =>
			mapItem(list, fxId, (fx) => ({
				...fx,
				params: { ...fx.params, [key]: value },
			})),
		),
		updatedAt: Date.now(),
	});
	if (opts?.transient) updateTransient(apply);
	else update(apply);
}

export function setFxParams(
	layerId: string,
	stack: FxStack,
	fxId: string,
	patch: Record<string, number | string>,
): void {
	update((doc) => ({
		...doc,
		layers: mapStack(doc.layers, layerId, stack, (list) =>
			mapItem(list, fxId, (fx) => ({
				...fx,
				params: { ...fx.params, ...patch },
			})),
		),
		updatedAt: Date.now(),
	}));
}

export function setFxOrder(
	layerId: string,
	stack: FxStack,
	orderedIds: string[],
): void {
	update((doc) => {
		let changed = false;
		const layers = mapStack(doc.layers, layerId, stack, (list) => {
			const byId = new Map(list.map((fx) => [fx.id, fx]));
			const next = orderedIds
				.map((id) => byId.get(id))
				.filter((fx): fx is FxItem => fx !== undefined);
			const listed = new Set(orderedIds);
			const rest = list.filter((fx) => !listed.has(fx.id));
			if (next.length + rest.length !== list.length)
				return list;
			changed = true;
			return [...next, ...rest];
		});
		return changed
			? { ...doc, layers, updatedAt: Date.now() }
			: doc;
	});
}
