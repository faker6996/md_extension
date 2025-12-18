import MarkdownIt from 'markdown-it';
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

// Initialize markdown-it with common plugins behavior
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
});

// Types
export interface PdfOptions {
  format: PaperFormat;
  margin: string;
  baseDir: string;
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

// Convert Markdown to HTML with styling
export function markdownToHtml(content: string, baseDir: string): string {
  const htmlContent = md.render(content);

  // Create full HTML document with styling
  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <base href="file://${baseDir}/">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 1.5em;
      margin-bottom: 0.5em;
      font-weight: 600;
    }
    h1 { font-size: 2em; border-bottom: 2px solid #eee; padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
    h3 { font-size: 1.25em; }
    p { margin: 1em 0; }
    code {
      background-color: #f5f5f5;
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 0.9em;
    }
    pre {
      background-color: #f5f5f5;
      padding: 1em;
      border-radius: 5px;
      overflow-x: auto;
    }
    pre code {
      background: none;
      padding: 0;
    }
    blockquote {
      border-left: 4px solid #ddd;
      margin: 1em 0;
      padding: 0.5em 1em;
      color: #666;
      background-color: #f9f9f9;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 1em 0;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 8px 12px;
      text-align: left;
    }
    th {
      background-color: #f5f5f5;
      font-weight: 600;
    }
    tr:nth-child(even) {
      background-color: #fafafa;
    }
    img {
      max-width: 100%;
      height: auto;
    }
    a {
      color: #0066cc;
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
      border-top: 1px solid #ddd;
      margin: 2em 0;
    }
  </style>
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

    // Generate PDF
    await page.pdf({
      path: outputPath,
      format: options.format,
      margin: {
        top: options.margin,
        right: options.margin,
        bottom: options.margin,
        left: options.margin,
      },
      printBackground: true,
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
        !lines[i].startsWith('```')
      ) {
        paragraphLines.push(lines[i]);
        i++;
      }
      blocks.push({
        type: 'paragraph',
        content: paragraphLines.join(' '),
      });
      continue;
    }

    i++;
  }

  return blocks;
}

// Process inline markdown (bold, italic, code, links)
function processInlineMarkdown(text: string): TextRun[] {
  const runs: TextRun[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    if (boldMatch && remaining.indexOf(boldMatch[0]) === 0) {
      runs.push(new TextRun({ text: boldMatch[1], bold: true }));
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic
    const italicMatch = remaining.match(/\*(.+?)\*/);
    if (italicMatch && remaining.indexOf(italicMatch[0]) === 0) {
      runs.push(new TextRun({ text: italicMatch[1], italics: true }));
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Inline code
    const codeMatch = remaining.match(/`(.+?)`/);
    if (codeMatch && remaining.indexOf(codeMatch[0]) === 0) {
      runs.push(
        new TextRun({
          text: codeMatch[1],
          font: 'Consolas',
          shading: { fill: 'f5f5f5' },
        })
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Link (simplified - just show text)
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch && remaining.indexOf(linkMatch[0]) === 0) {
      runs.push(
        new TextRun({
          text: linkMatch[1],
          color: '0066cc',
          underline: {},
        })
      );
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Regular text - find next special character
    const nextSpecial = remaining.search(/\*|`|\[/);
    if (nextSpecial === -1) {
      runs.push(new TextRun({ text: remaining }));
      break;
    } else if (nextSpecial === 0) {
      runs.push(new TextRun({ text: remaining[0] }));
      remaining = remaining.slice(1);
    } else {
      runs.push(new TextRun({ text: remaining.slice(0, nextSpecial) }));
      remaining = remaining.slice(nextSpecial);
    }
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
