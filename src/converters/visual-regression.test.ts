import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { findChromePath } from './chrome-path';
import type { RenderThemeMode } from './markdown-converter';
import {
  getVisualRegressionBaselinePath,
  renderVisualRegressionSnapshot,
  visualRegressionBaselineDir,
} from './visual-regression-support';

const chromePath = findChromePath();
const updateBaselines = process.env.MDX_UPDATE_VISUAL_BASELINES === '1';

function readPng(buffer: Buffer): PNG {
  return PNG.sync.read(buffer);
}

async function assertVisualSnapshot(themeMode: RenderThemeMode): Promise<void> {
  const baselinePath = getVisualRegressionBaselinePath(themeMode);
  const actualBuffer = await renderVisualRegressionSnapshot(themeMode);

  if (updateBaselines || !fs.existsSync(baselinePath)) {
    fs.mkdirSync(visualRegressionBaselineDir, { recursive: true });
    fs.writeFileSync(baselinePath, actualBuffer);
    return;
  }

  const expectedImage = readPng(fs.readFileSync(baselinePath));
  const actualImage = readPng(actualBuffer);

  assert.equal(actualImage.width, expectedImage.width, `Snapshot width changed for ${themeMode}`);
  assert.equal(actualImage.height, expectedImage.height, `Snapshot height changed for ${themeMode}`);

  const diffImage = new PNG({ width: expectedImage.width, height: expectedImage.height });
  const diffPixels = pixelmatch(
    expectedImage.data,
    actualImage.data,
    diffImage.data,
    expectedImage.width,
    expectedImage.height,
    { threshold: 0.1 }
  );

  if (diffPixels > 0) {
    const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), `mdx-visual-diff-${themeMode}-`));
    fs.writeFileSync(path.join(artifactDir, `actual-${themeMode}.png`), actualBuffer);
    fs.writeFileSync(path.join(artifactDir, `diff-${themeMode}.png`), PNG.sync.write(diffImage));
    assert.fail(
      `Visual regression mismatch for ${themeMode}: ${diffPixels} pixels changed. Artifacts: ${artifactDir}`
    );
  }
}

void test('visual regression snapshot matches light export baseline', { skip: !chromePath }, async () => {
  await assertVisualSnapshot('light');
});

void test('visual regression snapshot matches dark export baseline', { skip: !chromePath }, async () => {
  await assertVisualSnapshot('dark');
});
