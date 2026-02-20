import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { PaperFormat } from 'puppeteer-core';
import { findChromePath } from '../converters';

export interface MdxExporterConfig {
  outputDirectory: string;
  openAfterExport: boolean;
  saveBeforeExport: boolean;
  formatBeforeExport: boolean;
  quickExportOverwrite: boolean;
  pdfPageFormat: PaperFormat;
  pdfMargin: string;
  autoWidePageForCodeBlocks: boolean;
  wideLineThreshold: number;
  widePageFormat: PaperFormat;
  widePageMargin: string;
  displayHeaderFooter: boolean;
  headerTemplate: string;
  footerTemplate: string;
  styles: string[];
  jpegQuality: number;
}

export type ExportFormat = 'pdf' | 'docx' | 'png' | 'jpeg';

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

export function getConfig(): MdxExporterConfig {
  const config = vscode.workspace.getConfiguration('mdxExporter');
  return {
    outputDirectory: expandUserPath(config.get<string>('outputDirectory', '')),
    openAfterExport: config.get<boolean>('openAfterExport', true),
    saveBeforeExport: config.get<boolean>('saveBeforeExport', true),
    formatBeforeExport: config.get<boolean>('formatBeforeExport', true),
    quickExportOverwrite: config.get<boolean>('quickExportOverwrite', false),
    pdfPageFormat: config.get<PaperFormat>('pdfPageFormat', 'A4'),
    pdfMargin: config.get<string>('pdfMargin', '20mm'),
    autoWidePageForCodeBlocks: config.get<boolean>('autoWidePageForCodeBlocks', true),
    wideLineThreshold: config.get<number>('wideLineThreshold', 140),
    widePageFormat: config.get<PaperFormat>('widePageFormat', 'A3'),
    widePageMargin: config.get<string>('widePageMargin', '10mm'),
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

export function isMarkdownFile(uri: vscode.Uri | undefined): boolean {
  if (!uri) {
    return false;
  }
  const ext = path.extname(uri.fsPath).toLowerCase();
  return ext === '.md' || ext === '.markdown' || ext === '.mdown';
}

export function isDocxFile(uri: vscode.Uri | undefined): boolean {
  if (!uri) {
    return false;
  }
  const ext = path.extname(uri.fsPath).toLowerCase();
  return ext === '.docx';
}

export function getActiveMarkdownFile(): vscode.Uri | undefined {
  const editor = vscode.window.activeTextEditor;
  if (editor && isMarkdownFile(editor.document.uri)) {
    return editor.document.uri;
  }
  return undefined;
}

export async function ensureFileSavedWithPrompt(document: vscode.TextDocument): Promise<boolean> {
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

export function getDefaultOutputPathForExtension(
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

export function getDefaultOutputPath(
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

export async function showSaveDialog(
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

export function checkChromeAvailable(): boolean {
  return findChromePath() !== null;
}

export async function showChromeInstallInstructions(): Promise<void> {
  const message =
    'Chrome/Chromium not found. Please install Google Chrome, Chromium, or Microsoft Edge for PDF export.';
  const choice = await vscode.window.showErrorMessage(message, 'Download Chrome', 'Dismiss');

  if (choice === 'Download Chrome') {
    await vscode.env.openExternal(vscode.Uri.parse('https://www.google.com/chrome/'));
  }
}
