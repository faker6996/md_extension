import * as vscode from 'vscode';
import {
  convertDocxToMd,
  exportDocx,
  exportDocxToPdf,
  exportJpeg,
  exportPdf,
  exportPng,
  openPreviewToSide,
  quickExportDocx,
  quickExportPdf,
  setPreviewContext,
} from './commands';
import { logLine, initOutputChannel } from './logging';
import { PdfViewerProvider } from './pdf-viewer';

export function activate(context: vscode.ExtensionContext): void {
  setPreviewContext(context);
  const outputChannel = initOutputChannel();

  const openPreviewCommand = vscode.commands.registerCommand(
    'mdxExporter.openPreviewToSide',
    openPreviewToSide
  );

  const exportPdfCommand = vscode.commands.registerCommand('mdxExporter.exportPdf', exportPdf);
  const quickExportPdfCommand = vscode.commands.registerCommand(
    'mdxExporter.quickExportPdf',
    quickExportPdf
  );
  const exportDocxCommand = vscode.commands.registerCommand('mdxExporter.exportDocx', exportDocx);
  const quickExportDocxCommand = vscode.commands.registerCommand(
    'mdxExporter.quickExportDocx',
    quickExportDocx
  );
  const exportPngCommand = vscode.commands.registerCommand('mdxExporter.exportPng', exportPng);
  const exportJpegCommand = vscode.commands.registerCommand('mdxExporter.exportJpeg', exportJpeg);
  const docxToPdfCommand = vscode.commands.registerCommand('mdxExporter.docxToPdf', exportDocxToPdf);
  const docxToMarkdownCommand = vscode.commands.registerCommand(
    'mdxExporter.docxToMarkdown',
    convertDocxToMd
  );

  const pdfViewerProvider = PdfViewerProvider.register(context);

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

  logLine('MDX Exporter Lite is now active.');
}

export function deactivate(): void {
  logLine('MDX Exporter Lite is now deactivated.');
}
