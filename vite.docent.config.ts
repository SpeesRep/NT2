import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// The teacher page /docent/ (spec phase 5): a separate small app, never linked from the student app and never
// precached by its service worker. Its own CSP allows only this site plus the Apps Script API (POST to
// script.google.com, answered by a redirect to script.googleusercontent.com). Built after the student app:
//   --mode prod → dist/docent/ (base /NT2/docent/)   --mode dev → dist/dev/docent/ (base /NT2/dev/docent/)
export default defineConfig(({ mode }) => {
  const isProd = mode === 'prod';
  const deploy = JSON.parse(readFileSync(resolve(import.meta.dirname, 'deploy.config.json'), 'utf8'));
  const api = `https://script.google.com/macros/s/${deploy[isProd ? 'prod' : 'dev'].deploymentId}/exec`;
  const base = isProd ? '/NT2/docent/' : '/NT2/dev/docent/';
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src https://script.google.com https://script.googleusercontent.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-src 'none'"
  ].join('; ');
  return {
    root: resolve(import.meta.dirname, 'docent'),
    base,
    publicDir: false,
    plugins: [
      preact(),
      {
        name: 'docent-html',
        transformIndexHtml: (html: string) =>
          html
            .replace('%TITLE%', isProd ? 'SpeesRep – docent' : 'SpeesRep – docent (DEV)')
            .replace('<!-- %CSP% -->', `<meta http-equiv="Content-Security-Policy" content="${csp}" />`)
      }
    ],
    define: {
      __DOCENT_API__: JSON.stringify(api),
      __DOCENT_ENV__: JSON.stringify(isProd ? 'PROD' : 'DEV'),
      __DOCENT_APP__: JSON.stringify(isProd ? '/NT2/' : '/NT2/dev/')
    },
    build: { outDir: process.env.DOCENT_OUT_DIR ? resolve(process.env.DOCENT_OUT_DIR) : resolve(import.meta.dirname, isProd ? "dist/docent" : "dist/dev/docent"), emptyOutDir: true }
  };
});
