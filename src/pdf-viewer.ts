import * as vscode from 'vscode';
import * as fs from 'fs';
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

  public async openCustomDocument(uri: vscode.Uri): Promise<vscode.CustomDocument> {
    return { uri, dispose: () => {} };
  }

  public async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
    };

    const pdfData = fs.readFileSync(document.uri.fsPath);
    const base64Pdf = pdfData.toString('base64');

    webviewPanel.webview.html = this.getHtmlForWebview(
      webviewPanel.webview,
      base64Pdf,
      document.uri.fsPath
    );
  }

  private getHtmlForWebview(webview: vscode.Webview, base64Pdf: string, filePath: string): string {
    const fileName = path.basename(filePath);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fileName}</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
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
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    
    const pdfData = atob('${base64Pdf}');
    const pdfArray = new Uint8Array(pdfData.length);
    for (let i = 0; i < pdfData.length; i++) {
      pdfArray[i] = pdfData.charCodeAt(i);
    }
    
    let pdfDoc = null;
    let currentPage = 1;
    let scale = 1.0;
    let rendering = false;
    
    const container = document.getElementById('container');
    const loading = document.getElementById('loading');
    const currentPageSpan = document.getElementById('currentPage');
    const totalPagesSpan = document.getElementById('totalPages');
    const zoomLevelSpan = document.getElementById('zoomLevel');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    async function renderPage(pageNum, canvas) {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      const context = canvas.getContext('2d');
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;
    }
    
    async function renderAllPages() {
      if (rendering) return;
      rendering = true;
      
      container.innerHTML = '';
      
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const pageContainer = document.createElement('div');
        pageContainer.className = 'page-container';
        pageContainer.id = 'page-' + i;
        
        const canvas = document.createElement('canvas');
        pageContainer.appendChild(canvas);
        container.appendChild(pageContainer);
        
        await renderPage(i, canvas);
      }
      
      rendering = false;
      updatePageInfo();
    }
    
    function updatePageInfo() {
      currentPageSpan.textContent = currentPage;
      totalPagesSpan.textContent = pdfDoc.numPages;
      zoomLevelSpan.textContent = Math.round(scale * 100);
      
      prevBtn.disabled = currentPage <= 1;
      nextBtn.disabled = currentPage >= pdfDoc.numPages;
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
      renderAllPages();
    });
    
    document.getElementById('zoomOut').addEventListener('click', () => {
      scale = Math.max(scale - 0.25, 0.5);
      renderAllPages();
    });
    
    document.getElementById('fitWidth').addEventListener('click', () => {
      const containerWidth = container.clientWidth - 60;
      if (pdfDoc) {
        pdfDoc.getPage(1).then(page => {
          const viewport = page.getViewport({ scale: 1.0 });
          scale = containerWidth / viewport.width;
          renderAllPages();
        });
      }
    });
    
    // Track current page on scroll
    container.addEventListener('scroll', () => {
      const pages = container.querySelectorAll('.page-container');
      const containerRect = container.getBoundingClientRect();
      
      for (let i = 0; i < pages.length; i++) {
        const pageRect = pages[i].getBoundingClientRect();
        if (pageRect.top <= containerRect.top + 100 && pageRect.bottom > containerRect.top + 100) {
          currentPage = i + 1;
          updatePageInfo();
          break;
        }
      }
    });
    
    // Load PDF
    pdfjsLib.getDocument({ data: pdfArray }).promise.then(pdf => {
      pdfDoc = pdf;
      loading.style.display = 'none';
      prevBtn.disabled = false;
      nextBtn.disabled = pdfDoc.numPages <= 1;
      
      // Auto fit width
      pdf.getPage(1).then(page => {
        const containerWidth = container.clientWidth - 60;
        const viewport = page.getViewport({ scale: 1.0 });
        scale = Math.min(containerWidth / viewport.width, 1.5);
        renderAllPages();
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
