import pkg from '../../package.json';

// Substituted by Vite's `define` at build time; see vite.config.mjs.
declare const __DT_COMMIT_SHA__: string;
declare const __DT_PRIDE__: boolean;

export const COMMIT_SHA = __DT_COMMIT_SHA__;
export const PRIDE = __DT_PRIDE__;

/** Semver from package.json, the single version source (2026-08-23). */
export const VERSION: string = pkg.version;
