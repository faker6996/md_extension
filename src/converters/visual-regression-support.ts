import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { markdownToHtml, type RenderThemeMode } from './markdown-converter';
import { htmlToImage } from './pdf-image-converter';

export const visualRegressionFixturePath = path.resolve(
  __dirname,
  'fixtures',
  'visual-regression.md'
);

export const visualRegressionBaselineDir = path.resolve(
  __dirname,
  'fixtures',
  'baselines'
);

export function getVisualRegressionBaselinePath(themeMode: RenderThemeMode): string {
  return path.join(visualRegressionBaselineDir, `visual-regression-${themeMode}.png`);
}

export async function renderVisualRegressionSnapshot(
  themeMode: RenderThemeMode
): Promise<Buffer> {
  const markdown = fs.readFileSync(visualRegressionFixturePath, 'utf-8');
  const baseDir = path.dirname(visualRegressionFixturePath);
  const html = markdownToHtml(markdown, baseDir, [], false, {
    allowRawHtml: false,
    renderTarget: 'image',
    themeMode,
    contentWidth: 'readable',
    plantUmlServerUrl: '',
  });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdx-visual-regression-'));
  const outputPath = path.join(tempDir, `visual-regression-${themeMode}.png`);

  try {
    await htmlToImage(html, outputPath, {
      baseDir,
      type: 'png',
      fullPage: true,
    });
    return fs.readFileSync(outputPath);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
