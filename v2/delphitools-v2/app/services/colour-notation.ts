import Service from '@ember/service';
import type Owner from '@ember/owner';
import { tracked } from '@glimmer/tracking';
import {
  formatColour,
  type ColourNotation,
} from 'delphitools-v2/lib/colour-notation';

const KEY = 'colour-notation';

/**
 * The site-wide colour notation preference, replacing the Next app's
 * ColourNotationContext. Every colour tool reads this so a value copied from one
 * matches the next.
 *
 * The Next version held it in memory only and reset on reload; persisting it is
 * the obvious behaviour for a preference and costs one localStorage read.
 */
export default class ColourNotationService extends Service {
  @tracked notation: ColourNotation = 'hex';

  constructor(owner: Owner) {
    super(owner);
    if (typeof localStorage === 'undefined') return;
    const stored = localStorage.getItem(KEY) as ColourNotation | null;
    if (stored) this.notation = stored;
  }

  setNotation = (notation: ColourNotation) => {
    this.notation = notation;
    localStorage.setItem(KEY, notation);
  };

  /** Format a hex string in the current notation. */
  format = (hex: string) => formatColour(hex, this.notation);
}

declare module '@ember/service' {
  interface Registry {
    'colour-notation': ColourNotationService;
  }
}
