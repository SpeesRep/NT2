// Build-time configuration (see vite.config.ts). The learner token is public by design.
export const API_URL = __API_URL__;
export const LEARNER_TOKEN = __LEARNER_TOKEN__;
export const APP_ENV = __APP_ENV__;
export const BUILD_ID = __BUILD_ID__;
/** Namespace for IndexedDB / localStorage: DEV and PROD share the github.io origin. */
/** The app's visible name (also used for IndexedDB `NS`, URLs /NT2/ and the Workbox cacheId in lower case). */
export const APP_NAME = 'SpeesRep';
export const NS = APP_ENV === 'PROD' ? 'speesrep-prod' : 'speesrep-dev';
