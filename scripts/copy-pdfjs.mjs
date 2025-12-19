import { build } from 'esbuild';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

async function main() {
  const repoRoot = process.cwd();
  const sourceDir = path.join(repoRoot, 'node_modules', 'pdfjs-dist', 'build');
  const destDir = path.join(repoRoot, 'out', 'pdfjs');

  await build({
    entryPoints: [path.join(sourceDir, 'pdf.min.mjs')],
    outfile: path.join(destDir, 'pdf.min.js'),
    bundle: true,
    minify: true,
    format: 'iife',
    globalName: 'pdfjsLib',
    platform: 'browser',
    sourcemap: false,
    logLevel: 'silent',
  });

  await build({
    entryPoints: [path.join(sourceDir, 'pdf.worker.min.mjs')],
    outfile: path.join(destDir, 'pdf.worker.min.js'),
    bundle: true,
    minify: true,
    format: 'iife',
    platform: 'browser',
    sourcemap: false,
    logLevel: 'silent',
  });

  // Clean up old copied artifacts (from previous versions of this script)
  await fs.rm(path.join(destDir, 'pdf.min.mjs'), { force: true });
  await fs.rm(path.join(destDir, 'pdf.worker.min.mjs'), { force: true });
}

await main();
