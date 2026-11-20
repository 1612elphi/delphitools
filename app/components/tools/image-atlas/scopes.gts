import type { TOC } from '@ember/component/template-only';
import { modifier } from 'ember-modifier';
import {
	peak,
	type Scan,
} from 'delphitools-v2/components/tools/image-atlas/report';

const channels = [
	'rgb(255 71 61 / 70%)',
	'rgb(77 235 92 / 70%)',
	'rgb(77 128 255 / 70%)',
];
const ink = 'rgb(255 255 255 / 28%)';
const labels = 'rgb(255 255 255 / 60%)';

function draw(canvas: HTMLCanvasElement, scan: Scan | null) {
	const scale = window.devicePixelRatio || 1;
	const { clientWidth: width, clientHeight: height } = canvas;
	canvas.width = Math.round(width * scale);
	canvas.height = Math.round(height * scale);
	const context = canvas.getContext('2d');
	if (!context) return;
	context.scale(scale, scale);
	const plot = { x: 12, y: 12, width: width - 24, height: height - 36 };
	if (plot.width < 20 || plot.height < 20) return;
	const font =
		getComputedStyle(canvas).getPropertyValue('--canon-mono-font');
	context.font = `500 9px ${font || 'monospace'}`;
	context.textBaseline = 'top';
	context.lineWidth = 1;
	context.strokeStyle = ink;
	context.fillStyle = labels;
	const bottom = plot.y + plot.height;
	for (let quarter = 0; quarter <= 4; quarter++) {
		const x = Math.round(plot.x + (plot.width * quarter) / 4) + 0.5;
		context.beginPath();
		context.moveTo(x, plot.y);
		context.lineTo(x, bottom);
		context.stroke();
		context.textAlign =
			quarter === 0
				? 'left'
				: quarter === 4
					? 'right'
					: 'center';
		context.fillText(
			String(Math.min(255, quarter * 64)),
			x,
			bottom + 3,
		);
	}
	context.beginPath();
	context.moveTo(plot.x, bottom + 0.5);
	context.lineTo(plot.x + plot.width, bottom + 0.5);
	context.stroke();

	const bins = scan?.histogram;
	const top = bins ? peak(bins) : 0;
	if (!bins || top === 0) return;
	context.save();
	context.beginPath();
	context.rect(plot.x, plot.y, plot.width, plot.height);
	context.clip();
	context.globalCompositeOperation = 'screen';
	bins.forEach((counts, channel) => {
		context.beginPath();
		context.moveTo(plot.x, bottom);
		counts.forEach((count, bin) => {
			context.lineTo(
				plot.x + (bin / 255) * plot.width,
				bottom - Math.min(1, count / top) * plot.height,
			);
		});
		context.lineTo(plot.x + plot.width, bottom);
		context.closePath();
		context.fillStyle = channels[channel]!;
		context.fill();
	});
	context.restore();
}

const paint = modifier((canvas: HTMLCanvasElement, [scan]: [Scan | null]) => {
	const redraw = () => draw(canvas, scan);
	const observer = new ResizeObserver(redraw);
	observer.observe(canvas);
	return () => observer.disconnect();
});

const Scopes: TOC<{ Args: { scan: Scan | null } }> = <template>
	<canvas
		class="ia-scopes"
		role="img"
		aria-label="Histogram"
		{{paint @scan}}
	></canvas>
</template>;

export default Scopes;
