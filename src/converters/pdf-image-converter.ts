import puppeteer, { Browser, Page, PaperFormat } from 'puppeteer-core';
import { findChromePath } from './chrome-path';

export interface PdfOptions {
  format: PaperFormat;
  margin: string;
  baseDir: string;
  displayHeaderFooter?: boolean;
  headerTemplate?: string;
  footerTemplate?: string;
  customStyles?: string[];
  landscape?: boolean;
}

export interface ImageOptions {
  baseDir: string;
  type: 'png' | 'jpeg';
  quality?: number; // 0-100, jpeg only
  fullPage?: boolean;
  customStyles?: string[];
}

async function waitForMermaidRender(page: Page, timeoutMs: number = 10000): Promise<void> {
  try {
    await page.waitForFunction(
      () => {
        const mermaidBlocks = document.querySelectorAll('pre.mermaid, .mermaid');
        if (!mermaidBlocks.length) {
          return true;
        }
        const renderedSvgs = document.querySelectorAll('pre.mermaid svg, .mermaid svg');
        return renderedSvgs.length >= mermaidBlocks.length;
      },
      {
        timeout: timeoutMs,
        polling: 100,
      }
    );
  } catch {
    // Continue export even if mermaid rendering is partial to avoid hanging forever.
  }
}

// Convert HTML to PDF using Puppeteer
export async function htmlToPdf(
  html: string,
  outputPath: string,
  options: PdfOptions
): Promise<void> {
  const chromePath = findChromePath();

  if (!chromePath) {
    throw new Error(
      'Chrome/Chromium not found. Please install Google Chrome, Chromium, or Microsoft Edge.'
    );
  }

  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });

    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: 'networkidle0',
    });

    await waitForMermaidRender(page);
    await new Promise((resolve) => setTimeout(resolve, 300));

    let headerTemplate = options.headerTemplate || '';
    let footerTemplate = options.footerTemplate || '';

    const now = new Date();
    const isoDate = now.toISOString().split('T')[0];
    const isoTime = now.toTimeString().split(' ')[0];
    const isoDateTime = `${isoDate} ${isoTime}`;

    headerTemplate = headerTemplate
      .replace(/%%ISO-DATE%%/g, isoDate)
      .replace(/%%ISO-TIME%%/g, isoTime)
      .replace(/%%ISO-DATETIME%%/g, isoDateTime);

    footerTemplate = footerTemplate
      .replace(/%%ISO-DATE%%/g, isoDate)
      .replace(/%%ISO-TIME%%/g, isoTime)
      .replace(/%%ISO-DATETIME%%/g, isoDateTime);

    await page.pdf({
      path: outputPath,
      format: options.format,
      landscape: options.landscape ?? false,
      margin: {
        top: options.displayHeaderFooter ? '25mm' : options.margin,
        right: options.margin,
        bottom: options.displayHeaderFooter ? '20mm' : options.margin,
        left: options.margin,
      },
      printBackground: true,
      displayHeaderFooter: options.displayHeaderFooter ?? false,
      headerTemplate: headerTemplate,
      footerTemplate: footerTemplate,
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Convert HTML to Image (PNG/JPEG) using Puppeteer
export async function htmlToImage(
  html: string,
  outputPath: string,
  options: ImageOptions
): Promise<void> {
  const chromePath = findChromePath();

  if (!chromePath) {
    throw new Error(
      'Chrome/Chromium not found. Please install Google Chrome, Chromium, or Microsoft Edge.'
    );
  }

  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });

    await page.setContent(html, {
      waitUntil: 'networkidle0',
    });

    await waitForMermaidRender(page);
    await new Promise((resolve) => setTimeout(resolve, 300));

    await page.screenshot({
      path: outputPath,
      type: options.type,
      quality: options.type === 'jpeg' ? (options.quality ?? 90) : undefined,
      fullPage: options.fullPage ?? true,
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
