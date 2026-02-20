import markdownIt from 'markdown-it';
import { full as emoji } from 'markdown-it-emoji';
import texmath from 'markdown-it-texmath';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

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

// PlantUML encoding for server API
export function encodePlantUml(uml: string): string {
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

export function escapeHtml(input: string): string {
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

export function getMermaidScriptTag(scriptNonce?: string): string {
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
