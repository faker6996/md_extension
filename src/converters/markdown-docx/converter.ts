import * as fs from 'fs';
import puppeteer, { Browser } from 'puppeteer-core';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { findChromePath } from '../chrome-path';
import { encodeDiagramMarker, renderDiagramToPngBuffer } from './diagram';
import { getHeadingLevel, processInlineMarkdown } from './inline';
import { getImageDimensions, loadImageBuffer, scaleToMaxWidth } from './media';
import { parseMarkdownBlocks } from './parser';
import type { DocxOptions, HorizontalAlignment } from './types';

type DocxAlignment = (typeof AlignmentType)[keyof typeof AlignmentType];

function toDocxAlignment(alignment?: HorizontalAlignment): DocxAlignment | undefined {
  switch (alignment) {
    case 'center':
      return AlignmentType.CENTER;
    case 'right':
      return AlignmentType.RIGHT;
    case 'left':
      return AlignmentType.LEFT;
    default:
      return undefined;
  }
}

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
    const chromePath = findChromePath(options.browserExecutablePath);
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
              children: await processInlineMarkdown(block.content || '', options),
              heading: getHeadingLevel(block.level || 1),
              alignment: toDocxAlignment(block.alignment),
            })
          );
          break;

        case 'paragraph':
          children.push(
            new Paragraph({
              children: await processInlineMarkdown(block.content || '', options),
              alignment: toDocxAlignment(block.alignment),
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
                  size: 20,
                }),
              ],
              shading: { fill: 'f5f5f5' },
              alignment: toDocxAlignment(block.alignment),
            })
          );
          break;

        case 'diagram':
          if (canRenderDiagrams && block.content && block.diagramType) {
            try {
              const image = await renderDiagramToPngBuffer(
                block.diagramType,
                block.content,
                diagramBrowser ?? undefined,
                options.browserExecutablePath,
                options.plantUmlServerUrl
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
                    alignment: toDocxAlignment(block.alignment) ?? AlignmentType.CENTER,
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
                  size: 20,
                }),
              ],
              shading: { fill: 'f5f5f5' },
              alignment: toDocxAlignment(block.alignment),
            })
          );
          break;

        case 'blockquote':
          children.push(
            new Paragraph({
              children: await processInlineMarkdown(block.content || '', options),
              indent: { left: 720 },
              border: {
                left: { style: BorderStyle.SINGLE, size: 24, color: 'cccccc' },
              },
              alignment: toDocxAlignment(block.alignment),
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
                  children: [new TextRun({ text: bullet }), ...(await processInlineMarkdown(item, options))],
                  indent: { left: 720 },
                  alignment: toDocxAlignment(block.alignment),
                })
              );
            }
          }
          break;

        case 'table':
          if (block.rows && block.rows.length > 0) {
            const tableRows: TableRow[] = [];
            for (let rowIndex = 0; rowIndex < block.rows.length; rowIndex++) {
              const row = block.rows[rowIndex];
              const cells: TableCell[] = [];
              for (const cell of row) {
                cells.push(
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: await processInlineMarkdown(cell, options),
                        alignment: toDocxAlignment(block.alignment),
                      }),
                    ],
                    shading: rowIndex === 0 ? { fill: 'f5f5f5' } : undefined,
                  })
                );
              }
              tableRows.push(
                new TableRow({
                  children: cells,
                })
              );
            }

            children.push(
              new Table({
                rows: tableRows,
                width: { size: 100, type: WidthType.PERCENTAGE },
                alignment: toDocxAlignment(block.alignment),
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
              alignment: toDocxAlignment(block.alignment),
            })
          );
          break;

        case 'image':
          if (block.src) {
            const imageBuffer = await loadImageBuffer(block.src, options.baseDir);
            if (imageBuffer) {
              try {
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
                    alignment: toDocxAlignment(block.alignment) ?? AlignmentType.CENTER,
                  })
                );
              } catch {
                children.push(
                  new Paragraph({
                    children: [
                      new TextRun({ text: `[Image: ${block.alt || block.src}]`, italics: true }),
                    ],
                    alignment: toDocxAlignment(block.alignment),
                  })
                );
              }
            } else {
              children.push(
                new Paragraph({
                  children: [new TextRun({ text: `[Image: ${block.alt || block.src}]`, italics: true })],
                  alignment: toDocxAlignment(block.alignment),
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

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
}
