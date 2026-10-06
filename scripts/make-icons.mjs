#!/usr/bin/env node
// Renders the PWA icons (PROD + DEV variants) from an inline SVG with ImageMagick.
// Output: public/icons/{prod,dev}/{favicon.svg,apple-touch-icon.png,icon-192.png,icon-512.png,icon-maskable-512.png}
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

function svg({ dev, maskable }) {
  // Maskable icons keep content inside the central 80% safe zone.
  const k = maskable ? 0.78 : 1;
  const off = (1024 - 1024 * k) / 2;
  const bandY = dev ? 800 : 1024;
  // Maskable (Android): the DEV marker must sit inside the safe circle (80 %), so it is a badge, not a band.
  const badge = `<rect x="382" y="700" width="260" height="120" rx="28" fill="#f5c518"/>
       <text x="512" y="788" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="86" text-anchor="middle" fill="#101418">DEV</text>`;
  const band = dev && maskable
    ? badge
    : dev
    ? `<rect x="0" y="${off + bandY * k}" width="1024" height="${1024 - off - bandY * k}" fill="#f5c518"/>
       <text x="512" y="${off + bandY * k + (1024 - off - bandY * k) * 0.74}" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="${(1024 - off - bandY * k) * 0.62}" text-anchor="middle" fill="#101418">DEV</text>`
    : '';
  const card = (fill) => `<rect x="262" y="${dev ? 130 : 170}" width="500" height="${dev ? 580 : 640}" rx="56" fill="${fill}"/>`;
  const top = dev ? 130 : 170;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect width="1024" height="1024" fill="#101418"/>
  <g transform="translate(${off} ${off}) scale(${k})">
    <g transform="rotate(-7 512 ${top + 320})">${card('#2a3440')}</g>
    ${card('#f4f1ea')}
    <clipPath id="c">${card('#000')}</clipPath>
    <g clip-path="url(#c)">
      <rect x="0" y="${top}" width="1024" height="50" fill="#ae1c28"/>
      <rect x="0" y="${top + 100}" width="1024" height="50" fill="#21468b"/>
    </g>
    <text x="512" y="${top + (dev ? 420 : 450)}" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="230" text-anchor="middle" fill="#101418">nl</text>
  </g>
  ${band}
</svg>`;
}

for (const env of ['prod', 'dev']) {
  const dir = `public/icons/${env}`;
  mkdirSync(dir, { recursive: true });
  const dev = env === 'dev';
  writeFileSync(`${dir}/favicon.svg`, svg({ dev, maskable: false }));
  writeFileSync(`${dir}/_maskable.svg`, svg({ dev, maskable: true }));
  const render = (src, size, out) =>
    execFileSync('magick', ['-background', 'none', '-density', '96', src, '-resize', `${size}x${size}`, '-strip', out]);
  render(`${dir}/favicon.svg`, 180, `${dir}/apple-touch-icon.png`);
  render(`${dir}/favicon.svg`, 192, `${dir}/icon-192.png`);
  render(`${dir}/favicon.svg`, 512, `${dir}/icon-512.png`);
  render(`${dir}/_maskable.svg`, 512, `${dir}/icon-maskable-512.png`);
  execFileSync('rm', [`${dir}/_maskable.svg`]);
}
console.log('icons written to public/icons/{prod,dev}');
