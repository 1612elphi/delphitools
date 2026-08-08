import { pageTitle } from 'ember-page-title';
import AppSidebar from 'delphitools-v2/components/app-sidebar';
import AppHeader from 'delphitools-v2/components/app-header';

<template>
  {{pageTitle "delphitools"}}

  <a href="#main-content" class="dt-skip">Skip to main content</a>

  <div class="dt-shell">
    <AppSidebar />
    <div class="dt-inset">
      <AppHeader />
      <main id="main-content" tabindex="-1" class="dt-main">
        {{outlet}}
      </main>
    </div>
  </div>
</template>
