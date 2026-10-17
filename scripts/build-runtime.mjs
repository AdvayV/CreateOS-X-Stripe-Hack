import { build } from 'esbuild';
import fs from 'node:fs';
fs.mkdirSync('.runtime', { recursive: true });
await build({ entryPoints: ['runtime/worker.mjs'], bundle: true, platform: 'node', format: 'esm', target: 'node22', outfile: '.runtime/worker.bundle.mjs', banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" } });
fs.copyFileSync('runtime/runner.mjs', '.runtime/runner.mjs');
