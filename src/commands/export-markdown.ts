import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { DocxOptions, ImageOptions, PdfOptions } from '../converters';
import { htmlToImage, htmlToPdf, markdownToDocx, markdownToHtml } from '../converters';
import { PdfViewerProvider } from '../pdf-viewer';
import { logLine, showLogs } from '../logging';
import {
  checkChromeAvailable,
  ensureFileSavedWithPrompt,
  ExportFormat,
  getActiveMarkdownFile,
  getConfig,
  getDefaultOutputPath,
  isMarkdownFile,
  MdxExporterConfig,
  showChromeInstallInstructions,
  showSaveDialog,
} from './shared';

async function formatDocumentIfPossible(document: vscode.TextDocument): Promise<void> {
  const editorConfig = vscode.workspace.getConfiguration('editor', document.uri);
  const options: vscode.FormattingOptions = {
    tabSize: Number(editorConfig.get<number>('tabSize', 2)),
    insertSpaces: Boolean(editorConfig.get<boolean>('insertSpaces', true)),
  };

  const edits =
    (await vscode.commands.executeCommand<vscode.TextEdit[]>(
      'vscode.executeFormatDocumentProvider',
      document.uri,
      options
    )) ?? [];

  if (!edits.length) {
    return;
  }

  const workspaceEdit = new vscode.WorkspaceEdit();
  workspaceEdit.set(document.uri, edits);
  await vscode.workspace.applyEdit(workspaceEdit);
}

async function prepareDocumentForExport(
  document: vscode.TextDocument,
  config: MdxExporterConfig
): Promise<boolean> {
  if (config.formatBeforeExport) {
    try {
      await formatDocumentIfPossible(document);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logLine(`[format] failed: ${errorMessage}`);
      void vscode.window.showWarningMessage(`Format before export failed: ${errorMessage}`);
    }
  }

  if (config.saveBeforeExport) {
    if (!document.isDirty) {
      return true;
    }
    try {
      return await document.save();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logLine(`[save] failed: ${errorMessage}`);
      void vscode.window.showErrorMessage(`Failed to save before export: ${errorMessage}`);
      return false;
    }
  }

  return await ensureFileSavedWithPrompt(document);
}

function estimateLineWidth(value: string): number {
  const normalized = value.replace(/\t/g, '    ');
  let width = 0;
  for (const ch of normalized) {
    const codePoint = ch.codePointAt(0) ?? 0;
    width += codePoint > 0xff ? 2 : 1;
  }
  return width;
}

function hasWideCodeBlock(content: string, threshold: number): boolean {
  if (threshold <= 0) {
    return false;
  }

  const lines = content.split(/\r?\n/);
  let fence: string | null = null;

  for (const line of lines) {
    const fenceMatch = line.match(/^(```+|~~~+)\s*/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!fence) {
        fence = marker;
      } else if (line.startsWith(fence)) {
        fence = null;
      }
      continue;
    }

    if (fence && estimateLineWidth(line) > threshold) {
      return true;
    }
  }

  return false;
}

async function showSuccessMessage(outputPath: string, config: MdxExporterConfig): Promise<void> {
  const buttons: string[] = [];

  if (config.openAfterExport) {
    buttons.push('Open File');
  }
  buttons.push('Reveal in File Explorer');

  const choice = await vscode.window.showInformationMessage(
    `Successfully exported to: ${outputPath}`,
    ...buttons
  );

  if (choice === 'Open File') {
    const outputUri = vscode.Uri.file(outputPath);
    if (path.extname(outputPath).toLowerCase() === '.pdf') {
      await vscode.commands.executeCommand('vscode.openWith', outputUri, PdfViewerProvider.viewType);
    } else {
      await vscode.env.openExternal(outputUri);
    }
  } else if (choice === 'Reveal in File Explorer') {
    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outputPath));
  }
}

async function runExport(
  inputPath: string,
  outputPath: string,
  format: ExportFormat,
  config: MdxExporterConfig
): Promise<void> {
  const content = fs.readFileSync(inputPath, 'utf-8');
  const baseDir = path.dirname(inputPath);

  if (format === 'pdf') {
    const useWidePage =
      config.autoWidePageForCodeBlocks && hasWideCodeBlock(content, config.wideLineThreshold);
    if (useWidePage) {
      logLine(
        `[pdf] wide page enabled (format: ${config.widePageFormat}, margin: ${config.widePageMargin})`
      );
    }
    const html = markdownToHtml(content, baseDir, config.styles, false, {
      wrapCodeBlocks: !useWidePage,
    });
    const pdfOptions: PdfOptions = {
      format: useWidePage ? config.widePageFormat : config.pdfPageFormat,
      margin: useWidePage ? config.widePageMargin : config.pdfMargin,
      baseDir,
      displayHeaderFooter: config.displayHeaderFooter,
      headerTemplate: config.headerTemplate,
      footerTemplate: config.footerTemplate,
      customStyles: config.styles,
      landscape: useWidePage,
    };
    logLine(`[pdf] Converting with options: ${JSON.stringify(pdfOptions)}`);
    await htmlToPdf(html, outputPath, pdfOptions);
    return;
  }

  if (format === 'png' || format === 'jpeg') {
    const html = markdownToHtml(content, baseDir, config.styles);
    const imageOptions: ImageOptions = {
      baseDir,
      type: format,
      quality: format === 'jpeg' ? config.jpegQuality : undefined,
      fullPage: true,
      customStyles: config.styles,
    };
    logLine(`[${format}] Converting with options: ${JSON.stringify(imageOptions)}`);
    await htmlToImage(html, outputPath, imageOptions);
    return;
  }

  const docxOptions: DocxOptions = { baseDir };
  logLine(`[docx] Converting with options: ${JSON.stringify(docxOptions)}`);
  await markdownToDocx(content, outputPath, docxOptions);
}

async function exportMarkdown(
  format: ExportFormat,
  resourceUri?: vscode.Uri,
  options?: { skipSaveDialog?: boolean }
): Promise<void> {
  const config = getConfig();
  logLine(`--- Export ${format.toUpperCase()} @ ${new Date().toISOString()} ---`);

  if (format === 'pdf' && !checkChromeAvailable()) {
    logLine('[chrome] not found');
    await showChromeInstallInstructions();
    return;
  }

  let inputUri: vscode.Uri | undefined;

  if (resourceUri && isMarkdownFile(resourceUri)) {
    inputUri = resourceUri;
  } else {
    inputUri = getActiveMarkdownFile();
  }

  if (!inputUri) {
    void vscode.window.showErrorMessage('Please open a Markdown file to export.');
    return;
  }

  const document = await vscode.workspace.openTextDocument(inputUri);
  const prepared = await prepareDocumentForExport(document, config);
  if (!prepared) {
    return;
  }

  const inputPath = inputUri.fsPath;
  const defaultOutputPath = getDefaultOutputPath(inputPath, format, config);

  const skipSaveDialog = options?.skipSaveDialog ?? false;
  let outputPath = defaultOutputPath;

  if (!skipSaveDialog) {
    const outputUri = await showSaveDialog(defaultOutputPath, format);
    if (!outputUri) {
      return;
    }
    outputPath = outputUri.fsPath;
  }

  if (skipSaveDialog && fs.existsSync(outputPath) && !config.quickExportOverwrite) {
    const choice = await vscode.window.showWarningMessage(
      `File already exists: ${outputPath}. Overwrite?`,
      'Overwrite',
      'Cancel'
    );
    if (choice !== 'Overwrite') {
      return;
    }
  }

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
      title: `Exporting to ${format.toUpperCase()}...`,
      cancellable: false,
    },
    async () => {
      try {
        await runExport(inputPath, outputPath, format, config);
        await showSuccessMessage(outputPath, config);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logLine(`[export] failed: ${errorMessage}`);
        const choice = await vscode.window.showErrorMessage(
          `Export failed: ${errorMessage}`,
          'Open Logs'
        );
        if (choice === 'Open Logs') {
          showLogs();
        }
      }
    }
  );
}

export async function exportPdf(resourceUri?: vscode.Uri): Promise<void> {
  await exportMarkdown('pdf', resourceUri);
}

export async function quickExportPdf(resourceUri?: vscode.Uri): Promise<void> {
  await exportMarkdown('pdf', resourceUri, { skipSaveDialog: true });
}

export async function exportDocx(resourceUri?: vscode.Uri): Promise<void> {
  await exportMarkdown('docx', resourceUri);
}

export async function quickExportDocx(resourceUri?: vscode.Uri): Promise<void> {
  await exportMarkdown('docx', resourceUri, { skipSaveDialog: true });
}

export async function exportPng(resourceUri?: vscode.Uri): Promise<void> {
  await exportMarkdown('png', resourceUri);
}

export async function exportJpeg(resourceUri?: vscode.Uri): Promise<void> {
  await exportMarkdown('jpeg', resourceUri);
}
