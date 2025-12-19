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
