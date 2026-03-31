import {
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  ParagraphChild,
  TextRun,
} from 'docx';
import { getImageDimensions, loadImageBuffer, scaleToFit } from './media';
import type { DocxOptions, InlineMarkdownSegment } from './types';

function normalizeInlineHtml(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(
      /<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi,
      (_match, _quote: string, href: string, inner: string) => `[${normalizeInlineHtml(inner)}](${href})`
    )
    .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, (_match, _tag: string, inner: string) => `**${normalizeInlineHtml(inner)}**`)
    .replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, (_match, _tag: string, inner: string) => `*${normalizeInlineHtml(inner)}*`)
    .replace(/<code>([\s\S]*?)<\/code>/gi, (_match, inner: string) => `\`${inner}\``)
    .replace(/<img\b[^>]*alt=(["'])(.*?)\1[^>]*src=(["'])(.*?)\3[^>]*\/?>/gi, '![$2]($4)')
    .replace(/<img\b[^>]*src=(["'])(.*?)\1[^>]*alt=(["'])(.*?)\3[^>]*\/?>/gi, '![$4]($2)')
    .replace(/<\/?[^>]+>/g, '');
}

export function parseInlineMarkdownSegments(text: string): InlineMarkdownSegment[] {
  const normalizedText = normalizeInlineHtml(text);

  if (!normalizedText || normalizedText.length === 0) {
    return [{ type: 'text', text: '' }];
  }

  const segments: InlineMarkdownSegment[] = [];
  const pattern =
    /(\[!\[[^\]]*]\([^)]+\)\]\([^)]+\)|!\[[^\]]*]\([^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(normalizedText)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', text: normalizedText.slice(lastIndex, match.index) });
    }

    const matched = match[0];

    if (matched.startsWith('[![')) {
      const imageLinkMatch = matched.match(/^\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)$/);
      if (imageLinkMatch) {
        segments.push({
          type: 'imageLink',
          text: imageLinkMatch[1],
          src: imageLinkMatch[2],
          href: imageLinkMatch[3],
        });
      }
    } else if (matched.startsWith('![')) {
      const imageMatch = matched.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (imageMatch) {
        segments.push({
          type: 'image',
          text: imageMatch[1],
          src: imageMatch[2],
        });
      }
    } else if (matched.startsWith('**') && matched.endsWith('**')) {
      segments.push({ type: 'bold', text: matched.slice(2, -2) });
    } else if (matched.startsWith('*') && matched.endsWith('*')) {
      segments.push({ type: 'italic', text: matched.slice(1, -1) });
    } else if (matched.startsWith('`') && matched.endsWith('`')) {
      segments.push({ type: 'code', text: matched.slice(1, -1) });
    } else if (matched.startsWith('[')) {
      const linkMatch = matched.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        segments.push({ type: 'link', text: linkMatch[1], href: linkMatch[2] });
      }
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < normalizedText.length) {
    segments.push({ type: 'text', text: normalizedText.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: 'text', text: normalizedText }];
}

async function createInlineImageRun(
  src: string | undefined,
  altText: string,
  options?: DocxOptions
): Promise<ImageRun | null> {
  if (!src || !options) {
    return null;
  }

  const imageBuffer = await loadImageBuffer(src, options.baseDir);
  if (!imageBuffer) {
    return null;
  }

  const dimensions = getImageDimensions(imageBuffer) ?? { width: 160, height: 32 };
  const scaled = scaleToFit(dimensions.width, dimensions.height, 320, 40);

  return new ImageRun({
    data: imageBuffer,
    transformation: scaled,
    altText: {
      name: altText || src,
      title: altText || src,
      description: altText || src,
    },
  });
}

export async function processInlineMarkdown(
  text: string,
  options?: DocxOptions
): Promise<ParagraphChild[]> {
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
      case 'image': {
        const imageRun = await createInlineImageRun(segment.src, segment.text, options);
        if (imageRun) {
          runs.push(imageRun);
        } else {
          runs.push(new TextRun({ text: `[Image: ${segment.text || segment.src || 'image'}]`, italics: true }));
        }
        break;
      }
      case 'imageLink': {
        const imageRun = await createInlineImageRun(segment.src, segment.text, options);
        if (imageRun && segment.href) {
          runs.push(
            new ExternalHyperlink({
              link: segment.href,
              children: [imageRun],
            })
          );
        } else if (segment.href) {
          runs.push(
            new ExternalHyperlink({
              link: segment.href,
              children: [
                new TextRun({
                  text: segment.text || segment.href,
                  color: '0066cc',
                  underline: {},
                }),
              ],
            })
          );
        } else {
          runs.push(new TextRun({ text: segment.text || segment.src || '', italics: true }));
        }
        break;
      }
      case 'text':
      default:
        runs.push(new TextRun({ text: segment.text }));
        break;
    }
  }

  return runs.length > 0 ? runs : [new TextRun({ text: '' })];
}

export function getHeadingLevel(
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
