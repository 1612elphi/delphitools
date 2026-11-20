import { tracked } from '@glimmer/tracking';
import { loadLayout, saveLayout } from './layout-storage';

// colour: phone tray only
export type EditorPanel = 'layers' | 'inspector' | 'fx' | 'colour';
export type EditorEdge = 'top' | 'bottom' | 'leading' | 'trailing';
export type TrayStop = 'short' | 'tall' | 'full';

export const PANELS: readonly EditorPanel[] = ['layers', 'inspector', 'fx'];
const EDGES: readonly EditorEdge[] = ['top', 'bottom', 'leading', 'trailing'];

// ios colourpickerpresenter.redirect
export interface RingTarget {
	hex: string;
	alpha: number;
	send: (hex: string, alpha: number, final: boolean) => void;
}

const SETTINGS_EDGE_KEY = 'canonSettingsEdge';
const TOOLS_HIDDEN_KEY = 'canonToolsHidden';
const LAYERS_PINNED_KEY = 'canonLayersPinned';

class EditorUi {
	@tracked panels: EditorPanel[] = [];
	@tracked settingsEdge: EditorEdge = 'bottom';
	@tracked toolsHidden = false;
	@tracked layersPinned = true;
	@tracked ringOpen = false;
	@tracked bloomOpen = false;
	@tracked pageOpen = false;
	@tracked galleryOpen = false;
	@tracked galleryMode: 'projects' | 'templates' = 'projects';
	@tracked newOpen = false;
	@tracked assetsOpen = false;
	@tracked developOpen = false;
	@tracked helpOpen = false;
	@tracked exportOpen = false;
	@tracked trayStop: TrayStop = 'short';
	@tracked ringTarget: RingTarget | null = null;

	openRingFor = (target: RingTarget): void => {
		this.ringTarget = target;
		this.ringOpen = true;
	};

	closeRing = (): void => {
		this.ringOpen = false;
		this.ringTarget = null;
	};

	hydrate(): void {
		const edge = loadLayout<unknown>(SETTINGS_EDGE_KEY, null);
		if (EDGES.includes(edge as EditorEdge))
			this.settingsEdge = edge as EditorEdge;
		this.toolsHidden =
			loadLayout<unknown>(TOOLS_HIDDEN_KEY, false) === true;
		// ios default: pinned
		this.layersPinned =
			loadLayout<unknown>(LAYERS_PINNED_KEY, true) !== false;
	}

	isOpen = (panel: EditorPanel): boolean => this.panels.includes(panel);

	// phone tray shows one
	toggle = (panel: EditorPanel, phone = false): void => {
		if (this.isOpen(panel)) {
			this.panels = this.panels.filter((p) => p !== panel);
			return;
		}
		this.trayStop = 'short';
		if (phone) this.assetsOpen = false;
		this.panels = phone
			? [panel]
			: PANELS.filter((p) => p === panel || this.isOpen(p));
	};

	openGallery = (mode: 'projects' | 'templates'): void => {
		this.newOpen = false;
		this.pageOpen = false;
		this.galleryMode = mode;
		this.galleryOpen = true;
	};

	toggleAssets = (phone = false): void => {
		this.assetsOpen = !this.assetsOpen;
		if (phone && this.assetsOpen) this.panels = [];
	};

	toggleNew = (): void => {
		this.pageOpen = false;
		this.galleryOpen = false;
		this.newOpen = !this.newOpen;
	};

	close = (panel: EditorPanel): void => {
		this.panels = this.panels.filter((p) => p !== panel);
	};

	setSettingsEdge = (edge: EditorEdge): void => {
		this.settingsEdge = edge;
		saveLayout(SETTINGS_EDGE_KEY, edge);
	};

	toggleTools = (): void => {
		this.toolsHidden = !this.toolsHidden;
		saveLayout(TOOLS_HIDDEN_KEY, this.toolsHidden);
	};

	toggleLayersPin = (): void => {
		this.layersPinned = !this.layersPinned;
		saveLayout(LAYERS_PINNED_KEY, this.layersPinned);
	};
}

export const editorUi = new EditorUi();
