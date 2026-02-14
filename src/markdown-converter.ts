import markdownIt from 'markdown-it';
import { full as emoji } from 'markdown-it-emoji';
import texmath from 'markdown-it-texmath';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import puppeteer, { Browser, Page, PaperFormat } from 'puppeteer-core';
import {
  Document,
  Packer,
  Paragraph,
  ParagraphChild,
  TextRun,
  HeadingLevel,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  ExternalHyperlink,
} from 'docx';

function createMarkdownParser(allowRawHtml: boolean): markdownIt {
  return new markdownIt({
    html: allowRawHtml,
    linkify: true,
    typographer: true,
    breaks: true,
  })
    .use(emoji)
    .use(texmath, {
      engine: { renderToString: (tex: string) => `<span class="katex-inline">${tex}</span>` },
      delimiters: 'dollars',
    });
}

const markdownParserWithHtml = createMarkdownParser(true);
const markdownParserWithoutHtml = createMarkdownParser(false);

export interface MarkdownHtmlOptions {
  wrapCodeBlocks?: boolean;
  allowRawHtml?: boolean;
  scriptNonce?: string;
  styleNonce?: string;
}

// Types
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

export interface DocxOptions {
  baseDir: string;
}

// Find Chrome/Chromium executable path
export function findChromePath(): string | null {
  const possiblePaths: string[] = [];

  if (process.platform === 'win32') {
    possiblePaths.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    );
  } else if (process.platform === 'darwin') {
    possiblePaths.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    );
  } else {
    // Linux
    possiblePaths.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
      '/usr/bin/microsoft-edge'
    );
  }

  for (const chromePath of possiblePaths) {
    if (fs.existsSync(chromePath)) {
      return chromePath;
    }
  }

  return null;
}

// PlantUML encoding for server API
function encodePlantUml(uml: string): string {
  // Simple encoding: compress and base64 encode for PlantUML server
  // PlantUML uses a special encoding: deflate + custom base64
  const compressed = zlib.deflateSync(Buffer.from(uml, 'utf-8'), { level: 9 });

  // PlantUML uses a modified base64 alphabet
  const encode64 = (num: number): string => {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
    return chars.charAt(num & 0x3f);
  };

  let result = '';
  for (let i = 0; i < compressed.length; i += 3) {
    const b1 = compressed[i];
    const b2 = i + 1 < compressed.length ? compressed[i + 1] : 0;
    const b3 = i + 2 < compressed.length ? compressed[i + 2] : 0;

    result += encode64(b1 >> 2);
    result += encode64(((b1 & 0x3) << 4) | (b2 >> 4));
    result += encode64(((b2 & 0xf) << 2) | (b3 >> 6));
    result += encode64(b3);
  }

  return result;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getNonceAttr(nonce?: string): string {
  return nonce ? ` nonce="${nonce}"` : '';
}

function getMermaidScriptTag(scriptNonce?: string): string {
  const nonceAttr = getNonceAttr(scriptNonce);
  let mermaidScriptTag =
    `<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"${nonceAttr}></script>`;
  try {
    const mermaidPath = path.join(
      __dirname,
      '..',
      'node_modules',
      'mermaid',
      'dist',
      'mermaid.min.js'
    );
    if (fs.existsSync(mermaidPath)) {
      const mermaidScript = fs.readFileSync(mermaidPath, 'utf-8');
      mermaidScriptTag = `<script${nonceAttr}>${mermaidScript}</script>`;
    }
  } catch {
    // Fall back to CDN if local bundle can't be loaded.
  }
  return mermaidScriptTag;
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

// Convert Markdown to HTML with styling
export function markdownToHtml(
  content: string,
  baseDir: string,
  customStyles?: string[],
  isPreview: boolean = false,
  htmlOptions?: MarkdownHtmlOptions
): string {
  // Process mermaid code blocks
  let processedContent = content.replace(
    /```mermaid\n([\s\S]*?)```/g,
    '<pre class="mermaid">$1</pre>'
  );

  // Process PlantUML blocks - convert to image using PlantUML server
  processedContent = processedContent.replace(
    /@startuml\n?([\s\S]*?)@enduml/g,
    (_match, umlCode: string) => {
      // Encode UML for PlantUML server URL
      const encoded = encodePlantUml(umlCode.trim());
      return `<img src="https://www.plantuml.com/plantuml/svg/${encoded}" alt="PlantUML Diagram" />`;
    }
  );

  const allowRawHtml = htmlOptions?.allowRawHtml ?? true;
  const scriptNonceAttr = getNonceAttr(htmlOptions?.scriptNonce);
  const styleNonceAttr = getNonceAttr(htmlOptions?.styleNonce);
  const parser = allowRawHtml ? markdownParserWithHtml : markdownParserWithoutHtml;
  const htmlContent = parser.render(processedContent);

  // Load local Mermaid bundle when available to avoid CDN dependency.
  const mermaidScriptTag = getMermaidScriptTag(htmlOptions?.scriptNonce);

  // Load custom CSS files
  let customCss = '';
  if (customStyles && customStyles.length > 0) {
    for (const stylePath of customStyles) {
      try {
        const fullPath = path.isAbsolute(stylePath) ? stylePath : path.join(baseDir, stylePath);
        if (fs.existsSync(fullPath)) {
          customCss += fs.readFileSync(fullPath, 'utf-8') + '\n';
        }
      } catch {
        // Skip if file can't be read
      }
    }
  }

  // Define CSS variables based on mode
  let cssVariables = '';
  if (!isPreview) {
    // Default light theme for PDF/Export
    cssVariables = `
    :root {
      --vscode-foreground: #333;
      --vscode-editor-background: #fff;
      --vscode-textBlockQuote-background: #f9f9f9;
      --vscode-textCodeBlock-background: #f5f5f5;
      --vscode-textLink-foreground: #0066cc;
      --vscode-textSeparator-foreground: #ddd;
    }`;
  } else {
    // For Preview, we rely on VS Code's injected variables
    cssVariables = `
    :root {
      --vscode-foreground: var(--vscode-editor-foreground);
      --vscode-editor-background: var(--vscode-editor-background);
      --vscode-textBlockQuote-background: var(--vscode-textBlockQuote-background, rgba(127, 127, 127, 0.1));
      --vscode-textCodeBlock-background: var(--vscode-textCodeBlock-background, rgba(127, 127, 127, 0.1));
      --vscode-textLink-foreground: var(--vscode-textLink-foreground);
      --vscode-textSeparator-foreground: var(--vscode-textSeparator-foreground, #888);
    }`;
  }

  // Mermaid initialization
  let mermaidInit = '';
  if (isPreview) {
    // Dynamic theme detection for preview
    mermaidInit = `
    <script${scriptNonceAttr}>
      const initMermaid = () => {
        const isDark = document.body.classList.contains('vscode-dark');
        mermaid.initialize({
          startOnLoad: true,
          theme: isDark ? 'dark' : 'default',
          securityLevel: 'loose',
          fontFamily: 'var(--vscode-font-family)',
        });
      };
      
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMermaid);
      } else {
        initMermaid();
      }
      
      // Re-render on theme change
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.attributeName === 'class') {
            // Simple reload to re-render mermaid with new theme
            // This is the most reliable way to switch mermaid themes
            location.reload();
          }
        });
      });
      observer.observe(document.body, { attributes: true });
    </script>`;
  } else {
    mermaidInit = `<script${scriptNonceAttr}>mermaid.initialize({startOnLoad:true, theme: 'default'});</script>`;
  }

  const wrapCodeBlocks = isPreview
    ? htmlOptions?.wrapCodeBlocks ?? false
    : htmlOptions?.wrapCodeBlocks ?? true;

  const preExtraStyle = isPreview
    ? 'overflow-x: auto;'
    : wrapCodeBlocks
      ? 'white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word;'
      : 'white-space: pre; overflow-wrap: normal; word-break: normal;';

  // Create full HTML document with styling
  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <base href="file://${baseDir}/">
  <style${styleNonceAttr}>
    ${cssVariables}
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif);
      line-height: 1.6;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      max-width: ${isPreview ? 'none' : '800px'};
      margin: 0 auto;
      padding: 20px;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 1.5em;
      margin-bottom: 0.5em;
      font-weight: 600;
      color: var(--vscode-foreground);
    }
    h1 { font-size: 2em; border-bottom: 2px solid var(--vscode-textSeparator-foreground); padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid var(--vscode-textSeparator-foreground); padding-bottom: 0.3em; }
    h3 { font-size: 1.25em; }
    p { margin: 1em 0; }
    code {
      background-color: var(--vscode-textCodeBlock-background);
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family, 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace);
      font-size: 0.9em;
    }
    pre {
      background-color: var(--vscode-textCodeBlock-background);
      padding: 1em;
      border-radius: 5px;
      ${preExtraStyle}
    }
    pre code {
      background: none;
      padding: 0;
    }
    pre.mermaid {
      background: none;
      padding: 0;
      text-align: center;
    }
    blockquote {
      border-left: 4px solid var(--vscode-textSeparator-foreground);
      margin: 1em 0;
      padding: 0.5em 1em;
      color: var(--vscode-foreground);
      background-color: var(--vscode-textBlockQuote-background);
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 1em 0;
    }
    th, td {
      border: 1px solid var(--vscode-textSeparator-foreground);
      padding: 8px 12px;
      text-align: left;
    }
    th {
      background-color: var(--vscode-textCodeBlock-background);
      font-weight: 600;
    }
    tr:nth-child(even) {
      background-color: var(--vscode-textBlockQuote-background);
    }
    img {
      max-width: 100%;
      height: auto;
    }
    a {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    ul, ol {
      padding-left: 2em;
    }
    li {
      margin: 0.3em 0;
    }
    hr {
      border: none;
      border-top: 1px solid var(--vscode-textSeparator-foreground);
      margin: 2em 0;
    }
    ${customCss}
  </style>
  <!-- KaTeX for Math -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"${scriptNonceAttr}></script>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"${scriptNonceAttr}></script>
  <script${scriptNonceAttr}>
    document.addEventListener('DOMContentLoaded', () => {
      if (typeof renderMathInElement === 'function') {
        renderMathInElement(document.body, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false }
          ]
        });
      }
    });
  </script>
  <!-- Mermaid -->
  ${mermaidScriptTag}
  ${mermaidInit}
</head>
<body>
${htmlContent}
</body>
</html>`;

  return fullHtml;
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

    // Set content with base URL for relative paths
    await page.setContent(html, {
      waitUntil: 'networkidle0',
    });

    await waitForMermaidRender(page);
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Process header/footer templates
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

    // Generate PDF
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

    // Set viewport for consistent rendering
    await page.setViewport({ width: 1200, height: 800 });

    // Set content with base URL for relative paths
    await page.setContent(html, {
      waitUntil: 'networkidle0',
    });

    await waitForMermaidRender(page);
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Generate screenshot
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

interface DiagramImage {
  data: Buffer;
  width: number;
  height: number;
}

async function renderDiagramToPngBuffer(
  diagramType: 'mermaid' | 'plantuml',
  code: string,
  sharedBrowser?: Browser
): Promise<DiagramImage | null> {
  const ownsBrowser = !sharedBrowser;
  let browser: Browser | null = sharedBrowser ?? null;

  const buildHtml = (): { html: string; selector: string } => {
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

    const plantUmlSource = /@startuml[\s\S]*@enduml/.test(code)
      ? code
      : `@startuml\n${code}\n@enduml`;
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
  };

  const waitForDiagram = async (page: Page, selector: string): Promise<void> => {
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
  };

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
    const { html, selector } = buildHtml();
    const baseViewport = { width: 1600, height: 1200 };
    await page.setViewport(baseViewport);
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await waitForDiagram(page, selector);

    let element = await page.$(selector);
    let box = element ? await element.boundingBox() : null;
    if (box && (box.width + padding * 2 > baseViewport.width || box.height + padding * 2 > baseViewport.height)) {
      await page.setViewport({
        width: Math.ceil(box.width + padding * 2),
        height: Math.ceil(box.height + padding * 2),
      });
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await waitForDiagram(page, selector);
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

// Parse markdown content into structured blocks for DOCX
export interface MarkdownBlock {
  type:
    | 'heading'
    | 'paragraph'
    | 'code'
    | 'diagram'
    | 'list'
    | 'table'
    | 'blockquote'
    | 'hr'
    | 'image';
  level?: number;
  content?: string;
  language?: string;
  diagramType?: 'mermaid' | 'plantuml';
  items?: string[];
  ordered?: boolean;
  rows?: string[][];
  src?: string;
  alt?: string;
}

function parseMarkdownTableRow(line: string): string[] {
  let normalized = line.trim();
  if (normalized.startsWith('|')) {
    normalized = normalized.slice(1);
  }
  if (normalized.endsWith('|')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized.split('|').map((cell) => cell.trim());
}

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        content: headingMatch[2].trim(),
      });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // Code block
    if (line.startsWith('```')) {
      const language = line.slice(3).trim().toLowerCase();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      const codeContent = codeLines.join('\n');
      const isMermaid = language === 'mermaid';
      const isPlantUml =
        language === 'plantuml' ||
        language === 'uml' ||
        /@startuml[\s\S]*@enduml/.test(codeContent);
      if (isMermaid || isPlantUml) {
        blocks.push({
          type: 'diagram',
          diagramType: isMermaid ? 'mermaid' : 'plantuml',
          content: codeContent,
        });
      } else {
        blocks.push({
          type: 'code',
          content: codeContent,
          language,
        });
      }
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({
        type: 'blockquote',
        content: quoteLines.join('\n'),
      });
      continue;
    }

    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s/, ''));
        i++;
      }
      blocks.push({
        type: 'list',
        items,
        ordered: false,
      });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }
      blocks.push({
        type: 'list',
        items,
        ordered: true,
      });
      continue;
    }

    // Table
    const tableSeparatorPattern = /^\s*\|?\s*:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)*\s*\|?\s*$/;
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      tableSeparatorPattern.test(lines[i + 1].trim())
    ) {
      const tableRows: string[][] = [];
      const headerRow = parseMarkdownTableRow(line);
      if (headerRow.length) {
        tableRows.push(headerRow);
      }
      i += 2;
      while (i < lines.length && lines[i].includes('|')) {
        const row = parseMarkdownTableRow(lines[i]);
        if (row.length > 0) {
          tableRows.push(row);
        }
        i++;
      }
      if (tableRows.length > 0) {
        blocks.push({
          type: 'table',
          rows: tableRows,
        });
      }
      continue;
    }

    // Image
    const imageMatch = line.match(/!\[([^\]]*)\]\(([^)]+)\)/);
    if (imageMatch) {
      blocks.push({
        type: 'image',
        alt: imageMatch[1],
        src: imageMatch[2],
      });
      i++;
      continue;
    }

    // Regular paragraph
    if (line.trim()) {
      const paragraphLines: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !lines[i].startsWith('#') &&
        !lines[i].startsWith('```') &&
        !lines[i].startsWith('>') &&
        !/^[-*+]\s/.test(lines[i]) &&
        !/^\d+\.\s/.test(lines[i]) &&
        !lines[i].includes('|') &&
        !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim()) &&
        !/^!\[/.test(lines[i])
      ) {
        paragraphLines.push(lines[i]);
        i++;
        // Safety limit to prevent extremely large paragraphs
        if (paragraphLines.length > 1000) break;
      }
      if (paragraphLines.length > 0) {
        blocks.push({
          type: 'paragraph',
          content: paragraphLines.join(' '),
        });
      }
      continue;
    }

    i++;
  }

  return blocks;
}

export interface InlineMarkdownSegment {
  type: 'text' | 'bold' | 'italic' | 'code' | 'link';
  text: string;
  href?: string;
}

function parseInlineMarkdownSegments(text: string): InlineMarkdownSegment[] {
  if (!text || text.length === 0) {
    return [{ type: 'text', text: '' }];
  }

  const segments: InlineMarkdownSegment[] = [];

  // Use a regex to split text by markdown patterns
  // Match: **bold**, *italic*, `code`, [link](url)
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      segments.push({ type: 'text', text: text.slice(lastIndex, match.index) });
    }

    const matched = match[0];

    // Bold: **text**
    if (matched.startsWith('**') && matched.endsWith('**')) {
      segments.push({ type: 'bold', text: matched.slice(2, -2) });
    }
    // Italic: *text*
    else if (matched.startsWith('*') && matched.endsWith('*')) {
      segments.push({ type: 'italic', text: matched.slice(1, -1) });
    }
    // Code: `text`
    else if (matched.startsWith('`') && matched.endsWith('`')) {
      segments.push({ type: 'code', text: matched.slice(1, -1) });
    }
    // Link: [text](url)
    else if (matched.startsWith('[')) {
      const linkMatch = matched.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        segments.push({ type: 'link', text: linkMatch[1], href: linkMatch[2] });
      }
    }

    lastIndex = pattern.lastIndex;
  }

  // Add remaining text after last match
  if (lastIndex < text.length) {
    segments.push({ type: 'text', text: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: 'text', text }];
}

// Process inline markdown (bold, italic, code, links)
function processInlineMarkdown(text: string): ParagraphChild[] {
  const segments = parseInlineMarkdownSegments(text);
  const runs: ParagraphChild[] = [];

  for (const segment of segments) {
    switch (segment.type) {
      case 'bold':
        runs.push(
          new TextRun({
            text: segment.text,
            bold: true,
          })
        );
        break;
      case 'italic':
        runs.push(
          new TextRun({
            text: segment.text,
            italics: true,
          })
        );
        break;
      case 'code':
        runs.push(
          new TextRun({
            text: segment.text,
            font: 'Consolas',
          })
        );
        break;
      case 'link':
        runs.push(
          new ExternalHyperlink({
            link: segment.href ?? '',
            children: [
              new TextRun({
                text: segment.text,
                color: '0066cc',
                underline: {},
              }),
            ],
          })
        );
        break;
      case 'text':
      default:
        runs.push(new TextRun({ text: segment.text }));
        break;
    }
  }

  return runs.length > 0 ? runs : [new TextRun({ text: '' })];
}

// Get heading level for DOCX
function getHeadingLevel(
  level: number
): (typeof HeadingLevel)[keyof typeof HeadingLevel] | undefined {
  switch (level) {
    case 1:
      return HeadingLevel.HEADING_1;
    case 2:
      return HeadingLevel.HEADING_2;
    case 3:
      return HeadingLevel.HEADING_3;
    case 4:
      return HeadingLevel.HEADING_4;
    case 5:
      return HeadingLevel.HEADING_5;
    case 6:
      return HeadingLevel.HEADING_6;
    default:
      return undefined;
  }
}

function scaleToMaxWidth(width: number, height: number, maxWidth: number): { width: number; height: number } {
  if (width <= maxWidth) {
    return { width, height };
  }
  const ratio = maxWidth / width;
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

function getImageDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) {
    return null;
  }

  // PNG: IHDR width/height at offset 16
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  // JPEG: parse SOF markers for dimensions
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      const isSofMarker =
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc;

      if (isSofMarker && offset + 8 < buffer.length) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }

      if (length < 2) {
        break;
      }
      offset += 2 + length;
    }
  }

  return null;
}

export const markdownConverterTestUtils = {
  parseMarkdownBlocks,
  parseInlineMarkdownSegments,
  getImageDimensions,
};

function encodeDiagramMarker(type: 'mermaid' | 'plantuml', code: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      type,
      code,
    }),
    'utf-8'
  ).toString('base64');
  return `MDX_DIAGRAM:${payload}`;
}

// Convert Markdown to DOCX
export async function markdownToDocx(
  content: string,
  outputPath: string,
  options: DocxOptions
): Promise<void> {
  const blocks = parseMarkdownBlocks(content);
  const children: (Paragraph | Table)[] = [];
  const hasDiagrams = blocks.some(
    (block) => block.type === 'diagram' && Boolean(block.content && block.diagramType)
  );

  let diagramBrowser: Browser | null = null;
  let canRenderDiagrams = hasDiagrams;

  if (hasDiagrams) {
    const chromePath = findChromePath();
    if (chromePath) {
      diagramBrowser = await puppeteer.launch({
        executablePath: chromePath,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
      });
    } else {
      canRenderDiagrams = false;
    }
  }

  try {
    for (const block of blocks) {
      switch (block.type) {
        case 'heading':
          children.push(
            new Paragraph({
              children: processInlineMarkdown(block.content || ''),
              heading: getHeadingLevel(block.level || 1),
            })
          );
          break;

        case 'paragraph':
          children.push(
            new Paragraph({
              children: processInlineMarkdown(block.content || ''),
            })
          );
          break;

      case 'code':
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: block.content || '',
                font: 'Consolas',
                size: 20, // 10pt
              }),
            ],
            shading: { fill: 'f5f5f5' },
          })
        );
        break;

        case 'diagram':
          if (canRenderDiagrams && block.content && block.diagramType) {
            try {
              const image = await renderDiagramToPngBuffer(
                block.diagramType,
                block.content,
                diagramBrowser ?? undefined
              );
              if (image) {
                const marker = encodeDiagramMarker(block.diagramType, block.content);
                const scaled = scaleToMaxWidth(image.width, image.height, 600);
                children.push(
                  new Paragraph({
                    children: [
                      new ImageRun({
                        data: image.data,
                        transformation: {
                          width: scaled.width,
                          height: scaled.height,
                        },
                        altText: {
                          name: 'MDX Diagram',
                          title: 'MDX Diagram',
                          description: marker,
                        },
                      }),
                    ],
                    alignment: AlignmentType.CENTER,
                  })
                );
                children.push(
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: marker,
                        vanish: true,
                        size: 2,
                        color: 'FFFFFF',
                      }),
                    ],
                  })
                );
                break;
              }
            } catch {
              // Fall back to plain text below.
            }
          }
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: block.content || '',
                  font: 'Consolas',
                  size: 20, // 10pt
                }),
              ],
              shading: { fill: 'f5f5f5' },
            })
          );
          break;

      case 'blockquote':
        children.push(
          new Paragraph({
            children: processInlineMarkdown(block.content || ''),
            indent: { left: 720 }, // 0.5 inch
            border: {
              left: { style: BorderStyle.SINGLE, size: 24, color: 'cccccc' },
            },
          })
        );
        break;

      case 'list':
        if (block.items) {
          for (let idx = 0; idx < block.items.length; idx++) {
            const item = block.items[idx];
            const bullet = block.ordered ? `${idx + 1}. ` : '• ';
            children.push(
              new Paragraph({
                children: [new TextRun({ text: bullet }), ...processInlineMarkdown(item)],
                indent: { left: 720 },
              })
            );
          }
        }
        break;

      case 'table':
        if (block.rows && block.rows.length > 0) {
          const tableRows = block.rows.map(
            (row, rowIndex) =>
              new TableRow({
                children: row.map(
                  (cell) =>
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: processInlineMarkdown(cell),
                        }),
                      ],
                      shading: rowIndex === 0 ? { fill: 'f5f5f5' } : undefined,
                    })
                ),
              })
          );

          children.push(
            new Table({
              rows: tableRows,
              width: { size: 100, type: WidthType.PERCENTAGE },
            })
          );
        }
        break;

      case 'hr':
        children.push(
          new Paragraph({
            children: [new TextRun({ text: '' })],
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: 'cccccc' },
            },
          })
        );
        break;

        case 'image':
          // Try to load local image
          if (block.src) {
            const imagePath = path.isAbsolute(block.src)
              ? block.src
              : path.join(options.baseDir, block.src);

            if (fs.existsSync(imagePath)) {
              try {
                const imageBuffer = fs.readFileSync(imagePath);
                const dimensions = getImageDimensions(imageBuffer) ?? { width: 400, height: 300 };
                const scaled = scaleToMaxWidth(dimensions.width, dimensions.height, 600);
                children.push(
                  new Paragraph({
                    children: [
                      new ImageRun({
                        data: imageBuffer,
                        transformation: scaled,
                      }),
                    ],
                    alignment: AlignmentType.CENTER,
                  })
                );
              } catch {
                // If image fails to load, add placeholder text
                children.push(
                  new Paragraph({
                    children: [
                      new TextRun({ text: `[Image: ${block.alt || block.src}]`, italics: true }),
                    ],
                  })
                );
              }
            } else {
              children.push(
                new Paragraph({
                  children: [
                    new TextRun({ text: `[Image: ${block.alt || block.src}]`, italics: true }),
                  ],
                })
              );
            }
          }
          break;
      }
    }
  } finally {
    if (diagramBrowser) {
      await diagramBrowser.close();
    }
  }

  // Create document
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Times New Roman',
          },
        },
      },
    },
    sections: [
      {
        children,
      },
    ],
  });

  // Write to file
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
}
