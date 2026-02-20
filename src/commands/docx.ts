import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { PdfOptions } from '../converters';
import { docxToHtml, docxToMarkdown, htmlToPdf } from '../converters';
import { logLine, showLogs } from '../logging';
import {
  checkChromeAvailable,
  getConfig,
  getDefaultOutputPath,
  getDefaultOutputPathForExtension,
  isDocxFile,
  showChromeInstallInstructions,
  showSaveDialog,
} from './shared';

function showSuccessMessage(outputPath: string): void {
  void vscode.window.showInformationMessage(`Successfully converted to: ${outputPath}`);
}

export async function exportDocxToPdf(resourceUri?: vscode.Uri): Promise<void> {
  const config = getConfig();
  logLine(`--- DOCX to PDF @ ${new Date().toISOString()} ---`);

  if (!checkChromeAvailable()) {
    logLine('[chrome] not found');
    await showChromeInstallInstructions();
    return;
  }

  const inputUri: vscode.Uri | undefined = resourceUri;
  if (!inputUri || !isDocxFile(inputUri)) {
    void vscode.window.showErrorMessage('Please select a DOCX file to convert.');
    return;
  }

  const inputPath = inputUri.fsPath;
  const defaultOutputPath = getDefaultOutputPath(inputPath, 'pdf', config);
  const outputUri = await showSaveDialog(defaultOutputPath, 'pdf');
  if (!outputUri) {
    return;
  }

  const outputPath = outputUri.fsPath;

  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logLine(`[mkdir] failed: ${errorMessage}`);
    void vscode.window.showErrorMessage(`Failed to create output directory: ${errorMessage}`);
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Converting DOCX to PDF...',
      cancellable: false,
    },
    async () => {
      try {
        const html = await docxToHtml(inputPath);
        const pdfOptions: PdfOptions = {
          format: config.pdfPageFormat,
          margin: config.pdfMargin,
          baseDir: path.dirname(inputPath),
        };
        await htmlToPdf(html, outputPath, pdfOptions);
        showSuccessMessage(outputPath);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logLine(`[docx-to-pdf] failed: ${errorMessage}`);
        const choice = await vscode.window.showErrorMessage(
          `Conversion failed: ${errorMessage}`,
          'Open Logs'
        );
        if (choice === 'Open Logs') {
          showLogs();
        }
      }
    }
  );
}

export async function convertDocxToMd(resourceUri?: vscode.Uri): Promise<void> {
  logLine(`--- DOCX to Markdown @ ${new Date().toISOString()} ---`);

  const config = getConfig();
  const inputUri: vscode.Uri | undefined = resourceUri;
  if (!inputUri || !isDocxFile(inputUri)) {
    void vscode.window.showErrorMessage('Please select a DOCX file to convert.');
    return;
  }

  const inputPath = inputUri.fsPath;
  const defaultOutputPath = getDefaultOutputPathForExtension(inputPath, '.md', config);

  const markdownFilterLabel = 'Markdown';
  const outputUri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(defaultOutputPath),
    filters: { [markdownFilterLabel]: ['md'] },
    title: 'Save as Markdown',
  });
  if (!outputUri) {
    return;
  }

  const outputPath = outputUri.fsPath;

  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logLine(`[mkdir] failed: ${errorMessage}`);
    void vscode.window.showErrorMessage(`Failed to create output directory: ${errorMessage}`);
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Converting DOCX to Markdown...',
      cancellable: false,
    },
    async () => {
      try {
        const markdown = await docxToMarkdown(inputPath);
        fs.writeFileSync(outputPath, markdown, 'utf-8');

        const document = await vscode.workspace.openTextDocument(outputPath);
        await vscode.window.showTextDocument(document);
        showSuccessMessage(outputPath);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logLine(`[docx-to-md] failed: ${errorMessage}`);
        const choice = await vscode.window.showErrorMessage(
          `Conversion failed: ${errorMessage}`,
          'Open Logs'
        );
        if (choice === 'Open Logs') {
          showLogs();
        }
      }
    }
  );
}
