import { buildPdfViewerScript } from './script';
import { viewerStyles } from './styles';

export interface PdfViewerHtmlOptions {
  fileName: string;
  pdfUri: string;
  pdfJsUri: string;
  pdfWorkerUri: string;
  pdfViewerUri: string;
  pdfViewerCssUri: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildPdfViewerHtml(options: PdfViewerHtmlOptions): string {
  const scriptContent = buildPdfViewerScript(options.pdfUri, options.pdfWorkerUri);
  const title = escapeHtml(options.fileName);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="${options.pdfJsUri}"></script>
  <script src="${options.pdfViewerUri}"></script>
  <link rel="stylesheet" href="${options.pdfViewerCssUri}">
  <style>
${viewerStyles}
  </style>
</head>
<body>
  <div class="toolbar">
    <button id="prevBtn" disabled>◀ Prev</button>
    <button id="nextBtn" disabled>Next ▶</button>
    <span class="page-info">
      Page <span id="currentPage">-</span> of <span id="totalPages">-</span>
    </span>
    <button id="zoomOut">−</button>
    <button id="zoomIn">+</button>
    <span class="zoom-info"><span id="zoomLevel">100</span>%</span>
    <button id="fitWidth">Fit Width</button>
    <div class="search-box">
      <input type="text" id="searchInput" placeholder="Search..." />
      <button id="searchPrev" disabled>▲</button>
      <button id="searchNext" disabled>▼</button>
      <span class="search-info" id="searchInfo"></span>
    </div>
  </div>

  <div class="container" id="container">
    <div class="loading" id="loading">Loading PDF...</div>
  </div>

  <script>
${scriptContent}
  </script>
</body>
</html>`;
}
