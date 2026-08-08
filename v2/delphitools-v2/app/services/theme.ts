import Service from '@ember/service';
import type Owner from '@ember/owner';
import { tracked } from '@glimmer/tracking';

/**
 * Light/dark toggle. The `.dark` class is already on <html> before this loads —
 * the no-flash script in index.html puts it there — so this reads the existing
 * state rather than deciding it.
 */
export default class ThemeService extends Service {
  @tracked dark = false;

  constructor(owner: Owner) {
    super(owner);
    if (typeof document === 'undefined') return;
    this.dark = document.documentElement.classList.contains('dark');
  }

  toggle = () => {
    this.dark = !this.dark;
    document.documentElement.classList.toggle('dark', this.dark);
    localStorage.setItem('theme', this.dark ? 'dark' : 'light');
  };
}

declare module '@ember/service' {
  interface Registry {
    theme: ThemeService;
  }
}
