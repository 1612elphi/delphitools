// Sticker port regression: per-tool sticker renders when art exists and
// disappears entirely when it does not; wall renders all five stickers.

import { BASE, check, finish, launch, sleep, visit } from "./harness.mjs";

const { browser, page } = await launch();

// Tool that definitely has lousy art.
await visit(page, "/tools/qr-genny");
await page.evaluate(() => {
	const el = document.querySelector(".dt-tool-sticker");
	if (el) el.scrollIntoView({ block: "center" });
});
// The img lazy-loads once scrolled into view; wait for a real decode, then
// let the tracked `loaded` flag re-render (drops `.is-hidden`).
await page.waitForFunction(
	() => {
		const img = document.querySelector(".dt-tool-sticker .dt-sticker-img");
		return img && img.naturalWidth > 0;
	},
	{ timeout: 10000 },
);
await sleep(300);
const hasQrBtn = await page.evaluate(
	() => !!document.querySelector(".dt-tool-sticker .dt-sticker-btn"),
);
const qrVisible = await page.evaluate(
	() =>
		!document.querySelector(
			".dt-tool-sticker .dt-sticker-lift.is-hidden",
		),
);
check("qr-genny per-tool sticker renders and loads", hasQrBtn && qrVisible);

// Audio & Video tool added after the v1 port: no lousy art, so the whole
// sticker block must remove itself after the image 404s.
await visit(page, "/tools/audio-atlas");
await page.evaluate(() => {
	const el = document.querySelector(".dt-tool-sticker");
	if (el) el.scrollIntoView({ block: "center" });
});
await sleep(600);
const atlas = await page.evaluate(() => {
	const box = document.querySelector(".dt-tool-sticker");
	return {
		noBtn: !document.querySelector(
			".dt-tool-sticker .dt-sticker-btn",
		),
		noCaption: !document.querySelector(
			".dt-tool-sticker .dt-sticker-caption",
		),
		collapsed: box
			? getComputedStyle(box).display === "none"
			: true,
	};
});
check(
	"audio-atlas per-tool sticker degrades to nothing",
	atlas.noBtn && atlas.noCaption,
);
check("audio-atlas sticker block collapses", atlas.collapsed);

// Verify a second AV tool as required by the prompt.
await visit(page, "/tools/subtitle-converter");
await page.evaluate(() => {
	const el = document.querySelector(".dt-tool-sticker");
	if (el) el.scrollIntoView({ block: "center" });
});
await sleep(600);
const noSubBtn = await page.evaluate(
	() => !document.querySelector(".dt-tool-sticker .dt-sticker-btn"),
);
check("subtitle-converter per-tool sticker degrades to nothing", noSubBtn);

// Home-page sticker bin.
await visit(page, "/");
await page.evaluate(() => {
	const el = document.querySelector(".dt-sticker-wall");
	if (el) el.scrollIntoView({ block: "center" });
});
await sleep(600);
const wall = await page.evaluate(() => {
	const bin = document.querySelector(".dt-sticker-bin");
	return {
		present: !!document.querySelector(".dt-sticker-wall"),
		buttons: bin ? bin.querySelectorAll(".dt-sticker-btn").length : 0,
	};
});
check("home-page sticker wall present", wall.present);
check("sticker bin has five stickers", wall.buttons === 5, wall.buttons);

await finish(browser);
