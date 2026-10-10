/**
 * Offline production build used where the npm registry is unreachable.
 * Locally, use `npm run build` (Vite). This script produces the same app as:
 *   dist-single/index.html  – one self-contained HTML file (JS + CSS inlined)
 *   dist-single/fragment.html – the same without the document wrapper
 * Usage: node scripts/build-offline.mjs [--dev]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dev = process.argv.includes('--dev');
const ESBUILD = process.env.ESBUILD ?? '/opt/npm-tools/node_modules/esbuild/lib/main.js';
const TAILWIND = process.env.TAILWIND ?? '/home/claude/vendor/tailwindcss';
const out = resolve(root, 'dist-single');
mkdirSync(out, { recursive: true });

const esbuild = await import(ESBUILD);
const t0 = Date.now();
const res = await esbuild.build({
  entryPoints: [resolve(root, 'src/main.tsx')],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  minify: !dev,
  sourcemap: false,
  write: false,
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  define: { 'process.env.NODE_ENV': dev ? '"development"' : '"production"' },
  nodePaths: [resolve(root, 'node_modules')],
  absWorkingDir: root,
  logLevel: 'warning',
  legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const cssOut = resolve(out, 'app.css');
execFileSync(TAILWIND, ['-c', resolve(root, 'tailwind.config.cjs'), '-i', resolve(root, 'src/styles/index.css'), '-o', cssOut, '--minify'], { cwd: root, stdio: 'pipe' });
const css = readFileSync(cssOut, 'utf8');

const head = `<title>RescueMesh</title>
<meta name="description" content="RescueMesh by BuildForge: self-powered drone docks and a decentralized mesh that turn a communication blackout into a working relay network. Conceptual system and demonstration platform.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,500..800&family=JetBrains+Mono:wght@400;500&family=Source+Sans+3:wght@400;500;600&display=swap">
<style>${css}</style>`;
const body = `<div id="root"></div>
<noscript><p style="padding:24px;color:#EAF2F8;background:#07111B;font-family:sans-serif">RescueMesh needs JavaScript to run its 3D story and simulation.</p></noscript>
<script type="module">${js}</script>`;

writeFileSync(resolve(out, 'fragment.html'), `${head}\n${body}\n`);
writeFileSync(
  resolve(out, 'index.html'),
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`,
);
console.log(`built in ${Date.now() - t0} ms · js ${(js.length / 1024).toFixed(0)} KB · css ${(css.length / 1024).toFixed(0)} KB`);
