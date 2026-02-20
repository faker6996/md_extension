import puppeteer, { Browser, Page } from 'puppeteer-core';
import { findChromePath } from '../chrome-path';
import { encodePlantUml, escapeHtml, getMermaidScriptTag } from '../markdown-converter';
import type { DiagramImage } from './types';

function buildDiagramHtml(diagramType: 'mermaid' | 'plantuml', code: string): { html: string; selector: string } {
  if (diagramType === 'mermaid') {
    const mermaidScriptTag = getMermaidScriptTag();
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${mermaidScriptTag}
  <script>
    mermaid.initialize({ startOnLoad: true, theme: 'default', securityLevel: 'loose' });
  </script>
  <style>
    body { margin: 0; padding: 16px; background: white; }
    #diagram { display: inline-block; }
  </style>
</head>
<body>
  <div id="diagram" class="mermaid">${escapeHtml(code)}</div>
</body>
</html>`;
    return { html, selector: '#diagram svg' };
  }

  const plantUmlSource = /@startuml[\s\S]*@enduml/.test(code) ? code : `@startuml\n${code}\n@enduml`;
  const encoded = encodePlantUml(plantUmlSource.trim());
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 16px; background: white; }
    #diagram { display: inline-block; }
  </style>
</head>
<body>
  <img id="diagram" src="https://www.plantuml.com/plantuml/svg/${encoded}" alt="PlantUML Diagram" />
</body>
</html>`;
  return { html, selector: '#diagram' };
}

async function waitForDiagram(page: Page, diagramType: 'mermaid' | 'plantuml', selector: string): Promise<void> {
  await page.waitForSelector(selector, { timeout: 10000 });
  if (diagramType === 'plantuml') {
    await page.waitForFunction(
      () => {
        const img = document.querySelector<HTMLImageElement>('#diagram');
        return Boolean(img && img.complete && img.naturalWidth > 0);
      },
      { timeout: 10000 }
    );
  }
}

export async function renderDiagramToPngBuffer(
  diagramType: 'mermaid' | 'plantuml',
  code: string,
  sharedBrowser?: Browser
): Promise<DiagramImage | null> {
  const ownsBrowser = !sharedBrowser;
  let browser: Browser | null = sharedBrowser ?? null;

  try {
    if (ownsBrowser) {
      const chromePath = findChromePath();
      if (!chromePath) {
        throw new Error(
          'Chrome/Chromium not found. Please install Google Chrome, Chromium, or Microsoft Edge.'
        );
      }
      browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
      });
    }

    if (!browser) {
      return null;
    }

    const page = await browser.newPage();
    const padding = 8;
    const { html, selector } = buildDiagramHtml(diagramType, code);
    const baseViewport = { width: 1600, height: 1200 };
    await page.setViewport(baseViewport);
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await waitForDiagram(page, diagramType, selector);

    let element = await page.$(selector);
    let box = element ? await element.boundingBox() : null;
    if (
      box &&
      (box.width + padding * 2 > baseViewport.width || box.height + padding * 2 > baseViewport.height)
    ) {
      await page.setViewport({
        width: Math.ceil(box.width + padding * 2),
        height: Math.ceil(box.height + padding * 2),
      });
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await waitForDiagram(page, diagramType, selector);
      element = await page.$(selector);
      box = element ? await element.boundingBox() : null;
    }

    if (!box) {
      return null;
    }

    const clipX = Math.max(0, box.x - padding);
    const clipY = Math.max(0, box.y - padding);
    const clipWidth = Math.max(1, box.width + padding * 2);
    const clipHeight = Math.max(1, box.height + padding * 2);

    const screenshot = await page.screenshot({
      type: 'png',
      clip: {
        x: clipX,
        y: clipY,
        width: clipWidth,
        height: clipHeight,
      },
    });
    const buffer = Buffer.isBuffer(screenshot) ? screenshot : Buffer.from(screenshot);

    return {
      data: buffer,
      width: Math.round(clipWidth),
      height: Math.round(clipHeight),
    };
  } finally {
    if (ownsBrowser && browser) {
      await browser.close();
    }
  }
}

export function encodeDiagramMarker(type: 'mermaid' | 'plantuml', code: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      type,
      code,
    }),
    'utf-8'
  ).toString('base64');
  return `MDX_DIAGRAM:${payload}`;
}
