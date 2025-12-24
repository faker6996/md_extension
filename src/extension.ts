import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { PaperFormat } from 'puppeteer-core';
import {
  markdownToHtml,
  htmlToPdf,
  htmlToImage,
  markdownToDocx,
  findChromePath,
  PdfOptions,
  ImageOptions,
  DocxOptions,
} from './markdown-converter';
import { PdfViewerProvider } from './pdf-viewer';
import { docxToHtml, docxToMarkdown } from './docx-converter';
import { MarkdownPreviewPanel } from './markdown-preview';

// Configuration interface
interface MdxExporterConfig {
  outputDirectory: string;
  openAfterExport: boolean;
  saveBeforeExport: boolean;
  formatBeforeExport: boolean;
  quickExportOverwrite: boolean;
  pdfPageFormat: PaperFormat;
  pdfMargin: string;
  displayHeaderFooter: boolean;
  headerTemplate: string;
  footerTemplate: string;
  styles: string[];
  jpegQuality: number;
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
    quickExportOverwrite: config.get<boolean>('quickExportOverwrite', false),
    pdfPageFormat: config.get<PaperFormat>('pdfPageFormat', 'A4'),
    pdfMargin: config.get<string>('pdfMargin', '20mm'),
    displayHeaderFooter: config.get<boolean>('displayHeaderFooter', false),
    headerTemplate: config.get<string>('headerTemplate', ''),
    footerTemplate: config.get<string>(
      'footerTemplate',
      '<div style="font-size: 9px; margin: 0 auto;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'
    ),
    styles: config.get<string[]>('styles', []),
    jpegQuality: config.get<number>('jpegQuality', 90),
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

// Check if file is a DOCX file
function isDocxFile(uri: vscode.Uri | undefined): boolean {
  if (!uri) {
    return false;
  }
  const ext = path.extname(uri.fsPath).toLowerCase();
  return ext === '.docx';
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
type ExportFormat = 'pdf' | 'docx' | 'png' | 'jpeg';

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
function getDefaultOutputPathForExtension(
  inputPath: string,
  outputExtension: string,
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
  return path.join(outputDir, baseName + outputExtension);
}

function getDefaultOutputPath(
  inputPath: string,
  format: ExportFormat,
  config: MdxExporterConfig
): string {
  const extMap: Record<ExportFormat, string> = {
    pdf: '.pdf',
    docx: '.docx',
    png: '.png',
    jpeg: '.jpg',
  };
  return getDefaultOutputPathForExtension(inputPath, extMap[format], config);
}

// Show save dialog for output file
async function showSaveDialog(
  defaultPath: string,
  format: ExportFormat
): Promise<vscode.Uri | undefined> {
  const filterMap: Record<ExportFormat, { label: string; ext: string[] }> = {
    pdf: { label: 'PDF Document', ext: ['pdf'] },
    docx: { label: 'Word Document', ext: ['docx'] },
    png: { label: 'PNG Image', ext: ['png'] },
    jpeg: { label: 'JPEG Image', ext: ['jpg', 'jpeg'] },
  };

  const filter = filterMap[format];

  return await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(defaultPath),
    filters: {
      [filter.label]: filter.ext,
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
    const outputUri = vscode.Uri.file(outputPath);
    if (path.extname(outputPath).toLowerCase() === '.pdf') {
      await vscode.commands.executeCommand(
        'vscode.openWith',
        outputUri,
        PdfViewerProvider.viewType
      );
    } else {
      await vscode.env.openExternal(outputUri);
    }
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
    const html = markdownToHtml(content, baseDir, config.styles);
    const pdfOptions: PdfOptions = {
      format: config.pdfPageFormat,
      margin: config.pdfMargin,
      baseDir,
      displayHeaderFooter: config.displayHeaderFooter,
      headerTemplate: config.headerTemplate,
      footerTemplate: config.footerTemplate,
      customStyles: config.styles,
    };
    logLine(`[pdf] Converting with options: ${JSON.stringify(pdfOptions)}`);
    await htmlToPdf(html, outputPath, pdfOptions);
  } else if (format === 'png' || format === 'jpeg') {
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
  } else {
    const docxOptions: DocxOptions = { baseDir };
    logLine(`[docx] Converting with options: ${JSON.stringify(docxOptions)}`);
    await markdownToDocx(content, outputPath, docxOptions);
  }
}

// Main export function
async function exportMarkdown(
  format: ExportFormat,
  resourceUri?: vscode.Uri,
  options?: { skipSaveDialog?: boolean }
): Promise<void> {
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

  const skipSaveDialog = options?.skipSaveDialog ?? false;
  let outputPath = defaultOutputPath;

  if (!skipSaveDialog) {
    const outputUri = await showSaveDialog(defaultOutputPath, format);
    if (!outputUri) {
      return; // User cancelled
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

// Store extension context for preview
let extensionContext: vscode.ExtensionContext | undefined;

// Command: Open Preview to Side (with Mermaid support)
async function openPreviewToSide(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isMarkdownFile(editor.document.uri)) {
    void vscode.window.showErrorMessage('Please open a Markdown file to preview.');
    return;
  }

  if (extensionContext) {
    MarkdownPreviewPanel.createOrShow(extensionContext.extensionUri, editor.document);
  }
}

// Command: Export to PDF
async function exportPdf(resourceUri?: vscode.Uri): Promise<void> {
  await exportMarkdown('pdf', resourceUri);
}

// Command: Quick Export to PDF (no save dialog)
async function quickExportPdf(resourceUri?: vscode.Uri): Promise<void> {
  await exportMarkdown('pdf', resourceUri, { skipSaveDialog: true });
}

// Command: Export to DOCX
async function exportDocx(resourceUri?: vscode.Uri): Promise<void> {
  await exportMarkdown('docx', resourceUri);
}

// Command: Quick Export to DOCX (no save dialog)
async function quickExportDocx(resourceUri?: vscode.Uri): Promise<void> {
  await exportMarkdown('docx', resourceUri, { skipSaveDialog: true });
}

// Command: Export to PNG
async function exportPng(resourceUri?: vscode.Uri): Promise<void> {
  await exportMarkdown('png', resourceUri);
}

// Command: Export to JPEG
async function exportJpeg(resourceUri?: vscode.Uri): Promise<void> {
  await exportMarkdown('jpeg', resourceUri);
}

// Command: Convert DOCX to PDF
async function exportDocxToPdf(resourceUri?: vscode.Uri): Promise<void> {
  const config = getConfig();
  logLine(`--- DOCX to PDF @ ${new Date().toISOString()} ---`);

  // Check Chrome availability
  if (!checkChromeAvailable()) {
    logLine('[chrome] not found');
    await showChromeInstallInstructions();
    return;
  }

  // Get input file
  const inputUri: vscode.Uri | undefined = resourceUri;
  if (!inputUri || !isDocxFile(inputUri)) {
    void vscode.window.showErrorMessage('Please select a DOCX file to convert.');
    return;
  }

  const inputPath = inputUri.fsPath;
  const defaultOutputPath = getDefaultOutputPath(inputPath, 'pdf', config);

  // Show save dialog
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

  // Run export with progress
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
        await showSuccessMessage(outputPath, config);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logLine(`[docx-to-pdf] failed: ${errorMessage}`);
        const choice = await vscode.window.showErrorMessage(
          `Conversion failed: ${errorMessage}`,
          'Open Logs'
        );
        if (choice === 'Open Logs') {
          outputChannel?.show(true);
        }
      }
    }
  );
}

// Command: Convert DOCX to Markdown
async function convertDocxToMd(resourceUri?: vscode.Uri): Promise<void> {
  logLine(`--- DOCX to Markdown @ ${new Date().toISOString()} ---`);

  const config = getConfig();

  // Get input file
  const inputUri: vscode.Uri | undefined = resourceUri;
  if (!inputUri || !isDocxFile(inputUri)) {
    void vscode.window.showErrorMessage('Please select a DOCX file to convert.');
    return;
  }

  const inputPath = inputUri.fsPath;
  const defaultOutputPath = getDefaultOutputPathForExtension(inputPath, '.md', config);

  // Show save dialog
  const outputUri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(defaultOutputPath),
    filters: {
      Markdown: ['md'],
    },
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

  // Run conversion with progress
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

        // Open the created markdown file
        const document = await vscode.workspace.openTextDocument(outputPath);
        await vscode.window.showTextDocument(document);

        void vscode.window.showInformationMessage(`Successfully converted to: ${outputPath}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logLine(`[docx-to-md] failed: ${errorMessage}`);
        const choice = await vscode.window.showErrorMessage(
          `Conversion failed: ${errorMessage}`,
          'Open Logs'
        );
        if (choice === 'Open Logs') {
          outputChannel?.show(true);
        }
      }
    }
  );
}

// Extension activation
export function activate(context: vscode.ExtensionContext): void {
  extensionContext = context;
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

  const quickExportPdfCommand = vscode.commands.registerCommand(
    'mdxExporter.quickExportPdf',
    (resourceUri?: vscode.Uri) => quickExportPdf(resourceUri)
  );

  const exportDocxCommand = vscode.commands.registerCommand(
    'mdxExporter.exportDocx',
    (resourceUri?: vscode.Uri) => exportDocx(resourceUri)
  );

  const quickExportDocxCommand = vscode.commands.registerCommand(
    'mdxExporter.quickExportDocx',
    (resourceUri?: vscode.Uri) => quickExportDocx(resourceUri)
  );

  const exportPngCommand = vscode.commands.registerCommand(
    'mdxExporter.exportPng',
    (resourceUri?: vscode.Uri) => exportPng(resourceUri)
  );

  const exportJpegCommand = vscode.commands.registerCommand(
    'mdxExporter.exportJpeg',
    (resourceUri?: vscode.Uri) => exportJpeg(resourceUri)
  );

  const docxToPdfCommand = vscode.commands.registerCommand(
    'mdxExporter.docxToPdf',
    (resourceUri?: vscode.Uri) => exportDocxToPdf(resourceUri)
  );

  const docxToMarkdownCommand = vscode.commands.registerCommand(
    'mdxExporter.docxToMarkdown',
    (resourceUri?: vscode.Uri) => convertDocxToMd(resourceUri)
  );

  // Register PDF Viewer
  const pdfViewerProvider = PdfViewerProvider.register(context);

  // Add to subscriptions
  context.subscriptions.push(
    outputChannel,
    openPreviewCommand,
    exportPdfCommand,
    quickExportPdfCommand,
    exportDocxCommand,
    quickExportDocxCommand,
    exportPngCommand,
    exportJpegCommand,
    docxToPdfCommand,
    docxToMarkdownCommand,
    pdfViewerProvider
  );

  // Log activation
  console.log('MDX Exporter Lite is now active!');
}

// Extension deactivation
export function deactivate(): void {
  console.log('MDX Exporter Lite is now deactivated.');
}
