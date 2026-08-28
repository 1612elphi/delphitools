import { BASE, check, finish, launch, sleep, visit } from "./harness.mjs";

const { browser, page } = await launch();

await visit(page, "/tools/qr-genny");
await page.evaluate(() => {
	const el = document.querySelector(".dt-tool-sticker");
	if (el) el.scrollIntoView({ block: "center" });
});
// lazy load: wait decode then loaded flag drops is-hidden
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

// no lousy art: image 404 removes whole sticker block
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
