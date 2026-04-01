import markdownIt from 'markdown-it';
import type mdToken from 'markdown-it/lib/token.mjs';
import { full as emoji } from 'markdown-it-emoji';
import sanitizeHtml from 'sanitize-html';
import texmath from 'markdown-it-texmath';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

type ImageRowItemRange = {
  start: number;
  end: number;
};

type ImageRowTokenMeta = {
  mdxImageRowItems?: ImageRowItemRange[];
};

function getTokenImageRowItems(token: mdToken | undefined): ImageRowItemRange[] | null {
  const meta = token?.meta as ImageRowTokenMeta | null | undefined;
  return meta?.mdxImageRowItems ?? null;
}

function setTokenImageRowItems(token: mdToken, items: ImageRowItemRange[]): void {
  const nextMeta: ImageRowTokenMeta = {
    ...((token.meta as ImageRowTokenMeta | null | undefined) ?? {}),
    mdxImageRowItems: items,
  };
  token.meta = nextMeta;
}

function isImageRowSeparatorToken(token: mdToken): boolean {
  return (
    token.type === 'softbreak' ||
    token.type === 'hardbreak' ||
    (token.type === 'text' && token.content.trim().length === 0)
  );
}

function collectImageRowItemRanges(children: mdToken[] | null): ImageRowItemRange[] | null {
  if (!children || children.length === 0) {
    return null;
  }

  const items: ImageRowItemRange[] = [];
  let index = 0;

  while (index < children.length) {
    while (index < children.length && isImageRowSeparatorToken(children[index])) {
      index += 1;
    }

    if (index >= children.length) {
      break;
    }

    if (children[index].type === 'image') {
      items.push({ start: index, end: index + 1 });
      index += 1;
      continue;
    }

    if (
      children[index].type === 'link_open' &&
      children[index + 1]?.type === 'image' &&
      children[index + 2]?.type === 'link_close'
    ) {
      items.push({ start: index, end: index + 3 });
      index += 3;
      continue;
    }

    return null;
  }

  return items.length >= 2 ? items : null;
}

function createHtmlInlineToken(referenceToken: mdToken, content: string): mdToken {
  const tokenConstructor = referenceToken.constructor as new (
    type: string,
    tag: string,
    nesting: 0
  ) => mdToken;
  const token = new tokenConstructor('html_inline', '', 0);
  token.content = content;
  return token;
}

function getImageRowItems(tokens: mdToken[], idx: number): ImageRowItemRange[] | null {
  const paragraphOpen = tokens[idx];
  if (!paragraphOpen || paragraphOpen.type !== 'paragraph_open') {
    return null;
  }

  const cachedItems = getTokenImageRowItems(paragraphOpen);
  if (cachedItems) {
    return cachedItems;
  }

  const inlineToken = tokens[idx + 1];
  const paragraphClose = tokens[idx + 2];
  if (
    !inlineToken ||
    !paragraphClose ||
    inlineToken.type !== 'inline' ||
    paragraphClose.type !== 'paragraph_close'
  ) {
    return null;
  }

  const items = collectImageRowItemRanges(inlineToken.children);
  if (!items) {
    return null;
  }

  setTokenImageRowItems(paragraphOpen, items);
  setTokenImageRowItems(inlineToken, items);
  setTokenImageRowItems(paragraphClose, items);
  return items;
}

function renderCodeBlockCard(content: string, language: string, includeCopyButton: boolean): string {
  const escapedLanguage = escapeHtml(language);
  const escapedCode = escapeHtml(content);
  const codeClass = language ? ` class="language-${escapedLanguage}"` : '';
  const languageLabel = language
    ? `<span class="mdx-code-language">${escapedLanguage}</span>`
    : '<span class="mdx-code-language"></span>';
  const copyButton = includeCopyButton
    ? [
        '    <button type="button" class="mdx-copy-button" aria-label="Copy code block" title="Copy code block">',
        '      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">',
        '        <path d="M9 9h9v11H9z"></path>',
        '        <path d="M6 4h9v2H8v11H6z"></path>',
        '      </svg>',
        '    </button>',
      ].join('\n')
    : '    <span class="mdx-code-toolbar-spacer" aria-hidden="true"></span>';

  return [
    '<div class="mdx-code-block">',
    '  <div class="mdx-code-toolbar">',
    `    ${languageLabel}`,
    copyButton,
    '  </div>',
    `  <pre><code${codeClass}>${escapedCode}</code></pre>`,
    '</div>',
  ].join('\n');
}

function createMarkdownParser(allowRawHtml: boolean, renderTarget: RenderTarget): markdownIt {
  const parser = new markdownIt({
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

  const defaultParagraphOpen =
    parser.renderer.rules.paragraph_open ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  const defaultParagraphClose =
    parser.renderer.rules.paragraph_close ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  const defaultFence =
    parser.renderer.rules.fence ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  const defaultCodeBlock =
    parser.renderer.rules.code_block ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

  parser.core.ruler.after('inline', 'mdx_image_rows', (state) => {
    for (let index = 0; index < state.tokens.length; index += 1) {
      const items = getImageRowItems(state.tokens, index);
      if (!items) {
        continue;
      }

      const inlineToken = state.tokens[index + 1];
      const children = inlineToken.children;
      if (!children || children.length === 0) {
        continue;
      }

      const rowChildren: mdToken[] = [];
      for (const item of items) {
        rowChildren.push(createHtmlInlineToken(children[item.start], '<span class="mdx-image-row-item">'));
        rowChildren.push(...children.slice(item.start, item.end));
        rowChildren.push(createHtmlInlineToken(children[item.start], '</span>'));
      }

      inlineToken.children = rowChildren;
    }
  });

  parser.renderer.rules.paragraph_open = (tokens, idx, options, env, self) => {
    if (getImageRowItems(tokens, idx)) {
      return '<div class="mdx-image-row">';
    }
    return defaultParagraphOpen(tokens, idx, options, env, self);
  };

  parser.renderer.rules.paragraph_close = (tokens, idx, options, env, self) => {
    if (getTokenImageRowItems(tokens[idx])) {
      return '</div>';
    }
    return defaultParagraphClose(tokens, idx, options, env, self);
  };

  parser.renderer.rules.fence = (tokens, idx, options, env, self) => {
    if (renderTarget !== 'preview' && renderTarget !== 'pdf' && renderTarget !== 'image') {
      return defaultFence(tokens, idx, options, env, self);
    }

    const token = tokens[idx];
    const language = token.info.trim().split(/\s+/)[0] ?? '';
    return renderCodeBlockCard(token.content, language, renderTarget === 'preview');
  };

  parser.renderer.rules.code_block = (tokens, idx, options, env, self) => {
    if (renderTarget !== 'preview' && renderTarget !== 'pdf' && renderTarget !== 'image') {
      return defaultCodeBlock(tokens, idx, options, env, self);
    }

    return renderCodeBlockCard(tokens[idx].content, '', renderTarget === 'preview');
  };

  return parser;
}

export type RenderThemeMode = 'light' | 'dark';
export type RenderTarget = 'preview' | 'pdf' | 'image';
export type RenderContentWidth = 'fluid' | 'readable';

export interface MarkdownHtmlOptions {
  wrapCodeBlocks?: boolean;
  allowRawHtml?: boolean;
  scriptNonce?: string;
  styleNonce?: string;
  plantUmlServerUrl?: string;
  renderTarget?: RenderTarget;
  themeMode?: RenderThemeMode;
  contentWidth?: RenderContentWidth;
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

function normalizePlantUmlServerUrl(serverUrl?: string): string | null {
  const normalized = serverUrl?.trim() ?? '';
  if (!normalized) {
    return null;
  }

  if (normalized.endsWith('/svg')) {
    return normalized.slice(0, -4).replace(/\/+$/, '');
  }

  if (normalized.endsWith('/png')) {
    return normalized.slice(0, -4).replace(/\/+$/, '');
  }

  return normalized.replace(/\/+$/, '');
}

export function buildPlantUmlSvgUrl(code: string, serverUrl?: string): string | null {
  const normalizedServerUrl = normalizePlantUmlServerUrl(serverUrl);
  if (!normalizedServerUrl) {
    return null;
  }

  const plantUmlSource = /@startuml[\s\S]*@enduml/.test(code)
    ? code
    : `@startuml\n${code}\n@enduml`;
  const encoded = encodePlantUml(plantUmlSource.trim());
  return `${normalizedServerUrl}/svg/${encoded}`;
}

function sanitizeRawHtml(content: string): string {
  const allowedTags = new Set([
    ...sanitizeHtml.defaults.allowedTags,
    'details',
    'summary',
    'div',
    'span',
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'th',
    'td',
    'colgroup',
    'col',
    'figure',
    'figcaption',
    'kbd',
    'samp',
    'var',
    'mark',
    'ins',
    'del',
    'u',
    'sub',
    'sup',
    'center',
  ]);

  return sanitizeHtml(content, {
    allowedTags: [...allowedTags],
    allowedAttributes: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      '*': ['id', 'class', 'title', 'lang', 'dir', 'align', 'data-mdx-mermaid'],
      a: ['href', 'name', 'target', 'rel', 'title'],
      img: ['src', 'alt', 'title', 'width', 'height', 'align'],
      div: ['align'],
      p: ['align'],
      span: ['align'],
      table: ['width', 'align', 'cellpadding', 'cellspacing'],
      col: ['width', 'span'],
      colgroup: ['span', 'width'],
      td: ['width', 'height', 'align', 'valign', 'colspan', 'rowspan'],
      th: ['width', 'height', 'align', 'valign', 'colspan', 'rowspan', 'scope'],
      ol: ['start', 'type'],
      li: ['value'],
      details: ['open'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel', 'file', 'data'],
    allowedSchemesByTag: {
      img: ['http', 'https', 'data', 'file'],
    },
    allowProtocolRelative: false,
    disallowedTagsMode: 'escape',
    parseStyleAttributes: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true),
    },
    exclusiveFilter(frame) {
      if (frame.tag === 'a' && !frame.attribs.href) {
        return true;
      }
      return false;
    },
  });
}

interface StaticThemePalette {
  background: string;
  foreground: string;
  blockQuoteBackground: string;
  codeBackground: string;
  link: string;
  separator: string;
  panelBorder: string;
  description: string;
  inactiveSelectionBackground: string;
  error: string;
  success: string;
  warning: string;
}

function getStaticThemePalette(themeMode: RenderThemeMode): StaticThemePalette {
  if (themeMode === 'dark') {
    return {
      background: '#0f172a',
      foreground: '#e5e7eb',
      blockQuoteBackground: 'rgba(30, 41, 59, 0.72)',
      codeBackground: 'rgba(30, 41, 59, 0.92)',
      link: '#93c5fd',
      separator: '#475569',
      panelBorder: '#4b5563',
      description: '#cbd5e1',
      inactiveSelectionBackground: '#334155',
      error: '#f87171',
      success: '#4ade80',
      warning: '#fbbf24',
    };
  }

  return {
    background: '#ffffff',
    foreground: '#1f2937',
    blockQuoteBackground: '#f8fafc',
    codeBackground: '#f5f5f5',
    link: '#2563eb',
    separator: '#d1d5db',
    panelBorder: '#cbd5e1',
    description: '#475569',
    inactiveSelectionBackground: '#dbeafe',
    error: '#dc2626',
    success: '#16a34a',
    warning: '#d97706',
  };
}

function buildStaticMermaidConfig(themeMode: RenderThemeMode): Record<string, unknown> {
  const palette = getStaticThemePalette(themeMode);
  const darkMode = themeMode === 'dark';

  return {
    startOnLoad: true,
    theme: 'base',
    securityLevel: 'loose',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    themeVariables: {
      darkMode,
      background: palette.background,
      textColor: palette.foreground,
      primaryColor: palette.codeBackground,
      primaryTextColor: palette.foreground,
      primaryBorderColor: palette.panelBorder,
      secondaryColor: palette.blockQuoteBackground,
      secondaryTextColor: palette.foreground,
      secondaryBorderColor: palette.panelBorder,
      tertiaryColor: palette.background,
      tertiaryTextColor: palette.foreground,
      tertiaryBorderColor: palette.panelBorder,
      lineColor: palette.panelBorder,
      defaultLinkColor: palette.panelBorder,
      edgeLabelBackground: palette.background,
      clusterBkg: palette.blockQuoteBackground,
      clusterBorder: palette.panelBorder,
      nodeBkg: palette.codeBackground,
      mainBkg: palette.codeBackground,
      nodeTextColor: palette.foreground,
      nodeBorder: palette.panelBorder,
      actorBkg: palette.codeBackground,
      actorTextColor: palette.foreground,
      actorBorder: palette.panelBorder,
      actorLineColor: palette.panelBorder,
      signalColor: palette.panelBorder,
      signalTextColor: palette.foreground,
      labelBoxBkgColor: palette.background,
      labelBoxBorderColor: palette.panelBorder,
      labelTextColor: palette.foreground,
      loopTextColor: palette.foreground,
      noteBkgColor: palette.blockQuoteBackground,
      noteTextColor: palette.foreground,
      noteBorderColor: palette.panelBorder,
      activationBkgColor: palette.inactiveSelectionBackground,
      activationBorderColor: palette.panelBorder,
      sequenceNumberColor: palette.description,
      classText: palette.foreground,
      relationColor: palette.panelBorder,
      relationLabelBackground: palette.background,
      relationLabelColor: palette.foreground,
      sectionBkgColor: palette.blockQuoteBackground,
      sectionBkgColor2: palette.codeBackground,
      altSectionBkgColor: palette.background,
      gridColor: palette.separator,
      taskBorderColor: palette.panelBorder,
      taskBkgColor: palette.inactiveSelectionBackground,
      taskTextColor: palette.foreground,
      taskTextDarkColor: palette.foreground,
      taskTextLightColor: palette.foreground,
      taskTextOutsideColor: palette.foreground,
      taskTextClickableColor: palette.link,
      activeTaskBorderColor: palette.link,
      activeTaskBkgColor: palette.codeBackground,
      doneTaskBorderColor: palette.panelBorder,
      doneTaskBkgColor: palette.description,
      critBorderColor: palette.error,
      critBkgColor: palette.warning,
      todayLineColor: palette.link,
      fillType0: palette.codeBackground,
      fillType1: palette.blockQuoteBackground,
      fillType2: palette.background,
      fillType3: palette.inactiveSelectionBackground,
      fillType4: palette.blockQuoteBackground,
      fillType5: palette.background,
      fillType6: palette.link,
      fillType7: palette.success,
      pie1: palette.link,
      pie2: palette.codeBackground,
      pie3: palette.blockQuoteBackground,
      pie4: palette.panelBorder,
      pie5: palette.description,
      pie6: palette.background,
      pie7: palette.link,
      pie8: palette.codeBackground,
      pie9: palette.blockQuoteBackground,
      pieTitleTextColor: palette.foreground,
      pieSectionTextColor: palette.foreground,
      ganttTaskBkgColor: palette.link,
      ganttTaskTextColor: palette.foreground,
      ganttTaskBorderColor: palette.panelBorder,
      ganttActiveTaskBkgColor: palette.blockQuoteBackground,
      ganttActiveTaskBorderColor: palette.link,
      ganttActiveTaskTextColor: palette.foreground,
      ganttDoneTaskBkgColor: palette.description,
      ganttDoneTaskBorderColor: palette.panelBorder,
      ganttDoneTaskTextColor: palette.foreground,
    },
  };
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
  const renderTarget = htmlOptions?.renderTarget ?? (isPreview ? 'preview' : 'pdf');
  const themeMode = htmlOptions?.themeMode ?? 'light';
  const contentWidth = htmlOptions?.contentWidth ?? (isPreview ? 'fluid' : 'readable');

  // Process mermaid code blocks
  let processedContent = content.replace(
    /```mermaid\n([\s\S]*?)```/g,
    (_match, mermaidCode: string) =>
      `<div class="mermaid" data-mdx-mermaid="true">${escapeHtml(mermaidCode.trim())}</div>`
  );

  const plantUmlServerUrl = htmlOptions?.plantUmlServerUrl ?? 'https://www.plantuml.com/plantuml';

  // Process PlantUML blocks - convert to image using PlantUML server or fall back to source blocks.
  processedContent = processedContent.replace(
    /@startuml\n?([\s\S]*?)@enduml/g,
    (_match, umlCode: string) => {
      const plantUmlSource = `@startuml\n${umlCode.trim()}\n@enduml`;
      const plantUmlSvgUrl = buildPlantUmlSvgUrl(plantUmlSource, plantUmlServerUrl);
      if (!plantUmlSvgUrl) {
        return `<pre><code class="language-plantuml">${escapeHtml(plantUmlSource)}</code></pre>`;
      }
      return `<img src="${escapeHtml(plantUmlSvgUrl)}" alt="PlantUML Diagram" />`;
    }
  );

  const allowRawHtml = htmlOptions?.allowRawHtml ?? true;
  if (!allowRawHtml) {
    processedContent = sanitizeRawHtml(processedContent);
  }

  const scriptNonceAttr = getNonceAttr(htmlOptions?.scriptNonce);
  const styleNonceAttr = getNonceAttr(htmlOptions?.styleNonce);
  const parser = createMarkdownParser(true, renderTarget);
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
    const palette = getStaticThemePalette(themeMode);
    cssVariables = `
    :root {
      --vscode-foreground: ${palette.foreground};
      --vscode-editor-background: ${palette.background};
      --vscode-textBlockQuote-background: ${palette.blockQuoteBackground};
      --vscode-textCodeBlock-background: ${palette.codeBackground};
      --vscode-textLink-foreground: ${palette.link};
      --vscode-textSeparator-foreground: ${palette.separator};
      --vscode-panel-border: ${palette.panelBorder};
      --vscode-descriptionForeground: ${palette.description};
      --vscode-editor-inactiveSelectionBackground: ${palette.inactiveSelectionBackground};
      --vscode-errorForeground: ${palette.error};
      --vscode-testing-iconPassed: ${palette.success};
      --vscode-testing-iconQueued: ${palette.warning};
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
      const MERMAID_SELECTOR = '.mermaid[data-mdx-mermaid="true"]';
      let renderVersion = 0;
      let rerenderTimer = null;

      const readThemeVar = (name, fallback) => {
        const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return value || fallback;
      };

      const parseRgbColor = (value) => {
        const normalized = value.trim().toLowerCase();
        const hexMatch = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
        if (hexMatch) {
          const hex = hexMatch[1];
          if (hex.length === 3) {
            return {
              r: parseInt(hex[0] + hex[0], 16),
              g: parseInt(hex[1] + hex[1], 16),
              b: parseInt(hex[2] + hex[2], 16),
            };
          }
          return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16),
          };
        }

        const rgbMatch = normalized.match(
          /^rgba?\\(\\s*(\\d+(?:\\.\\d+)?)\\s*,\\s*(\\d+(?:\\.\\d+)?)\\s*,\\s*(\\d+(?:\\.\\d+)?)(?:\\s*,\\s*\\d+(?:\\.\\d+)?)?\\s*\\)$/
        );
        if (rgbMatch) {
          return {
            r: Number(rgbMatch[1]),
            g: Number(rgbMatch[2]),
            b: Number(rgbMatch[3]),
          };
        }

        return null;
      };

      const isDarkColor = (value) => {
        const parsed = parseRgbColor(value);
        if (!parsed) {
          return false;
        }
        const luminance =
          (0.2126 * parsed.r + 0.7152 * parsed.g + 0.0722 * parsed.b) / 255;
        return luminance < 0.5;
      };

      const buildMermaidConfig = () => {
        const background = readThemeVar('--vscode-editor-background', '#ffffff');
        const darkMode =
          document.body.classList.contains('vscode-dark') ||
          document.body.classList.contains('vscode-high-contrast') ||
          isDarkColor(background);
        const foreground = readThemeVar(
          '--vscode-editor-foreground',
          darkMode ? '#f3f4f6' : '#1f2937'
        );
        const border = readThemeVar(
          '--vscode-panel-border',
          darkMode ? '#4b5563' : '#cbd5e1'
        );
        const muted = readThemeVar(
          '--vscode-descriptionForeground',
          darkMode ? '#cbd5e1' : '#475569'
        );
        const accent = readThemeVar(
          '--vscode-textLink-foreground',
          darkMode ? '#93c5fd' : '#2563eb'
        );
        const surface = readThemeVar(
          '--vscode-textCodeBlock-background',
          darkMode ? 'rgba(30, 41, 59, 0.92)' : '#f8fafc'
        );
        const surfaceAlt = readThemeVar(
          '--vscode-textBlockQuote-background',
          darkMode ? 'rgba(15, 23, 42, 0.9)' : '#eef2ff'
        );
        const surfaceStrong = readThemeVar(
          '--vscode-editor-inactiveSelectionBackground',
          darkMode ? '#334155' : '#dbeafe'
        );
        const danger = readThemeVar(
          '--vscode-errorForeground',
          darkMode ? '#f87171' : '#dc2626'
        );
        const success = readThemeVar(
          '--vscode-testing-iconPassed',
          darkMode ? '#4ade80' : '#16a34a'
        );
        const warning = readThemeVar(
          '--vscode-testing-iconQueued',
          darkMode ? '#fbbf24' : '#d97706'
        );
        const grid = readThemeVar(
          '--vscode-textSeparator-foreground',
          darkMode ? '#475569' : '#cbd5e1'
        );

        return {
          startOnLoad: false,
          theme: 'base',
          securityLevel: 'loose',
          fontFamily: readThemeVar(
            '--vscode-font-family',
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          ),
          themeVariables: {
            darkMode,
            background,
            textColor: foreground,
            primaryColor: surface,
            primaryTextColor: foreground,
            primaryBorderColor: border,
            secondaryColor: surfaceAlt,
            secondaryTextColor: foreground,
            secondaryBorderColor: border,
            tertiaryColor: background,
            tertiaryTextColor: foreground,
            tertiaryBorderColor: border,
            lineColor: border,
            defaultLinkColor: border,
            edgeLabelBackground: background,
            clusterBkg: surfaceAlt,
            clusterBorder: border,
            nodeBkg: surface,
            mainBkg: surface,
            nodeTextColor: foreground,
            nodeBorder: border,
            actorBkg: surface,
            actorTextColor: foreground,
            actorBorder: border,
            actorLineColor: border,
            signalColor: border,
            signalTextColor: foreground,
            labelBoxBkgColor: background,
            labelBoxBorderColor: border,
            labelTextColor: foreground,
            loopTextColor: foreground,
            noteBkgColor: surfaceAlt,
            noteTextColor: foreground,
            noteBorderColor: border,
            activationBkgColor: surfaceStrong,
            activationBorderColor: border,
            sequenceNumberColor: muted,
            classText: foreground,
            relationColor: border,
            relationLabelBackground: background,
            relationLabelColor: foreground,
            sectionBkgColor: surfaceAlt,
            sectionBkgColor2: surface,
            altSectionBkgColor: background,
            gridColor: grid,
            taskBorderColor: border,
            taskBkgColor: surfaceStrong,
            taskTextColor: foreground,
            taskTextDarkColor: foreground,
            taskTextLightColor: foreground,
            taskTextOutsideColor: foreground,
            taskTextClickableColor: accent,
            activeTaskBorderColor: accent,
            activeTaskBkgColor: surface,
            doneTaskBorderColor: border,
            doneTaskBkgColor: muted,
            critBorderColor: danger,
            critBkgColor: warning,
            todayLineColor: accent,
            fillType0: surface,
            fillType1: surfaceAlt,
            fillType2: background,
            fillType3: surfaceStrong,
            fillType4: surfaceAlt,
            fillType5: background,
            fillType6: accent,
            fillType7: success,
            pie1: accent,
            pie2: surface,
            pie3: surfaceAlt,
            pie4: border,
            pie5: muted,
            pie6: background,
            pie7: accent,
            pie8: surface,
            pie9: surfaceAlt,
            pieTitleTextColor: foreground,
            pieSectionTextColor: foreground,
            ganttTaskBkgColor: accent,
            ganttTaskTextColor: foreground,
            ganttTaskBorderColor: border,
            ganttActiveTaskBkgColor: surfaceAlt,
            ganttActiveTaskBorderColor: accent,
            ganttActiveTaskTextColor: foreground,
            ganttDoneTaskBkgColor: muted,
            ganttDoneTaskBorderColor: border,
            ganttDoneTaskTextColor: foreground,
            cScale0: surface,
            cScale1: surfaceAlt,
            cScale2: background,
            cScale3: accent,
            cScale4: border,
            cScale5: muted,
            cScale6: surface,
            cScale7: surfaceAlt,
            cScale8: background,
            cScale9: accent,
            cScale10: border,
            cScale11: muted,
          },
        };
      };

      const escapeMermaidSource = (value) =>
        value
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');

      const renderMermaid = async () => {
        const blocks = Array.from(document.querySelectorAll(MERMAID_SELECTOR));
        if (!blocks.length || typeof mermaid === 'undefined') {
          return;
        }

        const currentVersion = ++renderVersion;
        mermaid.initialize(buildMermaidConfig());

        for (let index = 0; index < blocks.length; index++) {
          const block = blocks[index];
          const source = block.dataset.mermaidSource ?? block.textContent ?? '';
          block.dataset.mermaidSource = source;
          block.removeAttribute('data-processed');

          try {
            const renderId = 'mdx-mermaid-' + currentVersion + '-' + index;
            const result = await mermaid.render(renderId, source);
            if (currentVersion !== renderVersion) {
              return;
            }
            block.innerHTML = result.svg;
            if (typeof result.bindFunctions === 'function') {
              result.bindFunctions(block);
            }
          } catch (_error) {
            block.innerHTML = '<code>' + escapeMermaidSource(source) + '</code>';
          }
        }
      };

      const copyTextToClipboard = async (value) => {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(value);
          return;
        }

        const textArea = document.createElement('textarea');
        textArea.value = value;
        textArea.setAttribute('readonly', '');
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      };

      const initCopyButtons = () => {
        const buttons = Array.from(document.querySelectorAll('.mdx-copy-button'));
        for (const button of buttons) {
          if (button.dataset.bound === 'true') {
            continue;
          }
          button.dataset.bound = 'true';

          button.addEventListener('click', async () => {
            const codeBlock = button.closest('.mdx-code-block');
            const code = codeBlock ? codeBlock.querySelector('pre > code') : null;
            const text = code ? code.textContent ?? '' : '';
            if (!text) {
              return;
            }

            try {
              await copyTextToClipboard(text);
              const defaultTitle = 'Copy code block';
              button.classList.add('copied');
              button.setAttribute('aria-label', 'Copied');
              button.setAttribute('title', 'Copied');
              window.setTimeout(() => {
                button.classList.remove('copied');
                button.setAttribute('aria-label', defaultTitle);
                button.setAttribute('title', defaultTitle);
              }, 1200);
            } catch {
              button.setAttribute('title', 'Copy failed');
            }
          });
        }
      };

      const scheduleMermaidRender = () => {
        clearTimeout(rerenderTimer);
        rerenderTimer = setTimeout(() => {
          void renderMermaid();
        }, 60);
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          initCopyButtons();
          scheduleMermaidRender();
        }, { once: true });
      } else {
        initCopyButtons();
        scheduleMermaidRender();
      }

      const themeObserver = new MutationObserver((mutations) => {
        if (
          mutations.some(
            (mutation) =>
              mutation.attributeName === 'class' || mutation.attributeName === 'data-vscode-theme-kind'
          )
        ) {
          scheduleMermaidRender();
        }
      });

      themeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['class', 'data-vscode-theme-kind'],
      });
    </script>`;
  } else {
    const exportMermaidConfig = JSON.stringify(buildStaticMermaidConfig(themeMode));
    mermaidInit = `<script${scriptNonceAttr}>mermaid.initialize(${exportMermaidConfig});</script>`;
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
      max-width: ${contentWidth === 'fluid' ? 'none' : '800px'};
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
    .mdx-code-block {
      margin: 1em 0;
      border: 1px solid color-mix(in srgb, var(--vscode-textSeparator-foreground) 45%, transparent);
      border-radius: 10px;
      background-color: color-mix(in srgb, var(--vscode-editor-background) 88%, var(--vscode-textCodeBlock-background) 12%);
      overflow: hidden;
    }
    .mdx-code-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 0.55em 0.75em 0.25em;
      font-size: 0.78em;
      color: color-mix(in srgb, var(--vscode-foreground) 72%, transparent);
      text-transform: lowercase;
      letter-spacing: 0.08em;
    }
    .mdx-code-language {
      min-height: 1em;
      font-family: var(--vscode-editor-font-family, 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace);
    }
    .mdx-code-toolbar-spacer {
      display: inline-flex;
      width: 28px;
      height: 28px;
      flex: 0 0 28px;
    }
    .mdx-copy-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: 1px solid color-mix(in srgb, var(--vscode-textSeparator-foreground) 45%, transparent);
      border-radius: 7px;
      background: transparent;
      color: color-mix(in srgb, var(--vscode-foreground) 76%, transparent);
      cursor: pointer;
      transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
    }
    .mdx-copy-button:hover {
      background-color: color-mix(in srgb, var(--vscode-textCodeBlock-background) 70%, transparent);
      border-color: color-mix(in srgb, var(--vscode-textSeparator-foreground) 75%, transparent);
      color: var(--vscode-foreground);
    }
    .mdx-copy-button.copied {
      color: #22c55e;
      border-color: color-mix(in srgb, #22c55e 75%, transparent);
    }
    .mdx-copy-button svg {
      width: 15px;
      height: 15px;
      fill: currentColor;
    }
    .mdx-code-block pre {
      margin: 0;
      border-radius: 0;
      background: transparent;
      padding-top: 0.5em;
    }
    pre code {
      background: none;
      padding: 0;
    }
    .mermaid[data-mdx-mermaid="true"] {
      background: none;
      padding: 0;
      text-align: center;
    }
    .mermaid svg {
      max-width: 100%;
      height: auto;
      background: transparent !important;
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif) !important;
    }
    .mermaid svg text,
    .mermaid svg tspan,
    .mermaid svg .label,
    .mermaid svg .labelText,
    .mermaid svg .messageText,
    .mermaid svg .loopText,
    .mermaid svg .noteText {
      fill: var(--vscode-foreground) !important;
    }
    .mermaid svg .edgeLabel rect,
    .mermaid svg .labelBox,
    .mermaid svg .labelBkg {
      fill: var(--vscode-editor-background) !important;
      opacity: 1 !important;
    }
    .mermaid svg .actor,
    .mermaid svg .actor-man circle,
    .mermaid svg .actor-man line,
    .mermaid svg .labelBox,
    .mermaid svg .note,
    .mermaid svg .activation0,
    .mermaid svg .activation1,
    .mermaid svg .activation2 {
      fill: var(--vscode-textCodeBlock-background) !important;
      stroke: var(--vscode-panel-border, var(--vscode-textSeparator-foreground)) !important;
    }
    .mermaid svg .actor-line,
    .mermaid svg .messageLine0,
    .mermaid svg .messageLine1,
    .mermaid svg .loopLine,
    .mermaid svg .divider,
    .mermaid svg .relation,
    .mermaid svg .edge-pattern-solid,
    .mermaid svg .edge-pattern-dashed,
    .mermaid svg .edge-thickness-normal,
    .mermaid svg .edge-thickness-thick,
    .mermaid svg .flowchart-link {
      stroke: var(--vscode-panel-border, var(--vscode-textSeparator-foreground)) !important;
      fill: none !important;
    }
    .mermaid svg .arrowheadPath,
    .mermaid svg #arrowhead path,
    .mermaid svg #crosshead path,
    .mermaid svg #filled-head path,
    .mermaid svg #sequencenumber path,
    .mermaid svg marker path {
      fill: var(--vscode-panel-border, var(--vscode-textSeparator-foreground)) !important;
      stroke: var(--vscode-panel-border, var(--vscode-textSeparator-foreground)) !important;
    }
    .mermaid svg .node rect,
    .mermaid svg .node circle,
    .mermaid svg .node ellipse,
    .mermaid svg .node polygon,
    .mermaid svg .node path,
    .mermaid svg g.classGroup rect,
    .mermaid svg g.classGroup line {
      fill: var(--vscode-textCodeBlock-background) !important;
      stroke: var(--vscode-panel-border, var(--vscode-textSeparator-foreground)) !important;
    }
    .mermaid svg .grid .tick line,
    .mermaid svg .grid path {
      stroke: var(--vscode-textSeparator-foreground, #888) !important;
    }
    .mermaid svg .grid text,
    .mermaid svg .taskText,
    .mermaid svg .taskText0,
    .mermaid svg .taskText1,
    .mermaid svg .taskText2,
    .mermaid svg .taskText3,
    .mermaid svg .taskTextOutside,
    .mermaid svg .taskTextOutsideLeft,
    .mermaid svg .taskTextOutsideRight,
    .mermaid svg .sectionTitle text,
    .mermaid svg .classTitle {
      fill: var(--vscode-foreground) !important;
      stroke: none !important;
    }
    .mermaid svg .section0,
    .mermaid svg .section1,
    .mermaid svg .section2,
    .mermaid svg .section3 {
      fill: color-mix(
        in srgb,
        var(--vscode-editor-background) 82%,
        var(--vscode-textCodeBlock-background) 18%
      ) !important;
    }
    .mermaid svg .task,
    .mermaid svg .task0,
    .mermaid svg .task1,
    .mermaid svg .task2,
    .mermaid svg .task3,
    .mermaid svg .active0,
    .mermaid svg .active1,
    .mermaid svg .active2,
    .mermaid svg .active3 {
      fill: var(--vscode-textCodeBlock-background) !important;
      stroke: var(--vscode-panel-border, var(--vscode-textSeparator-foreground)) !important;
    }
    .mermaid svg .done0,
    .mermaid svg .done1,
    .mermaid svg .done2,
    .mermaid svg .done3 {
      fill: color-mix(
        in srgb,
        var(--vscode-editor-background) 60%,
        var(--vscode-textSeparator-foreground) 40%
      ) !important;
      stroke: var(--vscode-textSeparator-foreground, #888) !important;
    }
    .mermaid svg .crit0,
    .mermaid svg .crit1,
    .mermaid svg .crit2,
    .mermaid svg .crit3 {
      fill: color-mix(
        in srgb,
        var(--vscode-errorForeground, #dc2626) 20%,
        var(--vscode-editor-background) 80%
      ) !important;
      stroke: var(--vscode-errorForeground, #dc2626) !important;
    }
    .mermaid svg .today {
      stroke: var(--vscode-textLink-foreground, #2563eb) !important;
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
    [align="center"] {
      text-align: center;
    }
    [align="right"] {
      text-align: right;
    }
    [align="left"] {
      text-align: left;
    }
    .mdx-image-row,
    p:has(> img),
    p:has(> a > img) {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      align-items: center;
      gap: 10px;
      margin: 1em auto;
    }
    .mdx-image-row br,
    p:has(> img) br,
    p:has(> a > img) br {
      display: none;
    }
    .mdx-image-row a,
    p:has(> img) a,
    p:has(> a > img) a {
      display: inline-flex;
      align-items: center;
    }
    .mdx-image-row img,
    p:has(> img) img,
    p:has(> a > img) img {
      display: block;
    }
    .mdx-image-row-item {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    details {
      margin: 1em 0;
      padding: 0.75em 1em;
      border: none;
      border-radius: 8px;
      background-color: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-textCodeBlock-background) 8%);
      box-shadow: none;
    }
    details > summary {
      cursor: pointer;
      font-weight: 600;
      list-style-position: outside;
    }
    details[open] > summary {
      margin-bottom: 0.75em;
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
<body data-mdx-render-target="${renderTarget}">
${htmlContent}
</body>
</html>`;

  return fullHtml;
}
