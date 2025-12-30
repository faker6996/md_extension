import MarkdownIt from 'markdown-it';
import { full as emoji } from 'markdown-it-emoji';
import texmath from 'markdown-it-texmath';
import * as fs from 'fs';
import * as path from 'path';
import puppeteer, { Browser, PaperFormat } from 'puppeteer-core';
import {
  Document,
  Packer,
  Paragraph,
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

// Initialize markdown-it with emoji and math plugins
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
})
  .use(emoji)
  .use(texmath, {
    engine: { renderToString: (tex: string) => `<span class="katex-inline">${tex}</span>` },
    delimiters: 'dollars',
  });

// Types
export interface PdfOptions {
  format: PaperFormat;
  margin: string;
  baseDir: string;
  displayHeaderFooter?: boolean;
  headerTemplate?: string;
  footerTemplate?: string;
  customStyles?: string[];
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
  const deflate = require('zlib').deflateSync;
  const compressed = deflate(Buffer.from(uml, 'utf-8'), { level: 9 });

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

// Convert Markdown to HTML with styling
export function markdownToHtml(
  content: string,
  baseDir: string,
  customStyles?: string[],
  isPreview: boolean = false
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

  const htmlContent = md.render(processedContent);

  // Load local Mermaid bundle when available to avoid CDN dependency.
  let mermaidScriptTag =
    '<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>';
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
      mermaidScriptTag = `<script>${mermaidScript}</script>`;
    }
  } catch {
    // Fall back to CDN if local bundle can't be loaded.
  }

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
    <script>
      const initMermaid = () => {
        const isDark = document.body.classList.contains('vscode-dark');
        mermaid.initialize({
          startOnLoad: true,
          theme: isDark ? 'dark' : 'default',
          securityLevel: 'loose',
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
    mermaidInit = `<script>mermaid.initialize({startOnLoad:true, theme: 'default'});</script>`;
  }

  // Create full HTML document with styling
  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <base href="file://${baseDir}/">
  <style>
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
      overflow-x: auto;
    }
    pre code {
      background: none;
      padding: 0;
    }
    pre.mermaid {
      background: none;
      padding: 0;
      display: flex;
      justify-content: center;
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
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js" 
    onload="renderMathInElement(document.body, {delimiters: [{left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false}]});"></script>
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

    // Wait for Mermaid diagrams to render
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        // Check if there are any mermaid elements
        const mermaidElements = document.querySelectorAll('pre.mermaid');
        if (mermaidElements.length === 0) {
          resolve();
          return;
        }

        // Wait for mermaid to finish rendering (check for SVG elements)
        const checkMermaid = () => {
          const svgs = document.querySelectorAll('pre.mermaid svg, .mermaid svg');
          if (svgs.length >= mermaidElements.length) {
            resolve();
          } else {
            setTimeout(checkMermaid, 100);
          }
        };

        // Start checking after a short delay to allow mermaid.js to initialize
        setTimeout(checkMermaid, 500);
      });
    });

    // Additional wait for any remaining async rendering
    await new Promise((resolve) => setTimeout(resolve, 500));

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

    // Wait for Mermaid diagrams to render
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        const mermaidElements = document.querySelectorAll('pre.mermaid');
        if (mermaidElements.length === 0) {
          resolve();
          return;
        }
        const checkMermaid = () => {
          const svgs = document.querySelectorAll('pre.mermaid svg, .mermaid svg');
          if (svgs.length >= mermaidElements.length) {
            resolve();
          } else {
            setTimeout(checkMermaid, 100);
          }
        };
        setTimeout(checkMermaid, 500);
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 500));

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

// Parse markdown content into structured blocks for DOCX
interface MarkdownBlock {
  type: 'heading' | 'paragraph' | 'code' | 'list' | 'table' | 'blockquote' | 'hr' | 'image';
  level?: number;
  content?: string;
  items?: string[];
  ordered?: boolean;
  rows?: string[][];
  src?: string;
  alt?: string;
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
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({
        type: 'code',
        content: codeLines.join('\n'),
      });
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
    if (line.includes('|') && i + 1 < lines.length && lines[i + 1].includes('|')) {
      const tableRows: string[][] = [];
      while (i < lines.length && lines[i].includes('|')) {
        const row = lines[i]
          .split('|')
          .map((cell) => cell.trim())
          .filter((cell) => cell !== '');
        if (row.length > 0 && !/^[-:]+$/.test(row.join(''))) {
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

// Process inline markdown (bold, italic, code, links)
function processInlineMarkdown(text: string): TextRun[] {
  if (!text || text.length === 0) {
    return [new TextRun({ text: '' })];
  }

  const runs: TextRun[] = [];

  // Use a regex to split text by markdown patterns
  // Match: **bold**, *italic*, `code`, [link](url)
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: text.slice(lastIndex, match.index) }));
    }

    const matched = match[0];

    // Bold: **text**
    if (matched.startsWith('**') && matched.endsWith('**')) {
      runs.push(
        new TextRun({
          text: matched.slice(2, -2),
          bold: true,
        })
      );
    }
    // Italic: *text*
    else if (matched.startsWith('*') && matched.endsWith('*')) {
      runs.push(
        new TextRun({
          text: matched.slice(1, -1),
          italics: true,
        })
      );
    }
    // Code: `text`
    else if (matched.startsWith('`') && matched.endsWith('`')) {
      runs.push(
        new TextRun({
          text: matched.slice(1, -1),
          font: 'Consolas',
        })
      );
    }
    // Link: [text](url)
    else if (matched.startsWith('[')) {
      const linkTextMatch = matched.match(/\[([^\]]+)\]/);
      if (linkTextMatch) {
        runs.push(
          new TextRun({
            text: linkTextMatch[1],
            color: '0066cc',
            underline: {},
          })
        );
      }
    }

    lastIndex = pattern.lastIndex;
  }

  // Add remaining text after last match
  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: text.slice(lastIndex) }));
  }

  return runs.length > 0 ? runs : [new TextRun({ text })];
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

// Convert Markdown to DOCX
export async function markdownToDocx(
  content: string,
  outputPath: string,
  options: DocxOptions
): Promise<void> {
  const blocks = parseMarkdownBlocks(content);
  const children: (Paragraph | Table)[] = [];

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
              children.push(
                new Paragraph({
                  children: [
                    new ImageRun({
                      data: imageBuffer,
                      transformation: { width: 400, height: 300 },
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
