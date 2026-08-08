import { pageTitle } from 'ember-page-title';
import { LinkTo } from '@ember/routing';
import Icon from 'delphitools-v2/components/icon';

<template>
  {{pageTitle "Page Not Found"}}

  <div class="dt-404">
    <span class="dt-404-mark">
      <Icon @name="frown" />
    </span>
    <h1>Page Not Found</h1>
    <p>The page you&apos;re looking for doesn&apos;t exist or has been moved.</p>
    <LinkTo @route="index" class="dt-btn">
      <Icon @name="home" />
      Back to Home
    </LinkTo>
  </div>
</template>
