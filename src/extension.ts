import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { PaperFormat } from 'puppeteer-core';
import {
  markdownToHtml,
  htmlToPdf,
  markdownToDocx,
  findChromePath,
  PdfOptions,
  DocxOptions,
} from './markdown-converter';
import { PdfViewerProvider, openPdfInViewer } from './pdf-viewer';

// Configuration interface
interface MdxExporterConfig {
  outputDirectory: string;
  openAfterExport: boolean;
  saveBeforeExport: boolean;
  formatBeforeExport: boolean;
  pdfPageFormat: PaperFormat;
  pdfMargin: string;
}

let outputChannel: vscode.OutputChannel | undefined;

function logLine(message: string): void {
  outputChannel?.appendLine(message);
}

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function expandUserPath(value: string): string {
  const sanitized = stripWrappingQuotes(value);
  if (!sanitized) {
    return sanitized;
  }
  if (sanitized === '~') {
    return os.homedir();
  }
  if (sanitized.startsWith('~/') || sanitized.startsWith('~\\')) {
    return path.join(os.homedir(), sanitized.slice(2));
  }
  return sanitized;
}

// Get extension configuration
function getConfig(): MdxExporterConfig {
  const config = vscode.workspace.getConfiguration('mdxExporter');
  return {
    outputDirectory: expandUserPath(config.get<string>('outputDirectory', '')),
    openAfterExport: config.get<boolean>('openAfterExport', true),
    saveBeforeExport: config.get<boolean>('saveBeforeExport', true),
    formatBeforeExport: config.get<boolean>('formatBeforeExport', true),
    pdfPageFormat: config.get<PaperFormat>('pdfPageFormat', 'A4'),
    pdfMargin: config.get<string>('pdfMargin', '20mm'),
  };
}

// Check if file is a Markdown file
function isMarkdownFile(uri: vscode.Uri | undefined): boolean {
  if (!uri) {
    return false;
  }
  const ext = path.extname(uri.fsPath).toLowerCase();
  return ext === '.md' || ext === '.markdown' || ext === '.mdown';
}

// Get the active Markdown file URI
function getActiveMarkdownFile(): vscode.Uri | undefined {
  const editor = vscode.window.activeTextEditor;
  if (editor && isMarkdownFile(editor.document.uri)) {
    return editor.document.uri;
  }
  return undefined;
}

// Ensure file is saved before export (prompt-based)
async function ensureFileSavedWithPrompt(document: vscode.TextDocument): Promise<boolean> {
  if (document.isDirty) {
    const choice = await vscode.window.showWarningMessage(
      'The file has unsaved changes. Save before exporting?',
      'Save',
      'Cancel'
    );
    if (choice === 'Save') {
      return await document.save();
    }
    return false;
  }
  return true;
}

// Check if Chrome/Chromium is available
function checkChromeAvailable(): boolean {
  const chromePath = findChromePath();
  return chromePath !== null;
}

// Show Chrome installation instructions
async function showChromeInstallInstructions(): Promise<void> {
  const message =
    'Chrome/Chromium not found. Please install Google Chrome, Chromium, or Microsoft Edge for PDF export.';
  const choice = await vscode.window.showErrorMessage(message, 'Download Chrome', 'Dismiss');

  if (choice === 'Download Chrome') {
    await vscode.env.openExternal(vscode.Uri.parse('https://www.google.com/chrome/'));
  }
}

// Export format type
type ExportFormat = 'pdf' | 'docx';

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

// Get default output path
function getDefaultOutputPath(
  inputPath: string,
  format: ExportFormat,
  config: MdxExporterConfig
): string {
  const inputDir = path.dirname(inputPath);
  const baseName = path.basename(inputPath, path.extname(inputPath));
  const configuredOutputDir = config.outputDirectory;
  let outputDir = inputDir;

  if (configuredOutputDir) {
    if (path.isAbsolute(configuredOutputDir)) {
      outputDir = configuredOutputDir;
    } else {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(inputPath));
      const baseDir = workspaceFolder?.uri.fsPath ?? inputDir;
      outputDir = path.resolve(baseDir, configuredOutputDir);
    }
  }
  const extension = format === 'pdf' ? '.pdf' : '.docx';
  return path.join(outputDir, baseName + extension);
}

// Show save dialog for output file
async function showSaveDialog(
  defaultPath: string,
  format: ExportFormat
): Promise<vscode.Uri | undefined> {
  const filterLabel = format === 'pdf' ? 'PDF Document' : 'Word Document';
  const filterExt = format === 'pdf' ? ['pdf'] : ['docx'];

  return await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(defaultPath),
    filters: {
      [filterLabel]: filterExt,
    },
    title: `Export as ${format.toUpperCase()}`,
  });
}

// Show success message with action buttons
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
    await vscode.env.openExternal(vscode.Uri.file(outputPath));
  } else if (choice === 'Reveal in File Explorer') {
    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outputPath));
  }
}

// Run export using built-in converters
async function runExport(
  inputPath: string,
  outputPath: string,
  format: ExportFormat,
  config: MdxExporterConfig
): Promise<void> {
  const content = fs.readFileSync(inputPath, 'utf-8');
  const baseDir = path.dirname(inputPath);

  if (format === 'pdf') {
    const html = markdownToHtml(content, baseDir);
    const pdfOptions: PdfOptions = {
      format: config.pdfPageFormat,
      margin: config.pdfMargin,
      baseDir,
    };
    logLine(`[pdf] Converting with options: ${JSON.stringify(pdfOptions)}`);
    await htmlToPdf(html, outputPath, pdfOptions);
  } else {
    const docxOptions: DocxOptions = { baseDir };
    logLine(`[docx] Converting with options: ${JSON.stringify(docxOptions)}`);
    await markdownToDocx(content, outputPath, docxOptions);
  }
}

// Main export function
async function exportMarkdown(format: ExportFormat, resourceUri?: vscode.Uri): Promise<void> {
  const config = getConfig();
  logLine(`--- Export ${format.toUpperCase()} @ ${new Date().toISOString()} ---`);

  // Check Chrome availability for PDF export
  if (format === 'pdf' && !checkChromeAvailable()) {
    logLine('[chrome] not found');
    await showChromeInstallInstructions();
    return;
  }

  // Get input file
  let inputUri: vscode.Uri | undefined;

  if (resourceUri && isMarkdownFile(resourceUri)) {
    // Called from context menu on a file
    inputUri = resourceUri;
  } else {
    // Called from command palette or editor title button
    inputUri = getActiveMarkdownFile();
  }

  if (!inputUri) {
    void vscode.window.showErrorMessage('Please open a Markdown file to export.');
    return;
  }

  // Ensure the file is saved
  const document = await vscode.workspace.openTextDocument(inputUri);
  const prepared = await prepareDocumentForExport(document, config);
  if (!prepared) {
    return;
  }

  const inputPath = inputUri.fsPath;
  const defaultOutputPath = getDefaultOutputPath(inputPath, format, config);

  // Show save dialog
  const outputUri = await showSaveDialog(defaultOutputPath, format);
  if (!outputUri) {
    return; // User cancelled
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

  // Run export with progress
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
          outputChannel?.show(true);
        }
      }
    }
  );
}

// Command: Open Preview to Side
async function openPreviewToSide(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isMarkdownFile(editor.document.uri)) {
    void vscode.window.showErrorMessage('Please open a Markdown file to preview.');
    return;
  }

  await vscode.commands.executeCommand('markdown.showPreviewToSide');
}

// Command: Export to PDF
async function exportPdf(resourceUri?: vscode.Uri): Promise<void> {
  await exportMarkdown('pdf', resourceUri);
}

// Command: Export to DOCX
async function exportDocx(resourceUri?: vscode.Uri): Promise<void> {
  await exportMarkdown('docx', resourceUri);
}

// Extension activation
export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel('MDX Exporter Lite');

  // Register commands
  const openPreviewCommand = vscode.commands.registerCommand(
    'mdxExporter.openPreviewToSide',
    openPreviewToSide
  );

  const exportPdfCommand = vscode.commands.registerCommand(
    'mdxExporter.exportPdf',
    (resourceUri?: vscode.Uri) => exportPdf(resourceUri)
  );

  const exportDocxCommand = vscode.commands.registerCommand(
    'mdxExporter.exportDocx',
    (resourceUri?: vscode.Uri) => exportDocx(resourceUri)
  );

  // Register PDF Viewer
  const pdfViewerProvider = PdfViewerProvider.register(context);

  // Add to subscriptions
  context.subscriptions.push(
    outputChannel,
    openPreviewCommand,
    exportPdfCommand,
    exportDocxCommand,
    pdfViewerProvider
  );

  // Log activation
  console.log('MDX Exporter Lite is now active!');
}

// Extension deactivation
export function deactivate(): void {
  console.log('MDX Exporter Lite is now deactivated.');
}
