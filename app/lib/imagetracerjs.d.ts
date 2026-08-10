// imagetracerjs 1.2.6 ships no types and its `main` is a UMD script that
// assigns `module.exports = new ImageTracer()`. Only the two members this app
// touches are declared; the library's canvas/DOM helpers are unused here.
declare module 'imagetracerjs' {
	const ImageTracer: {
		imagedataToSVG(
			imgd: ImageData,
			options: Record<string, unknown>,
		): string;
		optionpresets: Record<string, Record<string, unknown>>;
	};
	export default ImageTracer;
}
