import * as vscode from 'vscode';
import * as path from 'path';

export class PdfViewerProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'mdxExporter.pdfViewer';

  constructor(private readonly extensionUri: vscode.Uri) {}

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new PdfViewerProvider(context.extensionUri);
    return vscode.window.registerCustomEditorProvider(PdfViewerProvider.viewType, provider, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
      supportsMultipleEditorsPerDocument: true,
    });
  }

  public openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: () => {} };
  }

  public resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel
  ): void {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri, vscode.Uri.file(path.dirname(document.uri.fsPath))],
    };

    const pdfUri = webviewPanel.webview.asWebviewUri(document.uri);
    const pdfJsUri = webviewPanel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'pdfjs', 'pdf.min.js')
    );
    const pdfWorkerUri = webviewPanel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'pdfjs', 'pdf.worker.min.js')
    );

    webviewPanel.webview.html = this.getHtmlForWebview(
      webviewPanel.webview,
      pdfUri.toString(),
      pdfJsUri.toString(),
      pdfWorkerUri.toString(),
      document.uri.fsPath
    );
  }

  private getHtmlForWebview(
    webview: vscode.Webview,
    pdfUri: string,
    pdfJsUri: string,
    pdfWorkerUri: string,
    filePath: string
  ): string {
    const fileName = path.basename(filePath);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fileName}</title>
  <script src="${pdfJsUri}"></script>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      background-color: #1e1e1e;
      color: #d4d4d4;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      overflow: hidden;
    }
    
    .toolbar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 40px;
      background-color: #252526;
      border-bottom: 1px solid #3c3c3c;
      display: flex;
      align-items: center;
      padding: 0 16px;
      gap: 12px;
      z-index: 100;
    }
    
    .toolbar button {
      background-color: #0e639c;
      color: white;
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
    }
    
    .toolbar button:hover {
      background-color: #1177bb;
    }
    
    .toolbar button:disabled {
      background-color: #3c3c3c;
      cursor: not-allowed;
    }
    
    .page-info {
      color: #cccccc;
      font-size: 13px;
    }
    
    .zoom-info {
      color: #cccccc;
      font-size: 13px;
      margin-left: auto;
    }
    
    .search-box {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-left: 12px;
    }
    
    .search-box input {
      padding: 4px 8px;
      border: 1px solid #3c3c3c;
      border-radius: 4px;
      background-color: #3c3c3c;
      color: #d4d4d4;
      font-size: 13px;
      width: 150px;
    }
    
    .search-box input:focus {
      outline: none;
      border-color: #0e639c;
    }
    
    .search-info {
      color: #cccccc;
      font-size: 12px;
      min-width: 60px;
    }
    
    .container {
      position: fixed;
      top: 40px;
      left: 0;
      right: 0;
      bottom: 0;
      overflow: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 20px;
      gap: 20px;
      background-color: #1e1e1e;
    }
    
    .page-container {
      background-color: white;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    }
    
    canvas {
      display: block;
    }
    
    .loading {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #cccccc;
      font-size: 16px;
    }
    
    .error {
      color: #f48771;
      text-align: center;
      padding: 20px;
    }
    
    .page-container {
      position: relative;
    }
    
    .textLayer {
      position: absolute;
      left: 0;
      top: 0;
      right: 0;
      bottom: 0;
      overflow: hidden;
      opacity: 0.25;
      line-height: 1.0;
      -webkit-text-size-adjust: none;
      -moz-text-size-adjust: none;
      text-size-adjust: none;
      forced-color-adjust: none;
    }
    
    .textLayer span,
    .textLayer br {
      color: transparent;
      position: absolute;
      white-space: pre;
      cursor: text;
      transform-origin: 0% 0%;
    }
    
    .textLayer ::selection {
      background: rgba(0, 0, 255, 0.3);
    }
    
    .textLayer .highlight {
      margin: -1px;
      padding: 1px;
      background-color: rgba(180, 0, 170, 0.25);
      border-radius: 4px;
    }
    
    .textLayer .search-highlight {
      background-color: rgba(255, 255, 0, 0.4);
      border-radius: 2px;
    }
    
    .textLayer .search-highlight.current {
      background-color: rgba(255, 165, 0, 0.6);
    }
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
    pdfjsLib.GlobalWorkerOptions.workerSrc = '${pdfWorkerUri}';
    const pdfUri = '${pdfUri}';
    
    let pdfDoc = null;
    let currentPage = 1;
    let scale = 1.0;
    let renderToken = 0;
    const renderingPages = new Set();
    const pendingPages = new Set();
    const visiblePages = new Set();
    const maxConcurrentRenders = 2;
    let intersectionObserver = null;
    let estimatedPageWidth = 0;
    let estimatedPageHeight = 0;
    
    const container = document.getElementById('container');
    const loading = document.getElementById('loading');
    const currentPageSpan = document.getElementById('currentPage');
    const totalPagesSpan = document.getElementById('totalPages');
    const zoomLevelSpan = document.getElementById('zoomLevel');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    function updatePageInfo() {
      currentPageSpan.textContent = currentPage;
      totalPagesSpan.textContent = pdfDoc ? pdfDoc.numPages : '-';
      zoomLevelSpan.textContent = Math.round(scale * 100);
      
      prevBtn.disabled = !pdfDoc || currentPage <= 1;
      nextBtn.disabled = !pdfDoc || currentPage >= pdfDoc.numPages;
    }

    async function renderPage(pageNum) {
      if (!pdfDoc) return;

      const pageEl = document.getElementById('page-' + pageNum);
      if (!pageEl) return;
      const canvas = pageEl.querySelector('canvas');
      if (!canvas) return;

      const pageToken = renderToken;
      if (canvas.dataset.renderedScale === String(scale)) {
        return;
      }

      renderingPages.add(pageNum);
      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        if (pageToken !== renderToken) {
          return;
        }

        pageEl.style.width = viewport.width + 'px';
        pageEl.style.height = viewport.height + 'px';
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        const context = canvas.getContext('2d');
        await page.render({ canvasContext: context, viewport }).promise;

        if (pageToken !== renderToken) {
          return;
        }

        // Remove existing text layer if any
        const existingTextLayer = pageEl.querySelector('.textLayer');
        if (existingTextLayer) {
          existingTextLayer.remove();
        }

        // Create text layer for text selection
        const textLayerDiv = document.createElement('div');
        textLayerDiv.className = 'textLayer';
        textLayerDiv.style.width = viewport.width + 'px';
        textLayerDiv.style.height = viewport.height + 'px';
        pageEl.appendChild(textLayerDiv);

        // Get text content and render text layer using PDF.js helper
        const textContent = await page.getTextContent();
        
        if (pageToken !== renderToken) {
          return;
        }

        await pdfjsLib.renderTextLayer({
          textContent,
          container: textLayerDiv,
          viewport,
          textDivs: [],
        }).promise;

        canvas.dataset.renderedScale = String(scale);
      } catch (err) {
        // Keep the placeholder; error shows at top-level load errors already
      } finally {
        renderingPages.delete(pageNum);
      }
    }

    function drainRenderQueue() {
      while (pendingPages.size && renderingPages.size < maxConcurrentRenders) {
        const nextPage = pendingPages.values().next().value;
        pendingPages.delete(nextPage);

        void renderPage(nextPage).finally(() => {
          drainRenderQueue();
        });
      }
    }

    function queueRender(pageNum) {
      if (!pdfDoc) return;
      if (pageNum < 1 || pageNum > pdfDoc.numPages) return;
      if (renderingPages.has(pageNum)) return;

      const pageEl = document.getElementById('page-' + pageNum);
      const canvas = pageEl ? pageEl.querySelector('canvas') : null;
      if (canvas && canvas.dataset.renderedScale === String(scale)) {
        return;
      }

      pendingPages.add(pageNum);
      drainRenderQueue();
    }

    function setupPagePlaceholders() {
      container.innerHTML = '';

      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const pageContainer = document.createElement('div');
        pageContainer.className = 'page-container';
        pageContainer.id = 'page-' + i;
        pageContainer.dataset.pageNum = String(i);
        if (estimatedPageWidth && estimatedPageHeight) {
          pageContainer.style.width = estimatedPageWidth + 'px';
          pageContainer.style.height = estimatedPageHeight + 'px';
        }

        const canvas = document.createElement('canvas');
        if (estimatedPageWidth && estimatedPageHeight) {
          canvas.width = Math.floor(estimatedPageWidth);
          canvas.height = Math.floor(estimatedPageHeight);
        }
        pageContainer.appendChild(canvas);
        container.appendChild(pageContainer);
      }
    }

    async function resetForScale() {
      if (!pdfDoc) return;

      renderToken++;
      pendingPages.clear();
      renderingPages.clear();

      try {
        const firstPage = await pdfDoc.getPage(1);
        const viewport = firstPage.getViewport({ scale });
        estimatedPageWidth = viewport.width;
        estimatedPageHeight = viewport.height;
      } catch {
        // Keep previous estimates
      }

      const pages = container.querySelectorAll('.page-container');
      pages.forEach(pageEl => {
        const canvas = pageEl.querySelector('canvas');
        if (!canvas) return;
        delete canvas.dataset.renderedScale;

        if (estimatedPageWidth && estimatedPageHeight) {
          pageEl.style.width = estimatedPageWidth + 'px';
          pageEl.style.height = estimatedPageHeight + 'px';
          canvas.width = Math.floor(estimatedPageWidth);
          canvas.height = Math.floor(estimatedPageHeight);
        }
      });

      const pagesToRender = new Set(visiblePages);
      pagesToRender.add(currentPage);
      pagesToRender.add(currentPage - 1);
      pagesToRender.add(currentPage + 1);
      pagesToRender.forEach(n => queueRender(Number(n)));

      updatePageInfo();
    }

    function initIntersectionObserver() {
      if (intersectionObserver) {
        intersectionObserver.disconnect();
      }

      visiblePages.clear();

      intersectionObserver = new IntersectionObserver(
        entries => {
          for (const entry of entries) {
            const pageNum = Number(entry.target.dataset.pageNum);
            if (!Number.isFinite(pageNum)) continue;

            if (entry.isIntersecting) {
              visiblePages.add(pageNum);
              queueRender(pageNum);
            } else {
              visiblePages.delete(pageNum);
            }
          }

          // Update current page to the top-most visible page
          if (visiblePages.size) {
            currentPage = Math.min(...Array.from(visiblePages));
            updatePageInfo();
          }
        },
        {
          root: container,
          rootMargin: '300px 0px',
          threshold: 0.01,
        }
      );

      container.querySelectorAll('.page-container').forEach(el => intersectionObserver.observe(el));
    }
    
    function scrollToPage(pageNum) {
      const pageEl = document.getElementById('page-' + pageNum);
      if (pageEl) {
        pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    
    // Event listeners
    prevBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        scrollToPage(currentPage);
        updatePageInfo();
      }
    });
    
    nextBtn.addEventListener('click', () => {
      if (currentPage < pdfDoc.numPages) {
        currentPage++;
        scrollToPage(currentPage);
        updatePageInfo();
      }
    });
    
    document.getElementById('zoomIn').addEventListener('click', () => {
      scale = Math.min(scale + 0.25, 3.0);
      void resetForScale();
    });
    
    document.getElementById('zoomOut').addEventListener('click', () => {
      scale = Math.max(scale - 0.25, 0.5);
      void resetForScale();
    });
    
    document.getElementById('fitWidth').addEventListener('click', () => {
      const containerWidth = container.clientWidth - 60;
      if (pdfDoc) {
        pdfDoc.getPage(1).then(page => {
          const viewport = page.getViewport({ scale: 1.0 });
          scale = containerWidth / viewport.width;
          void resetForScale();
        });
      }
    });
    
    // Load PDF
    pdfjsLib.getDocument(pdfUri).promise.then(pdf => {
      pdfDoc = pdf;
      loading.style.display = 'none';
      prevBtn.disabled = false;
      nextBtn.disabled = pdfDoc.numPages <= 1;
      totalPagesSpan.textContent = pdfDoc.numPages;
      
      // Auto fit width
      pdf.getPage(1).then(page => {
        const containerWidth = container.clientWidth - 60;
        const viewport = page.getViewport({ scale: 1.0 });
        scale = Math.min(containerWidth / viewport.width, 1.5);

        const scaledViewport = page.getViewport({ scale });
        estimatedPageWidth = scaledViewport.width;
        estimatedPageHeight = scaledViewport.height;

        setupPagePlaceholders();
        initIntersectionObserver();
        updatePageInfo();

        // Render the first pages quickly
        queueRender(1);
        queueRender(2);
      });
    }).catch(err => {
      loading.innerHTML = '<div class="error">Error loading PDF: ' + err.message + '</div>';
    });

    // Search functionality
    const searchInput = document.getElementById('searchInput');
    const searchPrevBtn = document.getElementById('searchPrev');
    const searchNextBtn = document.getElementById('searchNext');
    const searchInfo = document.getElementById('searchInfo');
    
    let searchResults = [];
    let currentSearchIndex = -1;
    let searchTimeout = null;

    function clearSearchHighlights() {
      document.querySelectorAll('.search-highlight').forEach(el => {
        const parent = el.parentNode;
        parent.replaceChild(document.createTextNode(el.textContent), el);
        parent.normalize();
      });
    }

    function highlightSearchResults(query) {
      clearSearchHighlights();
      searchResults = [];
      currentSearchIndex = -1;

      if (!query || query.length < 2) {
        updateSearchInfo();
        return;
      }

      const lowerQuery = query.toLowerCase();
      const textLayers = document.querySelectorAll('.textLayer');

      textLayers.forEach((textLayer, pageIndex) => {
        const spans = textLayer.querySelectorAll('span');
        spans.forEach(span => {
          const text = span.textContent;
          const lowerText = text.toLowerCase();
          let index = lowerText.indexOf(lowerQuery);

          if (index !== -1) {
            // Create highlighted version
            const parts = [];
            let lastIndex = 0;

            while (index !== -1) {
              if (index > lastIndex) {
                parts.push(document.createTextNode(text.substring(lastIndex, index)));
              }
              
              const highlight = document.createElement('mark');
              highlight.className = 'search-highlight';
              highlight.textContent = text.substring(index, index + query.length);
              parts.push(highlight);
              searchResults.push({ element: highlight, pageNum: pageIndex + 1 });
              
              lastIndex = index + query.length;
              index = lowerText.indexOf(lowerQuery, lastIndex);
            }

            if (lastIndex < text.length) {
              parts.push(document.createTextNode(text.substring(lastIndex)));
            }

            span.textContent = '';
            parts.forEach(part => span.appendChild(part));
          }
        });
      });

      if (searchResults.length > 0) {
        currentSearchIndex = 0;
        highlightCurrentResult();
      }
      
      updateSearchInfo();
      updateSearchButtons();
    }

    function highlightCurrentResult() {
      document.querySelectorAll('.search-highlight.current').forEach(el => {
        el.classList.remove('current');
      });

      if (currentSearchIndex >= 0 && currentSearchIndex < searchResults.length) {
        const result = searchResults[currentSearchIndex];
        result.element.classList.add('current');
        result.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    function updateSearchInfo() {
      if (searchResults.length === 0) {
        searchInfo.textContent = searchInput.value.length >= 2 ? 'No results' : '';
      } else {
        searchInfo.textContent = (currentSearchIndex + 1) + ' / ' + searchResults.length;
      }
    }

    function updateSearchButtons() {
      searchPrevBtn.disabled = searchResults.length === 0;
      searchNextBtn.disabled = searchResults.length === 0;
    }

    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        highlightSearchResults(searchInput.value);
      }, 300);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (e.shiftKey) {
          goToPrevResult();
        } else {
          goToNextResult();
        }
      }
    });

    function goToNextResult() {
      if (searchResults.length === 0) return;
      currentSearchIndex = (currentSearchIndex + 1) % searchResults.length;
      highlightCurrentResult();
      updateSearchInfo();
    }

    function goToPrevResult() {
      if (searchResults.length === 0) return;
      currentSearchIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
      highlightCurrentResult();
      updateSearchInfo();
    }

    searchNextBtn.addEventListener('click', goToNextResult);
    searchPrevBtn.addEventListener('click', goToPrevResult);
  </script>
</body>
</html>`;
  }
}

// Function to open PDF in the custom viewer
export async function openPdfInViewer(pdfPath: string): Promise<void> {
  const uri = vscode.Uri.file(pdfPath);
  await vscode.commands.executeCommand('vscode.openWith', uri, PdfViewerProvider.viewType);
}
