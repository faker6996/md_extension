import * as fs from 'node:fs';
import {
  getVisualRegressionBaselinePath,
  renderVisualRegressionSnapshot,
  visualRegressionBaselineDir,
} from '../src/converters/visual-regression-support';

async function main(): Promise<void> {
  fs.mkdirSync(visualRegressionBaselineDir, { recursive: true });

  for (const themeMode of ['light', 'dark'] as const) {
    const buffer = await renderVisualRegressionSnapshot(themeMode);
    fs.writeFileSync(getVisualRegressionBaselinePath(themeMode), buffer);
    process.stdout.write(`updated ${themeMode} baseline\n`);
  }
}

void main();
