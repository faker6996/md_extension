import * as vscode from 'vscode';
import { MarkdownPreviewPanel } from '../preview';
import { isMarkdownFile } from './shared';

let extensionContext: vscode.ExtensionContext | undefined;

export function setPreviewContext(context: vscode.ExtensionContext): void {
  extensionContext = context;
}

export function openPreviewToSide(): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isMarkdownFile(editor.document.uri)) {
    void vscode.window.showErrorMessage('Please open a Markdown file to preview.');
    return;
  }

  if (extensionContext) {
    MarkdownPreviewPanel.createOrShow(extensionContext.extensionUri, editor.document);
  }
}
