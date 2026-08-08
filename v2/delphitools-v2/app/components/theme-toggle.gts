import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import Icon from 'delphitools-v2/components/icon';
import type ThemeService from 'delphitools-v2/services/theme';

export default class ThemeToggle extends Component {
  @service declare theme: ThemeService;

  <template>
    <button
      type="button"
      class="dt-icon-btn"
      aria-label="Toggle theme"
      {{on "click" this.theme.toggle}}
    >
      {{#if this.theme.dark}}
        <Icon @name="sun" />
      {{else}}
        <Icon @name="moon" />
      {{/if}}
    </button>
  </template>
}
