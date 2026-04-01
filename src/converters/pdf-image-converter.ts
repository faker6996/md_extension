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

const BROWSER_IDLE_TIMEOUT_MS = 15_000;

let sharedBrowserPromise: Promise<Browser> | null = null;
let sharedBrowserPath: string | null = null;
let activeBrowserUsers = 0;
let sharedBrowserIdleTimer: ReturnType<typeof setTimeout> | null = null;
let sharedBrowserSerialCounter = 0;
let currentSharedBrowserSerial: number | null = null;

function resetSharedBrowserState(): void {
  if (sharedBrowserIdleTimer) {
    clearTimeout(sharedBrowserIdleTimer);
    sharedBrowserIdleTimer = null;
  }
  sharedBrowserPromise = null;
  sharedBrowserPath = null;
  activeBrowserUsers = 0;
  currentSharedBrowserSerial = null;
}

function buildLaunchOptions(chromePath: string) {
  return {
    executablePath: chromePath,
    headless: true as const,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  };
}

async function getSharedBrowser(chromePath: string): Promise<Browser> {
  if (sharedBrowserIdleTimer) {
    clearTimeout(sharedBrowserIdleTimer);
    sharedBrowserIdleTimer = null;
  }

  if (sharedBrowserPromise && sharedBrowserPath === chromePath) {
    return await sharedBrowserPromise;
  }

  if (sharedBrowserPromise && sharedBrowserPath !== chromePath) {
    const previousBrowserPromise = sharedBrowserPromise;
    resetSharedBrowserState();
    const previousBrowser = await previousBrowserPromise.catch(() => null);
    if (previousBrowser && previousBrowser.isConnected()) {
      await previousBrowser.close();
    }
  }

  sharedBrowserPath = chromePath;
  const browserSerial = ++sharedBrowserSerialCounter;
  currentSharedBrowserSerial = browserSerial;
  sharedBrowserPromise = puppeteer.launch(buildLaunchOptions(chromePath)).then((browser) => {
    browser.once('disconnected', () => {
      resetSharedBrowserState();
    });
    return browser;
  }).catch((error: unknown) => {
    resetSharedBrowserState();
    throw error;
  });

  return await sharedBrowserPromise;
}

async function acquireSharedBrowser(chromePath: string): Promise<Browser> {
  const browser = await getSharedBrowser(chromePath);
  activeBrowserUsers += 1;
  return browser;
}

function scheduleSharedBrowserClose(): void {
  if (activeBrowserUsers > 0 || !sharedBrowserPromise) {
    return;
  }

  const browserPromise = sharedBrowserPromise;
  sharedBrowserIdleTimer = setTimeout(() => {
    void browserPromise
      .then(async (browser) => {
        if (sharedBrowserPromise !== browserPromise || activeBrowserUsers > 0) {
          return;
        }

        resetSharedBrowserState();
        if (browser.isConnected()) {
          await browser.close();
        }
      })
      .catch(() => {
        resetSharedBrowserState();
      });
  }, BROWSER_IDLE_TIMEOUT_MS);
}

function releaseSharedBrowser(browser: Browser): void {
  activeBrowserUsers = Math.max(0, activeBrowserUsers - 1);

  if (!browser.isConnected()) {
    resetSharedBrowserState();
    return;
  }

  scheduleSharedBrowserClose();
}

async function createExportPage(): Promise<{ browser: Browser; page: Page }> {
  const chromePath = findChromePath();

  if (!chromePath) {
    throw new Error(
      'Chrome/Chromium not found. Please install Google Chrome, Chromium, or Microsoft Edge.'
    );
  }

  const browser = await acquireSharedBrowser(chromePath);

  try {
    const page = await browser.newPage();
    return { browser, page };
  } catch (error) {
    releaseSharedBrowser(browser);
    throw error;
  }
}

async function closeExportPage(browser: Browser, page: Page): Promise<void> {
  try {
    if (!page.isClosed()) {
      await page.close();
    }
  } finally {
    releaseSharedBrowser(browser);
  }
}

export async function disposeSharedExportBrowser(): Promise<void> {
  if (sharedBrowserIdleTimer) {
    clearTimeout(sharedBrowserIdleTimer);
    sharedBrowserIdleTimer = null;
  }

  if (!sharedBrowserPromise) {
    resetSharedBrowserState();
    return;
  }

  const browserPromise = sharedBrowserPromise;
  resetSharedBrowserState();
  const browser = await browserPromise.catch(() => null);
  if (browser && browser.isConnected()) {
    await browser.close();
  }
}

export function getSharedExportBrowserState(): {
  hasBrowser: boolean;
  browserSerial: number | null;
  activeUsers: number;
  hasIdleTimer: boolean;
} {
  return {
    hasBrowser: sharedBrowserPromise !== null,
    browserSerial: currentSharedBrowserSerial,
    activeUsers: activeBrowserUsers,
    hasIdleTimer: sharedBrowserIdleTimer !== null,
  };
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
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    const resources = await createExportPage();
    browser = resources.browser;
    page = resources.page;

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
    if (browser && page) {
      await closeExportPage(browser, page);
    }
  }
}

// Convert HTML to Image (PNG/JPEG) using Puppeteer
export async function htmlToImage(
  html: string,
  outputPath: string,
  options: ImageOptions
): Promise<void> {
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    const resources = await createExportPage();
    browser = resources.browser;
    page = resources.page;
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
    if (browser && page) {
      await closeExportPage(browser, page);
    }
  }
}
