import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownToHtml } from './markdown-converter';
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

void test('markdownToHtml injects script/style nonce attributes when provided', () => {
  const html = markdownToHtml('inline $x$', '/tmp', [], true, {
    scriptNonce: 'nonce-123',
    styleNonce: 'nonce-123',
  });

  assert.match(html, /<style nonce="nonce-123">/);
  assert.match(html, /<script[^>]*nonce="nonce-123"/);
});
