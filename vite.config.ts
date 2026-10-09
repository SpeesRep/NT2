import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// Two builds from one codebase:
//   --mode prod → base /NT2/      → dist/
//   --mode dev  → base /NT2/dev/  → dist/dev/   (built second, emptyOutDir false)
// The app calls no API: it fetches content.json from its own origin (published by .github/workflows/content.yml).
// A Content-Security-Policy meta tag (production builds only; the dev server needs inline HMR scripts) limits
// every fetch to that origin.
/** No external origins: scripts, styles, pictures, the worker and every fetch (content.json) come from this site. */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'"
].join('; ');

export default defineConfig(({ mode, command }) => {
  const isProd = mode === 'prod';
  const ENV = isProd ? 'PROD' : 'DEV';
  const base = process.env.SPEESREP_BASE ?? (isProd ? '/NT2/' : '/NT2/dev/');
  const name = isProd ? 'SpeesRep' : 'SpeesRep DEV';
  const iconDir = isProd ? 'icons/prod' : 'icons/dev';

  return {
    base,
    plugins: [
      preact(),
      {
        name: 'speesrep-html',
        transformIndexHtml: (html: string) =>
          html
            .replaceAll('%APP_NAME%', name)
            .replaceAll('%ICON_DIR%', `${base}${iconDir}`)
            .replace('<!-- %CSP% -->', command === 'build' ? `<meta http-equiv="Content-Security-Policy" content="${CSP}" />` : '')
      },
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: [`${iconDir}/apple-touch-icon.png`, `${iconDir}/favicon.svg`],
        manifest: {
          id: base,
          name,
          short_name: name,
          description: 'Oefen Nederlands, ook zonder internet.',
          lang: 'nl',
          start_url: base,
          scope: base,
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#101418',
          theme_color: '#101418',
          icons: [
            { src: `${iconDir}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: `${iconDir}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
            // Android: content inside the inner ~78 % so circle/squircle masks never cut it (scripts/make-icons.mjs)
            { src: `${iconDir}/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
          ]
        },
        workbox: {
          cacheId: isProd ? 'speesrep-prod' : 'speesrep-dev',
          globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
          // PROD's worker (scope /NT2/) must never answer for the DEV app under /NT2/dev/.
          globIgnores: isProd ? ['dev/**', 'icons/dev/**', 'docent/**'] : ['icons/prod/**', 'docent/**'],
          navigateFallback: `${base}index.html`,
          // The teacher page (/docent/, vite.docent.config.ts) is a separate app: never answered with the student app.
          // Group install pages (/g/<code>/) carry their OWN manifest (start_url with the code): the worker must never
          // answer them with the app shell, or "Zet op beginscherm" would install the app without the code.
          navigateFallbackDenylist: isProd ? [/\/dev\//, /\/g\//, /\/docent\//] : [/\/g\//, /\/docent\//],
          // Fonts for non-Latin help languages: a runtime cache (src/fonts.ts can drop single files), never precached.
          runtimeCaching: [
            {
              // A RegExp, not a function: the function would be copied into sw.js without `base` (ReferenceError).
              urlPattern: new RegExp(`${base.replace(/\//g, '\\/')}fonts\\/`),
              handler: 'CacheFirst',
              options: { cacheName: `${isProd ? 'speesrep-prod' : 'speesrep-dev'}-fonts` }
            }
          ],
          cleanupOutdatedCaches: true
        }
      })
    ],
    define: {
      __APP_ENV__: JSON.stringify(ENV),
      __BUILD_ID__: JSON.stringify(process.env.SPEESREP_BUILD_ID ?? new Date().toISOString().slice(0, 16))
    },
    build: {
      outDir: process.env.SPEESREP_OUT_DIR ?? (isProd ? 'dist' : 'dist/dev'),
      emptyOutDir: isProd || !!process.env.SPEESREP_OUT_DIR,
      target: 'safari15'
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts']
    }
  };
});
