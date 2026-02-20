import type { MarkdownBlock } from './types';

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

export function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

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

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

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
        if (paragraphLines.length > 1000) {
          break;
        }
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
