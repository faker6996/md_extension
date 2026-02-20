import * as fs from 'fs';
import * as path from 'path';
import puppeteer, { Browser, Page } from 'puppeteer-core';
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
import { findChromePath } from './chrome-path';
import { encodePlantUml, escapeHtml, getMermaidScriptTag } from './markdown-converter';

export interface DocxOptions {
  baseDir: string;
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
