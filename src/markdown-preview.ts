import * as vscode from 'vscode';
import * as path from 'path';
import { markdownToHtml } from './markdown-converter';

/**
 * Manages the Markdown Preview WebView panel
 */
export class MarkdownPreviewPanel {
  public static currentPanel: MarkdownPreviewPanel | undefined;
  private static readonly viewType = 'mdxExporter.preview';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private document: vscode.TextDocument | undefined;
  private disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, document?: vscode.TextDocument) {
    const column = vscode.ViewColumn.Beside;

    // If we already have a panel, show it
    if (MarkdownPreviewPanel.currentPanel) {
      MarkdownPreviewPanel.currentPanel.panel.reveal(column);
      if (document) {
        MarkdownPreviewPanel.currentPanel.update(document);
      }
      return MarkdownPreviewPanel.currentPanel;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      MarkdownPreviewPanel.viewType,
      'MDX Preview',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.file('/')],
      }
    );

    MarkdownPreviewPanel.currentPanel = new MarkdownPreviewPanel(panel, extensionUri, document);
    return MarkdownPreviewPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    document?: vscode.TextDocument
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.document = document;

    // Set initial content
    this.updateContent();

    // Listen for when the panel is disposed
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Update content when the active document changes
    vscode.workspace.onDidChangeTextDocument(
      (e) => {
        if (this.document && e.document.uri.toString() === this.document.uri.toString()) {
          this.updateContent();
        }
      },
      null,
      this.disposables
    );

    // Update when switching to a different markdown file
    vscode.window.onDidChangeActiveTextEditor(
      (editor) => {
        if (editor && this.isMarkdownFile(editor.document)) {
          this.document = editor.document;
          this.updateContent();
        }
      },
      null,
      this.disposables
    );
  }

  public update(document: vscode.TextDocument) {
    this.document = document;
    this.updateContent();
  }

  private isMarkdownFile(document: vscode.TextDocument): boolean {
    return (
      document.languageId === 'markdown' ||
      document.fileName.toLowerCase().endsWith('.md') ||
      document.fileName.toLowerCase().endsWith('.markdown')
    );
  }

  private updateContent() {
    if (!this.document) {
      this.panel.webview.html = this.getEmptyHtml();
      return;
    }

    const content = this.document.getText();
    const baseDir = path.dirname(this.document.uri.fsPath);

    // Get custom styles from configuration
    const config = vscode.workspace.getConfiguration('mdxExporter');
    const customStyles: string[] = config.get('styles', []);

    // Generate HTML using the same function as PDF export
    let html = markdownToHtml(content, baseDir, customStyles);

    // Inject CSP meta tag to allow CDN scripts for WebView
    // This allows Mermaid, KaTeX, and PlantUML to load from jsdelivr
    const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${this.panel.webview.cspSource} https: data:; style-src ${this.panel.webview.cspSource} 'unsafe-inline' https://cdn.jsdelivr.net; script-src 'unsafe-inline' https://cdn.jsdelivr.net; font-src https://cdn.jsdelivr.net;">`;

    // Insert CSP meta tag after <head>
    html = html.replace('<head>', `<head>\n  ${cspMeta}`);

    // Update webview content
    this.panel.webview.html = html;
    this.panel.title = `Preview: ${path.basename(this.document.fileName)}`;
  }

  private getEmptyHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MDX Preview</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      padding: 20px;
      color: #666;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 80vh;
    }
  </style>
</head>
<body>
  <p>Open a Markdown file to see the preview.</p>
</body>
</html>`;
  }

  public dispose() {
    MarkdownPreviewPanel.currentPanel = undefined;

    this.panel.dispose();

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
