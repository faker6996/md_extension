import * as fs from 'fs';
import mammoth from 'mammoth';

/**
 * Convert DOCX file to HTML string
 * Used for DOCX → PDF conversion (HTML → Puppeteer → PDF)
 */
export async function docxToHtml(docxPath: string): Promise<string> {
  const buffer = fs.readFileSync(docxPath);
  const result = await mammoth.convertToHtml({ buffer });

  // Wrap in full HTML document with styling
  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #fff;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 1.5em;
      margin-bottom: 0.5em;
      font-weight: 600;
    }
    h1 { font-size: 2em; border-bottom: 2px solid #ddd; padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #ddd; padding-bottom: 0.3em; }
    h3 { font-size: 1.25em; }
    p { margin: 1em 0; }
    code {
      background-color: #f5f5f5;
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-family: Consolas, 'Liberation Mono', Menlo, monospace;
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
      color: #333;
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
      display: block;
      margin: 1em auto;
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
    a {
      color: #0066cc;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
${result.value}
</body>
</html>`;

  return fullHtml;
}

/**
 * Convert DOCX file to Markdown string
 * Uses mammoth to get HTML, then converts HTML to Markdown
 */
export async function docxToMarkdown(docxPath: string): Promise<string> {
  const buffer = fs.readFileSync(docxPath);
  const result = await mammoth.convertToHtml({ buffer });
  return htmlToMarkdown(result.value);
}

/**
 * Simple HTML to Markdown converter
 */
function htmlToMarkdown(html: string): string {
  let md = html;
  const diagramBlocks: string[] = [];

  const buildDiagramBlock = (marker: string): string => {
    if (!marker.startsWith('MDX_DIAGRAM:')) {
      return '';
    }
    const payload = marker.slice('MDX_DIAGRAM:'.length);
    try {
      const json = Buffer.from(payload, 'base64').toString('utf-8');
      const data = JSON.parse(json) as { type?: string; code?: string };
      if (!data || typeof data.type !== 'string' || typeof data.code !== 'string') {
        return '';
      }
      const type = data.type.trim() || 'mermaid';
      const code = data.code.trimEnd();
      return `\n\n\`\`\`${type}\n${code}\n\`\`\`\n\n`;
    } catch {
      return '';
    }
  };

  const storeDiagramBlock = (marker: string): string => {
    const block = buildDiagramBlock(marker);
    if (!block) {
      return '';
    }
    const token = `__MDX_DIAGRAM_BLOCK_${diagramBlocks.length}__`;
    diagramBlocks.push(block);
    return token;
  };

  // Extract diagram markers embedded as image alt text.
  md = md.replace(
    /<img[^>]*alt=['"](MDX_DIAGRAM:[^'"]+)['"][^>]*>/gi,
    (_match, marker: string) => storeDiagramBlock(marker)
  );

  // Extract diagram markers embedded as hidden text paragraphs.
  md = md.replace(/MDX_DIAGRAM:[A-Za-z0-9+/=]+/g, (marker) => storeDiagramBlock(marker));

  // Headings
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');
  md = md.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n');
  md = md.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n');

  // Bold and italic
  md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');

  // Links
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

  // Images
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)');
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, '![]($1)');

  // Lists
  md = md.replace(/<ul[^>]*>/gi, '\n');
  md = md.replace(/<\/ul>/gi, '\n');
  md = md.replace(/<ol[^>]*>/gi, '\n');
  md = md.replace(/<\/ol>/gi, '\n');
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');

  // Paragraphs
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');

  // Line breaks
  md = md.replace(/<br\s*\/?>/gi, '\n');

  // Blockquotes
  md = md.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n\n');

  // Code
  md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
  md = md.replace(/<pre[^>]*>(.*?)<\/pre>/gi, '```\n$1\n```\n\n');

  // Remove remaining HTML tags
  md = md.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  md = md.replace(/&amp;/g, '&');
  md = md.replace(/&lt;/g, '<');
  md = md.replace(/&gt;/g, '>');
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");
  md = md.replace(/&nbsp;/g, ' ');

  // Clean up multiple newlines
  md = md.replace(/\n{3,}/g, '\n\n');
  md = md.trim();

  // Restore diagram code blocks.
  diagramBlocks.forEach((block, index) => {
    const token = `__MDX_DIAGRAM_BLOCK_${index}__`;
    md = md.replace(new RegExp(token, 'g'), block);
  });

  return md;
}
