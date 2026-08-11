import Omnibox from 'delphitools-v2/components/omnibox';
import HeroCopy from 'delphitools-v2/components/hero-copy';

// Body copy below is carried over verbatim from the Next home page; none of it
// is new wording. The sticker wall, the TAXIWAY split-flap and Friends of Delphi
// depend on GSAP/motion and are Phase 1.
<template>
	<div class="dt-page">
		{{! Doodle layout, all owned by the omnibox: centred hero art
			(random per load, shuffleable, credited under the box), the
			box, this tagline, the catalogue. }}
		<Omnibox>
			<HeroCopy />
		</Omnibox>
	</div>
</template>
