import Omnibox from 'delphitools-v2/components/omnibox';
import HeroCopy from 'delphitools-v2/components/hero-copy';
import { StickerWall } from 'delphitools-v2/components/sticker-wall';

// Body copy below is carried over verbatim from the Next home page; none of it
// is new wording. The TAXIWAY split-flap and Friends of Delphi still depend on
// GSAP/motion and are Phase 1; the sticker wall is ported without that
// dependency (CSS keyframe peel).
<template>
	<div class="dt-page">
		{{! Doodle layout, all owned by the omnibox: centred hero art
			(random per load, shuffleable, credited under the box), the
			box, this tagline, the catalogue. }}
		<Omnibox>
			<HeroCopy />
		</Omnibox>

		<StickerWall />
	</div>
</template>
