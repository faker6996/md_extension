import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getMermaidScriptTag, markdownToHtml } from './markdown-converter';
import { findChromePath, resolveChromePathCandidates } from './chrome-path';
import { docxToMarkdown, markdownToDocx } from './index';
import {
  disposeSharedExportBrowser,
  getSharedExportBrowserState,
  htmlToImage,
  htmlToPdf,
} from './pdf-image-converter';
import { markdownConverterTestUtils } from './markdown-docx-converter';

void test('parseMarkdownBlocks parses markdown table with separator row', () => {
  const markdown = [
    '| Name | Score |',
    '| ---- | ----: |',
    '| Alice | 10 |',
    '| Bob | 20 |',
  ].join('\n');

  const blocks = markdownConverterTestUtils.parseMarkdownBlocks(markdown);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'table');
  assert.deepEqual(blocks[0].rows, [
    ['Name', 'Score'],
    ['Alice', '10'],
    ['Bob', '20'],
  ]);
});

void test('parseInlineMarkdownSegments recognizes links and formatting tokens', () => {
  const segments = markdownConverterTestUtils.parseInlineMarkdownSegments(
    'Start [Docs](https://example.com) and **bold** plus `code`.'
  );

  assert.deepEqual(segments, [
    { type: 'text', text: 'Start ' },
    { type: 'link', text: 'Docs', href: 'https://example.com' },
    { type: 'text', text: ' and ' },
    { type: 'bold', text: 'bold' },
    { type: 'text', text: ' plus ' },
    { type: 'code', text: 'code' },
    { type: 'text', text: '.' },
  ]);
});

void test('parseMarkdownBlocks keeps alignment from centered html container', () => {
  const markdown = [
    '<div align="center">',
    '',
    '# Title',
    '',
    'Centered paragraph',
    '',
    '</div>',
  ].join('\n');

  const blocks = markdownConverterTestUtils.parseMarkdownBlocks(markdown);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].type, 'heading');
  assert.equal(blocks[0].alignment, 'center');
  assert.equal(blocks[1].type, 'paragraph');
  assert.equal(blocks[1].alignment, 'center');
});

void test('parseInlineMarkdownSegments recognizes linked badge images', () => {
  const segments = markdownConverterTestUtils.parseInlineMarkdownSegments(
    '[![VS Code](https://img.shields.io/badge/vscode-blue)](https://code.visualstudio.com/)'
  );

  assert.deepEqual(segments, [
    {
      type: 'imageLink',
      text: 'VS Code',
      src: 'https://img.shields.io/badge/vscode-blue',
      href: 'https://code.visualstudio.com/',
    },
  ]);
});

void test('getImageDimensions returns width/height for png buffer', () => {
  const buffer = Buffer.alloc(24);
  buffer[0] = 0x89;
  buffer[1] = 0x50;
  buffer[2] = 0x4e;
  buffer[3] = 0x47;
  buffer.writeUInt32BE(320, 16);
  buffer.writeUInt32BE(180, 20);

  assert.deepEqual(markdownConverterTestUtils.getImageDimensions(buffer), {
    width: 320,
    height: 180,
  });
});

void test('getImageDimensions returns width/height for jpeg buffer', () => {
  const jpegBuffer = Buffer.from([
    0xff, 0xd8, // SOI
    0xff, 0xc0, // SOF0 marker
    0x00, 0x11, // segment length
    0x08, // precision
    0x00, 0x2d, // height 45
    0x00, 0x3c, // width 60
    0x03, // components
    0x01, 0x11, 0x00,
    0x02, 0x11, 0x00,
    0x03, 0x11, 0x00,
    0x00,
    0xff, 0xd9, // EOI
  ]);

  assert.deepEqual(markdownConverterTestUtils.getImageDimensions(jpegBuffer), {
    width: 60,
    height: 45,
  });
});

void test('getImageDimensions returns null for unsupported buffer', () => {
  assert.equal(markdownConverterTestUtils.getImageDimensions(Buffer.from([0x01, 0x02, 0x03])), null);
});

void test('findChromePath prefers a configured executable path', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdx-browser-path-'));
  const executableName = process.platform === 'win32' ? 'chrome.exe' : 'chrome';
  const executablePath = path.join(tempDir, executableName);

  try {
    fs.writeFileSync(executablePath, process.platform === 'win32' ? '' : '#!/bin/sh\nexit 0\n', 'utf-8');
    if (process.platform !== 'win32') {
      fs.chmodSync(executablePath, 0o755);
    }

    assert.equal(findChromePath(executablePath), executablePath);
    assert.equal(findChromePath(`"${executablePath}"`), executablePath);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

void test('resolveChromePathCandidates includes preferred path before fallback paths', () => {
  const candidates = resolveChromePathCandidates('/tmp/custom-chrome');
  assert.equal(candidates[0], '/tmp/custom-chrome');
});

void test('markdownToHtml injects script/style nonce attributes when provided', () => {
  const html = markdownToHtml('inline $x$', '/tmp', [], true, {
    scriptNonce: 'nonce-123',
    styleNonce: 'nonce-123',
  });

  assert.match(html, /<style nonce="nonce-123">/);
  assert.match(html, /<script[^>]*nonce="nonce-123"/);
});

void test('getMermaidScriptTag avoids unpinned Mermaid CDN fallback', () => {
  const scriptTag = getMermaidScriptTag('nonce-xyz');
  assert.match(scriptTag, /nonce="nonce-xyz"/);
  assert.match(scriptTag, /mermaid/);
  assert.doesNotMatch(scriptTag, /cdn\.jsdelivr\.net\/npm\/mermaid\/dist\/mermaid\.min\.js/);
});

void test('markdownToHtml uses configured PlantUML server URL', () => {
  const html = markdownToHtml('@startuml\nAlice -> Bob\n@enduml', '/tmp', [], false, {
    plantUmlServerUrl: 'https://plantuml.example.internal/plantuml',
  });

  assert.match(html, /https:\/\/plantuml\.example\.internal\/plantuml\/svg\//);
  assert.doesNotMatch(html, /www\.plantuml\.com/);
});

void test('markdownToHtml falls back to source block when PlantUML server URL is empty', () => {
  const html = markdownToHtml('@startuml\nAlice -> Bob\n@enduml', '/tmp', [], false, {
    plantUmlServerUrl: '',
  });

  assert.match(html, /<pre><code class="language-plantuml">@startuml/);
  assert.doesNotMatch(html, /plantuml\/svg\//);
});

void test('markdownToHtml preserves safe details markup when raw html is disabled', () => {
  const html = markdownToHtml(
    [
      '<details open>',
      '<summary><b>Troubleshooting</b></summary>',
      '',
      '- [Chrome](https://www.google.com/chrome/)',
      '</details>',
    ].join('\n'),
    '/tmp',
    [],
    true,
    {
      allowRawHtml: false,
    }
  );

  assert.match(html, /<details open>/);
  assert.match(html, /<summary><b>Troubleshooting<\/b><\/summary>/);
  assert.match(html, /<li><a [^>]*href="https:\/\/www\.google\.com\/chrome\/"[^>]*>Chrome<\/a><\/li>/);
});

void test('markdownToHtml preserves centered div markup when raw html is disabled', () => {
  const html = markdownToHtml(
    [
      '<div align="center">',
      '',
      '# Toolkit',
      '',
      '</div>',
    ].join('\n'),
    '/tmp',
    [],
    true,
    {
      allowRawHtml: false,
    }
  );

  assert.match(html, /<div align="center">/);
  assert.match(html, /<h1>Toolkit<\/h1>/);
});

void test('markdownToHtml groups linked badge images into a horizontal image row', () => {
  const html = markdownToHtml(
    [
      '[![VS Code](https://img.shields.io/badge/vscode-blue)](https://code.visualstudio.com/)',
      '[![License](https://img.shields.io/badge/license-green)](LICENSE)',
      '[![Version](https://img.shields.io/badge/version-purple)](CHANGELOG.md)',
    ].join('\n'),
    '/tmp',
    [],
    true,
    {
      allowRawHtml: false,
    }
  );

  assert.match(html, /<div class="mdx-image-row">/);
  assert.match(html, /<span class="mdx-image-row-item">/);
});

void test('markdownToHtml groups plain badge images into a horizontal image row', () => {
  const html = markdownToHtml(
    [
      '![Version](https://img.shields.io/badge/version-blue)',
      '![License](https://img.shields.io/badge/license-green)',
      '![Next.js](https://img.shields.io/badge/next-black)',
    ].join('\n'),
    '/tmp',
    [],
    true,
    {
      allowRawHtml: false,
    }
  );

  assert.match(html, /<div class="mdx-image-row">/);
  assert.equal((html.match(/<span class="mdx-image-row-item">/g) ?? []).length, 3);
});

void test('markdownToHtml decorates preview code blocks with language label and copy button', () => {
  const html = markdownToHtml(
    [
      '```bash',
      'npm run prisma:generate',
      'npm run prisma:migrate',
      'npm run dev',
      '```',
    ].join('\n'),
    '/tmp',
    [],
    true,
    {
      allowRawHtml: false,
    }
  );

  assert.match(html, /<div class="mdx-code-block">/);
  assert.match(html, /<span class="mdx-code-language">bash<\/span>/);
  assert.match(html, /class="mdx-copy-button"/);
});

void test('markdownToHtml keeps export code blocks in card layout without preview copy controls', () => {
  const html = markdownToHtml(
    [
      '```bash',
      'npm run dev',
      '```',
    ].join('\n'),
    '/tmp',
    [],
    false,
    {
      allowRawHtml: false,
    }
  );

  assert.match(html, /<div class="mdx-code-block">/);
  assert.match(html, /<div class="mdx-code-toolbar">/);
  assert.match(html, /<span class="mdx-code-language">bash<\/span>/);
  assert.doesNotMatch(html, /<button type="button" class="mdx-copy-button"/);
  assert.match(html, /<span class="mdx-code-toolbar-spacer" aria-hidden="true"><\/span>/);
});

void test('markdownToHtml supports export render profile with dark theme and fluid width', () => {
  const html = markdownToHtml(
    '# Export',
    '/tmp',
    [],
    false,
    {
      renderTarget: 'pdf',
      themeMode: 'dark',
      contentWidth: 'fluid',
      allowRawHtml: false,
    }
  );

  assert.match(html, /<body data-mdx-render-target="pdf">/);
  assert.match(html, /--vscode-editor-background: #0f172a;/);
  assert.match(html, /max-width: none;/);
});

void test('markdownToHtml supports export render profile with readable width', () => {
  const html = markdownToHtml(
    '# Export',
    '/tmp',
    [],
    false,
    {
      renderTarget: 'image',
      themeMode: 'light',
      contentWidth: 'readable',
      allowRawHtml: false,
    }
  );

  assert.match(html, /<body data-mdx-render-target="image">/);
  assert.match(html, /max-width: 800px;/);
});

void test('markdownToHtml escapes mermaid source so class diagrams with angle brackets survive HTML parsing', () => {
  const html = markdownToHtml(
    [
      '```mermaid',
      'classDiagram',
      '  Animal <|-- Dog',
      '```',
    ].join('\n'),
    '/tmp',
    [],
    true,
    {
      allowRawHtml: false,
    }
  );

  assert.match(html, /<div class="mermaid" data-mdx-mermaid="true">/);
  assert.match(html, /Animal &lt;\|-- Dog/);
  assert.match(html, /const MERMAID_SELECTOR = '\.mermaid\[data-mdx-mermaid="true"\]';/);
});

void test('markdownToHtml escapes unsupported raw html when raw html is disabled', () => {
  const html = markdownToHtml('<script>alert(1)</script>', '/tmp', [], true, {
    allowRawHtml: false,
  });

  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

void test('markdownToDocx writes a DOCX file with ZIP signature', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdx-docx-smoke-'));

  try {
    const outputPath = path.join(tempDir, 'smoke.docx');
    await markdownToDocx(
      [
        '# DOCX Smoke Test',
        '',
        'A short paragraph with **bold** text and `inline code`.',
        '',
        '- Alpha',
        '- Beta',
      ].join('\n'),
      outputPath,
      { baseDir: tempDir, plantUmlServerUrl: '' }
    );

    assert.equal(fs.existsSync(outputPath), true);
    const buffer = fs.readFileSync(outputPath);
    assert.ok(buffer.length > 0);
    assert.equal(buffer[0], 0x50);
    assert.equal(buffer[1], 0x4b);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

void test('markdownToDocx and docxToMarkdown round-trip core text content', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdx-docx-roundtrip-'));

  try {
    const outputPath = path.join(tempDir, 'roundtrip.docx');
    await markdownToDocx(
      [
        '# Roundtrip Title',
        '',
        'Paragraph for DOCX roundtrip.',
        '',
        '> Blockquote line',
      ].join('\n'),
      outputPath,
      { baseDir: tempDir, plantUmlServerUrl: '' }
    );

    const markdown = await docxToMarkdown(outputPath);
    assert.match(markdown, /Roundtrip Title/);
    assert.match(markdown, /Paragraph for DOCX roundtrip\./);
    assert.match(markdown, /Blockquote line/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

const chromePath = findChromePath();

void test(
  'htmlToImage exports preview-grade markdown to png',
  { skip: !chromePath },
  async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdx-export-image-'));

    try {
      const html = markdownToHtml(
        [
          '<div align="center">',
          '',
          '[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://example.com)',
          '[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)](https://example.com)',
          '',
          '</div>',
          '',
          '```bash',
          'npm run prisma:generate',
          'npm run prisma:migrate',
          'npm run dev',
          '```',
        ].join('\n'),
        tempDir,
        [],
        false,
        {
          allowRawHtml: false,
          renderTarget: 'image',
          themeMode: 'dark',
          contentWidth: 'fluid',
        }
      );

      const outputPath = path.join(tempDir, 'smoke.png');
      await htmlToImage(html, outputPath, {
        baseDir: tempDir,
        type: 'png',
        fullPage: true,
      });

      assert.equal(fs.existsSync(outputPath), true);
      assert.ok(fs.statSync(outputPath).size > 0);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
);

void test(
  'htmlToPdf exports preview-grade markdown to pdf',
  { skip: !chromePath },
  async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdx-export-pdf-'));

    try {
      const html = markdownToHtml(
        [
          '# Export Smoke Test',
          '',
          '> Preview-aligned export smoke test.',
          '',
          '```ts',
          'console.log("mdx exporter");',
          '```',
        ].join('\n'),
        tempDir,
        [],
        false,
        {
          allowRawHtml: false,
          renderTarget: 'pdf',
          themeMode: 'light',
          contentWidth: 'readable',
        }
      );

      const outputPath = path.join(tempDir, 'smoke.pdf');
      await htmlToPdf(html, outputPath, {
        baseDir: tempDir,
        format: 'A4',
        margin: '20mm',
      });

      assert.equal(fs.existsSync(outputPath), true);
      assert.ok(fs.statSync(outputPath).size > 0);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
);

void test(
  'pdf and image export reuse the same shared browser session',
  { skip: !chromePath },
  async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdx-export-browser-reuse-'));

    try {
      await disposeSharedExportBrowser();
      assert.deepEqual(getSharedExportBrowserState(), {
        hasBrowser: false,
        browserSerial: null,
        activeUsers: 0,
        hasIdleTimer: false,
      });

      const imageHtml = markdownToHtml('![Version](https://img.shields.io/badge/version-blue)', tempDir, [], false, {
        allowRawHtml: false,
        renderTarget: 'image',
        themeMode: 'dark',
        contentWidth: 'fluid',
      });

      const imagePath = path.join(tempDir, 'reuse.png');
      await htmlToImage(imageHtml, imagePath, {
        baseDir: tempDir,
        type: 'png',
        fullPage: true,
      });

      const imageState = getSharedExportBrowserState();
      assert.equal(imageState.hasBrowser, true);
      assert.notEqual(imageState.browserSerial, null);
      assert.equal(imageState.activeUsers, 0);
      assert.equal(imageState.hasIdleTimer, true);

      const pdfHtml = markdownToHtml('# Reuse Browser', tempDir, [], false, {
        allowRawHtml: false,
        renderTarget: 'pdf',
        themeMode: 'light',
        contentWidth: 'readable',
      });

      const pdfPath = path.join(tempDir, 'reuse.pdf');
      await htmlToPdf(pdfHtml, pdfPath, {
        baseDir: tempDir,
        format: 'A4',
        margin: '20mm',
      });

      const pdfState = getSharedExportBrowserState();
      assert.equal(pdfState.hasBrowser, true);
      assert.equal(pdfState.browserSerial, imageState.browserSerial);
      assert.equal(pdfState.activeUsers, 0);
      assert.equal(pdfState.hasIdleTimer, true);

      await disposeSharedExportBrowser();
      assert.deepEqual(getSharedExportBrowserState(), {
        hasBrowser: false,
        browserSerial: null,
        activeUsers: 0,
        hasIdleTimer: false,
      });
    } finally {
      await disposeSharedExportBrowser();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
);
