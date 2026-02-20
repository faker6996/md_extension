import {
  ExternalHyperlink,
  HeadingLevel,
  ParagraphChild,
  TextRun,
} from 'docx';
import type { InlineMarkdownSegment } from './types';

export function parseInlineMarkdownSegments(text: string): InlineMarkdownSegment[] {
  if (!text || text.length === 0) {
    return [{ type: 'text', text: '' }];
  }

  const segments: InlineMarkdownSegment[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', text: text.slice(lastIndex, match.index) });
    }

    const matched = match[0];

    if (matched.startsWith('**') && matched.endsWith('**')) {
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

  if (lastIndex < text.length) {
    segments.push({ type: 'text', text: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: 'text', text }];
}

export function processInlineMarkdown(text: string): ParagraphChild[] {
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
