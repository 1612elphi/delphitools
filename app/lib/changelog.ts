/**
 * The changelog the "what's new?" popup renders. One entry per release,
 * newest first; the version picker in the popup's title lists them. An
 * entry written as "Name: text" whose Name is a catalogue tool renders
 * with a badge and a link to that tool (the match is on the exact tool
 * name, case-insensitive). Every string in here is user-facing copy: Ruby
 * writes all of it. An empty array renders an empty tab.
 */

export interface Release {
	/** the version the entry describes */
	version: string;
	/** the baseline the changes are counted from ("changes since ...") */
	since: string;
	features: string[];
	fixes: string[];
	technical: string[];
}

export const RELEASES: Release[] = [
	{
		version: '2.0.0',
		since: '1.0',
		// One plain string per bullet, one bullet per line of the popup;
		// no markdown, no trailing period convention enforced. Sample
		// shape only (non-final wording, keep this block commented):
		//
		//   features: [
		//   	'Workflows: chain tools into a sequence and carry your file between steps.',
		//   	'Auto Subtitle: speech-to-text subtitles generated entirely in your browser.',
		//   ],
		//   fixes: [
		//   	'QR Generator: exported SVGs no longer show hairline seams between modules.',
		//   ],
		//   technical: [
		//   	'The stack moved from Next.js to Ember 7 with Crayon CSS, built by Vite.',
		//   ],
		features: [
			'Rebuilt from the ground up: delphitools is now rebuilt from scratch with Ember 7 and Crayon CSS as the new foundation. Every tool was rebuilt for the new stack!',
			'The Omnibox: The front page now has one box that answers your queries as you type! Drop a file on it to see what tools accept it, paste a colour code and it gives you conversions right there, decipher text, try conversions and more!',
			"Workflows: Connect your favourite tools into a sequence that carries files between it! No more downloading and uploading when you're switching tools. Track your progress in the new flow bar!",
			'Semantic Versioning and the Changelog: No more commit hashes! Real version numbers for real people. And a swanky changelog, which you are reading right now!',
			'Audio Atlas: Learn everything about an audio file, from loudness to codec and bitrate!',
			'Audio Extractor: Drop a video file and get a clean audio track from it, every time!',
			'Audio Normaliser: Pretend you know what LUFS means when you upload to social media!',
			'Audio Trimmer: Trim down any audio file In/Out style without getting out the editing workstation!',
			"Auto Subtitler: Speech to text, in the browser! Uses open-source transcription technologies and your computer's GPU to process on-device using Whisper.",
			'Braille Converter: Convert latin text to Braille clusters and back again!',
			'Colour Atlas: Learn everything about a colour, its tints, shades, harmonies and so on! Goes great with our other colour tools!',
			'Cron Builder: Stop memorising arcane incantations and start setting up your Cronjobs with a simple to use interface!',
			'Frame Extractor: Take out any frame from a video file or make yourself a photo lab style contact sheet!',
			'HTTP Status: Forgot what 404 means? We doubt it, so we added all the other codes to this handy reference just in case!',
			'Image Compressor: Squish and crunch your images so they fit in your carry on!',
			'Image De-skewer: Straighten any image! Goes great with our new Image to PDF tool!',
			'Image to PDF: This one is also a PDF to image tool! Will wonders ever cease?',
			'IPA Transcription: Transcribe your text to pronunciation aides, provided you speak my flavour of English!',
			'JSON Formatter: Look at JSON payloads, in style!',
			'JWT Decoder: Decode your Web Tokens and look at what makes them tick!',
			'Metadata Stripper: Remove that pesky XMP and EXIF data from your pictures! Does not remove AI watermarks, because that would be stupid!',
			'Morse Code: Impress family and friends with this most amazing novelty! Human speech encoded as dits and dahs!',
			'NATO Phonetic: Stop saying "M as in Mancy" when giving directions over the phone!',
			'Password Generator: Make safe passwords along with an entropy counter! Go for a high score!',
			'PDF Compressor: Compresses your PDFs to a fraction of their size, we hope!',
			'PDF Organiser: Impress your boss by rearranging pages in a confidential PDF with ease!',
			'PDF Page Numbers: All good documents have to be numbered, and watermarked! This tool lets you do both!',
			'PDF Rotate & Crop: Unlock the ancient secrets of rotating a PDF, and triumph over your boomer co workers!',
			'Request Builder: cURL needs not be frightening to you any longer, my friend!',
			'Screen Recorder: Abuses the video sharing feature we all relied on during the pandemic to record your, yes, your screen without any downloads!',
			'Subtitle Converter: We will never converge on a standard on this, thankfully the conversion is painless!',
			'Subtitle Studio: Apply your subtitles to your video files at full quality, right here!',
			'Timecode Calculator: SMTPE timecode will never go away, so better get used to it! This might help!',
			"UUID Generator: Take some home, it's no trouble! We have so many UUIDs!",
			'Video Altas: Learn everything there is to know about a video file you have! Frame rate, resolution, codec, is Jamie Lee Curtis in it? Spoiler, probably not!',
			'Video Muter: Mmmmph, mmmm, mmmmph!',
			'Video to GIF: This one is self explanatory!',
			'Voice Recorder: Record your voice, in the browser and in style!',
			'Waveform Generator: Make your audio files into visual representations!',
		],
		fixes: [
			'QR Generator: Exported files no longer show hairlines when exported as SVG.',
			'QR Generator: Exports now come with optional caption text.',
			'Tailwind Shade Generator: Ramps now hold their saturation instead of washing out. Thanks, Ash!',
			'Shavian Transliterator: All 125k words in the dictionary now load correctly.',
			'Colour tools: Now read their notation from one header instead of seperate pickers.',
			'Text Scratchpad: Now supports uploading files.',
			'Text Editor: Now supports uploading files.',
			'Loading states now use a custom made component.',
			'Substrata is now a lot more stable.',
			'Semantic versioning is now in effect. Welcome to version 2.0.0!',
			'Removed all evil alien clones trying to replace me, I hope!',
		],
		technical: [
			'The tech stack is now Ember + Glimmer, with Crayon CSS for styling, built in Vite.',
			'Transformers.js use has been expanded, now using RMBG 1.4 as well as Whisper for local inference, with a WASM fallback.',
			'646 unit tests run headlessly against every future change.',
		],
	},
];
