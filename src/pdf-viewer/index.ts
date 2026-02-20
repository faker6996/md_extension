import * as path from 'path';
import * as vscode from 'vscode';
import { buildPdfViewerHtml } from './template';

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
    const pdfViewerUri = webviewPanel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'pdfjs', 'pdf_viewer.min.js')
    );
    const pdfViewerCssUri = webviewPanel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'pdfjs', 'pdf_viewer.css')
    );

    webviewPanel.webview.html = buildPdfViewerHtml({
      fileName: path.basename(document.uri.fsPath),
      pdfUri: pdfUri.toString(),
      pdfJsUri: pdfJsUri.toString(),
      pdfWorkerUri: pdfWorkerUri.toString(),
      pdfViewerUri: pdfViewerUri.toString(),
      pdfViewerCssUri: pdfViewerCssUri.toString(),
    });
  }
}

export async function openPdfInViewer(pdfPath: string): Promise<void> {
  const uri = vscode.Uri.file(pdfPath);
  await vscode.commands.executeCommand('vscode.openWith', uri, PdfViewerProvider.viewType);
}
