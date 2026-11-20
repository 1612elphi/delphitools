import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import type RouterService from '@ember/routing/router-service';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import { IconSvg } from 'delphitools-v2/components/icon';
import type MagazineService from 'delphitools-v2/services/magazine';
import type ThemeService from 'delphitools-v2/services/theme';
import { MAGAZINE_PAGES, PAGE_HEIGHT, PAGE_WIDTH, pageIndex } from './pages';
import type { MagazineEngine } from './engine';
import type { LinkRect } from './rasterise';
import './overlay.css';

const COUNT = MAGAZINE_PAGES.length;

let webgl: boolean | undefined;

function webglAvailable() {
	if (webgl !== undefined) return webgl;
	try {
		const probe = document.createElement('canvas');
		webgl = !!(
			probe.getContext('webgl2') ?? probe.getContext('webgl')
		);
	} catch {
		webgl = false;
	}
	return webgl;
}

const reducedMotion = () =>
	window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default class MagazineOverlay extends Component {
	@service declare magazine: MagazineService;
	@service declare router: RouterService;
	@service declare theme: ThemeService;

	@tracked engineFailed = false;
	@tracked flatPage = 0;
	@tracked announcement = '';

	get flat() {
		return this.engineFailed || !webglAvailable();
	}

	#engine?: MagazineEngine;
	#links = new Map<number, LinkRect[]>();
	#focused?: { page: number; rect: LinkRect };
	#ring?: HTMLElement;

	setup = modifier((dialog: HTMLDialogElement) => {
		dialog.showModal();
		dialog.querySelector('canvas')?.focus();
		this.ready = false;
		let disposed = false;
		const start = pageIndex(this.magazine.startPage);
		if (!webglAvailable()) this.showFlatPage(start);
		else void this.#load(dialog, start, () => disposed);
		return () => {
			disposed = true;
			this.#engine?.dispose();
			this.#engine = undefined;
			this.#links.clear();
			this.#exposeDebug(undefined);
			dialog.close();
			this.magazine.restoreFocus();
		};
	});

	async #load(
		dialog: HTMLDialogElement,
		start: number,
		gone: () => boolean,
	) {
		const [{ createEngine }, raster] = await Promise.all([
			import('./engine'),
			import('./rasterise'),
		]);
		const canvas = dialog.querySelector('canvas');
		if (gone() || !canvas) return;
		try {
			this.#engine = createEngine({
				canvas,
				pageCount: COUNT,
				aspect: PAGE_WIDTH / PAGE_HEIGHT,
				startPage: 0,
				reducedMotion: reducedMotion(),
				dark: this.theme.dark,
				hooks: {
					hitLink: this.hitLink,
					follow: this.follow,
					changed: this.announce,
					rendered: this.placeRing,
				},
			});
		} catch {
			this.engineFailed = true;
			this.showFlatPage(start);
			requestAnimationFrame(() =>
				dialog
					.querySelector<HTMLElement>(
						'button:not(:disabled)',
					)
					?.focus(),
			);
			return;
		}
		const engine = this.#engine;
		this.#exposeDebug(engine);
		await document.fonts.ready;
		const pages = [
			...dialog.querySelectorAll<HTMLElement>('.dt-mag-page'),
		];
		const scale = raster.textureScale(
			PAGE_HEIGHT,
			canvas.clientHeight * 0.9,
		);
		for (const [index, page] of pages.entries()) {
			this.#links.set(index, raster.linkRects(page));
			const texture = await raster.rasterise(page, scale);
			if (gone()) return;
			engine.setTexture(index, texture);
			if (
				start > 0 &&
				index === Math.min(start + 1, COUNT - 1)
			)
				engine.goTo(start);
		}
		this.ready = true;
	}

	ready = false;

	#exposeDebug(engine: MagazineEngine | undefined) {
		if (!import.meta.env.DEV) return;
		(window as unknown as { __magazine?: unknown }).__magazine =
			engine && {
				engine,
				overlay: this,
				links: this.#links,
				pageIds: MAGAZINE_PAGES.map((page) => page.id),
			};
	}

	hitLink = (page: number, u: number, v: number) =>
		this.#links
			.get(page)
			?.find(
				(link) =>
					u >= link.u0 &&
					u <= link.u1 &&
					v >= link.v0 &&
					v <= link.v1,
			)?.href;

	follow = (href: string) => {
		if (href.startsWith('#')) {
			const page = pageIndex(href.slice(1));
			if (this.flat) this.showFlatPage(page);
			else this.#engine?.goTo(page);
		} else if (href.startsWith('/')) {
			this.magazine.close();
			void this.router.transitionTo(href);
		} else window.open(href, '_blank', 'noopener,noreferrer');
	};

	announce = (pages: number[]) => {
		const numbers = pages.map((page) => page + 1).join('–');
		const names = pages
			.map((page) => MAGAZINE_PAGES[page]?.name)
			.join(', ');
		this.announcement = `${numbers} / ${COUNT} · ${names}`;
	};

	showFlatPage = (page: number) => {
		const shown = Math.min(COUNT - 1, Math.max(0, page));
		this.flatPage = shown;
		this.announce([shown]);
	};

	previous = () => this.showFlatPage(this.flatPage - 1);
	next = () => this.showFlatPage(this.flatPage + 1);

	isOffPage = (index: number) => this.flat && index !== this.flatPage;

	get atStart() {
		return this.flatPage === 0;
	}

	get atEnd() {
		return this.flatPage === COUNT - 1;
	}

	cancel = (event: Event) => {
		event.preventDefault();
		this.magazine.close();
	};

	keydown = (event: KeyboardEvent) => {
		const engine = this.#engine;
		const turn: Record<string, () => void> = engine
			? {
					ArrowRight: engine.next,
					PageDown: engine.next,
					ArrowLeft: engine.prev,
					PageUp: engine.prev,
					Home: engine.first,
					End: engine.last,
				}
			: {
					ArrowRight: this.next,
					PageDown: this.next,
					ArrowLeft: this.previous,
					PageUp: this.previous,
					Home: () => this.showFlatPage(0),
					End: () => this.showFlatPage(COUNT - 1),
				};
		if (
			event.key === 'Enter' &&
			engine &&
			event.target instanceof HTMLCanvasElement
		) {
			event.preventDefault();
			engine.next();
			return;
		}
		const action = turn[event.key];
		if (!action || event.altKey || event.metaKey || event.ctrlKey)
			return;
		event.preventDefault();
		action();
	};

	click = (event: MouseEvent) => {
		const target = event.target as Element;
		const link = target.closest('[data-magazine-link]');
		if (link) {
			const href = link.getAttribute('href') ?? '';
			if (!/^https?:/.test(href)) {
				event.preventDefault();
				this.follow(href);
			}
			return;
		}
		if (target === event.currentTarget) this.magazine.close();
	};

	focusIn = (event: FocusEvent) => {
		const link = (event.target as Element).closest(
			'[data-magazine-link]',
		);
		const page = link?.closest<HTMLElement>('.dt-mag-page');
		if (!link || !page || this.flat) return;
		const index = Number(page.dataset['page']);
		const position = [
			...page.querySelectorAll('[data-magazine-link]'),
		].indexOf(link);
		const rect = this.#links.get(index)?.[position];
		this.#focused = rect && { page: index, rect };
		this.#engine?.goTo(index);
	};

	focusOut = () => {
		this.#focused = undefined;
		this.placeRing();
	};

	ring = modifier((element: HTMLElement) => {
		this.#ring = element;
		return () => (this.#ring = undefined);
	});

	placeRing = () => {
		const ring = this.#ring;
		const engine = this.#engine;
		const focused = this.#focused;
		if (!ring) return;
		const show =
			engine &&
			focused &&
			engine.settled &&
			engine.pages.includes(focused.page);
		ring.hidden = !show;
		if (!show) return;
		const { u0, v0, u1, v1 } = focused.rect;
		const box = engine.screenRect(focused.page, u0, v0, u1, v1);
		Object.assign(ring.style, {
			left: `${box.left - 4}px`,
			top: `${box.top - 4}px`,
			width: `${box.width + 8}px`,
			height: `${box.height + 8}px`,
		});
	};

	fit = modifier((element: HTMLElement) => {
		const observer = new ResizeObserver(([entry]) => {
			const { width = 0, height = 0 } =
				entry?.contentRect ?? {};
			element.style.setProperty(
				'--dt-mag-fit',
				String(
					Math.min(
						1,
						width / PAGE_WIDTH,
						height / PAGE_HEIGHT,
					),
				),
			);
		});
		observer.observe(element);
		return () => observer.disconnect();
	});

	<template>
		{{#if this.magazine.isOpen}}
			{{! template-lint-disable no-invalid-interactive }}
			<dialog
				class="dt-mag {{if this.flat 'is-flat'}}"
				aria-label="DELPHI MAGAZINE"
				{{this.setup}}
				{{on "cancel" this.cancel}}
				{{on "keydown" this.keydown}}
				{{on "click" this.click}}
				{{on "focusin" this.focusIn}}
				{{on "focusout" this.focusOut}}
			>
				{{#unless this.flat}}
					<canvas
						class="dt-mag-canvas"
						role="img"
						aria-label="DELPHI MAGAZINE"
						tabindex="0"
					></canvas>
					<div
						class="dt-mag-ring"
						hidden
						{{this.ring}}
					></div>
				{{/unless}}
				<div
					class="dt-mag-pages
						{{if
							this.flat
							'is-flat'
							'is-hidden'
						}}"
					{{this.fit}}
				>
					{{#each MAGAZINE_PAGES as |page index|}}
						<section
							class="dt-mag-page"
							data-page={{index}}
							aria-label={{page.name}}
							hidden={{this.isOffPage
								index
							}}
						>
							<page.component
								@page={{page}}
								@pages={{MAGAZINE_PAGES}}
							/>
						</section>
					{{/each}}
				</div>
				{{#if this.flat}}
					<nav class="dt-mag-flat-nav">
						<CanonButton
							@text="Previous"
							@icon={{component
								IconSvg
								name="chevron-left"
							}}
							@disabled={{this.atStart}}
							@onClick={{this.previous}}
						/>
						<CanonButton
							@text="Next"
							@icon={{component
								IconSvg
								name="chevron-right"
							}}
							@disabled={{this.atEnd}}
							@onClick={{this.next}}
						/>
					</nav>
				{{/if}}
				<CanonButton
					class="dt-mag-close"
					@kind="cell"
					@label="Close"
					@icon={{component IconSvg name="x"}}
					@onClick={{this.magazine.close}}
				/>
				<p class="dt-sr-only" aria-live="polite">
					{{this.announcement}}
				</p>
			</dialog>
		{{/if}}
	</template>
}
