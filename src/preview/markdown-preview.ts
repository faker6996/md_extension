import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { markdownToHtml } from '../converters';

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
        localResourceRoots: MarkdownPreviewPanel.deduplicateUris([
          extensionUri,
          ...MarkdownPreviewPanel.getWorkspaceRootUris(),
          ...(document ? [vscode.Uri.file(path.dirname(document.uri.fsPath))] : []),
        ]),
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

  private static getWorkspaceRootUris(): vscode.Uri[] {
    return (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri);
  }

  private static deduplicateUris(uris: vscode.Uri[]): vscode.Uri[] {
    const seen = new Set<string>();
    const deduplicated: vscode.Uri[] = [];
    for (const uri of uris) {
      const key = uri.toString();
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(uri);
      }
    }
    return deduplicated;
  }

  private resolveLocalResourceRoots(baseDir: string, customStyles: string[]): vscode.Uri[] {
    const styleRoots = customStyles.map((stylePath) => {
      const fullPath = path.isAbsolute(stylePath) ? stylePath : path.join(baseDir, stylePath);
      return vscode.Uri.file(path.dirname(fullPath));
    });

    return MarkdownPreviewPanel.deduplicateUris([
      this.extensionUri,
      vscode.Uri.file(baseDir),
      ...MarkdownPreviewPanel.getWorkspaceRootUris(),
      ...styleRoots,
    ]);
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
    const allowRawHtmlInPreview = config.get<boolean>('allowRawHtmlInPreview', false);
    const allowUnsafeEvalInPreview = config.get<boolean>('allowUnsafeEvalInPreview', false);
    const nonce = crypto.randomBytes(16).toString('base64');
    const unsafeEvalDirective = allowUnsafeEvalInPreview ? " 'unsafe-eval'" : '';

    this.panel.webview.options = {
      ...this.panel.webview.options,
      localResourceRoots: this.resolveLocalResourceRoots(baseDir, customStyles),
    };

    // Generate HTML using the same function as PDF export
    let html = markdownToHtml(content, baseDir, customStyles, true, {
      allowRawHtml: allowRawHtmlInPreview,
      scriptNonce: nonce,
      styleNonce: nonce,
    });

    // Use nonce-based CSP for inline scripts/styles generated by markdownToHtml.
    const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${this.panel.webview.cspSource} https: data:; style-src ${this.panel.webview.cspSource} https://cdn.jsdelivr.net 'nonce-${nonce}'; script-src ${this.panel.webview.cspSource} https://cdn.jsdelivr.net 'nonce-${nonce}'${unsafeEvalDirective}; font-src ${this.panel.webview.cspSource} https://cdn.jsdelivr.net data:;">`;

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
