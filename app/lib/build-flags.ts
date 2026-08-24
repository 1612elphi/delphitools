import pkg from '../../package.json';

declare const __DT_COMMIT_SHA__: string;
declare const __DT_PRIDE__: boolean;

export const COMMIT_SHA = __DT_COMMIT_SHA__;
export const PRIDE = __DT_PRIDE__;

export const VERSION: string = pkg.version;
