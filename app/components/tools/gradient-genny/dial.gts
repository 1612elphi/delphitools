import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import { snapAngle, wrapAngle } from './paint';

interface Signature {
	Args: {
		value: number;
		label: string;
		onChange: (degrees: number) => void;
	};
	Element: HTMLDivElement;
}

const ticks = Array.from({ length: 8 }, (_, tick) => {
	const radians = (tick * Math.PI) / 4;
	const inner = tick % 2 === 0 ? 15 : 17;
	const at = (r: number) =>
		`${(22 + r * Math.sin(radians)).toFixed(2)} ${(22 - r * Math.cos(radians)).toFixed(2)}`;
	return `M${at(inner)}L${at(20)}`;
}).join('');

export default class AngleDial extends Component<Signature> {
	get needleStyle() {
		return htmlSafe(`rotate: ${this.args.value}deg`);
	}

	point = modifier((element: HTMLElement) => {
		let held = false;
		const aim = (event: PointerEvent) => {
			const rect = element.getBoundingClientRect();
			const dx = event.clientX - rect.left - rect.width / 2;
			const dy = event.clientY - rect.top - rect.height / 2;
			if (Math.hypot(dx, dy) <= 4) return;
			const { degrees } = snapAngle(
				(Math.atan2(dx, -dy) * 180) / Math.PI,
			);
			if (degrees !== this.args.value)
				this.args.onChange(degrees);
		};
		const down = (event: PointerEvent) => {
			if (event.button !== 0) return;
			held = true;
			element.setPointerCapture(event.pointerId);
			aim(event);
		};
		const move = (event: PointerEvent) => {
			if (held) aim(event);
		};
		const up = () => (held = false);
		element.addEventListener('pointerdown', down);
		element.addEventListener('pointermove', move);
		element.addEventListener('pointerup', up);
		element.addEventListener('pointercancel', up);
		return () => {
			element.removeEventListener('pointerdown', down);
			element.removeEventListener('pointermove', move);
			element.removeEventListener('pointerup', up);
			element.removeEventListener('pointercancel', up);
		};
	});

	key = (event: KeyboardEvent) => {
		const step = event.shiftKey ? 45 : 15;
		const { value } = this.args;
		const next = {
			ArrowLeft: value - step,
			ArrowDown: value - step,
			ArrowRight: value + step,
			ArrowUp: value + step,
			Home: 0,
		}[event.key];
		if (next === undefined) return;
		event.preventDefault();
		this.args.onChange(wrapAngle(next));
	};

	<template>
		<div class="gg-dial" {{this.point}} ...attributes>
			<svg viewBox="0 0 44 44" aria-hidden="true">
				<circle
					class="gg-dial-face"
					cx="22"
					cy="22"
					r="21"
				/>
				<path class="gg-dial-face" d={{ticks}} />
				<g
					class="gg-dial-needle"
					style={{this.needleStyle}}
				>
					<circle cx="22" cy="22" r="3" />
					<path d="M22 22V5" />
				</g>
			</svg>
			<div
				class="gg-dial-control"
				role="slider"
				tabindex="0"
				aria-label={{@label}}
				aria-valuemin="0"
				aria-valuemax="359"
				aria-valuenow={{@value}}
				aria-valuetext="{{@value}}°"
				{{on "keydown" this.key}}
			></div>
		</div>
	</template>
}
