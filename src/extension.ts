import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

// Configuration interface
interface MdxExporterConfig {
  pandocPath: string;
  outputDirectory: string;
  pdfEngine: string;
  referenceDocx: string;
  openAfterExport: boolean;
}

// Get extension configuration
function getConfig(): MdxExporterConfig {
  const config = vscode.workspace.getConfiguration('mdxExporter');
  return {
    pandocPath: config.get<string>('pandocPath', 'pandoc'),
    outputDirectory: config.get<string>('outputDirectory', ''),
    pdfEngine: config.get<string>('pdfEngine', ''),
    referenceDocx: config.get<string>('referenceDocx', ''),
    openAfterExport: config.get<boolean>('openAfterExport', true),
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

// Ensure file is saved before export
async function ensureFileSaved(document: vscode.TextDocument): Promise<boolean> {
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

// Check if Pandoc is available
async function checkPandocAvailable(pandocPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(pandocPath, ['--version'], { shell: true });
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
}

// Get platform-specific reveal command
function getRevealCommand(): string {
  switch (process.platform) {
    case 'darwin':
      return 'open -R';
    case 'win32':
      return 'explorer /select,';
    default:
      return 'xdg-open';
  }
}

// Show Pandoc installation instructions
async function showPandocInstallInstructions(): Promise<void> {
  const message = 'Pandoc is not found. Please install Pandoc to use export features.';
  const choice = await vscode.window.showErrorMessage(message, 'Installation Guide', 'Dismiss');

  if (choice === 'Installation Guide') {
    let url: string;
    switch (process.platform) {
      case 'darwin':
        url = 'https://pandoc.org/installing.html#macos';
        break;
      case 'win32':
        url = 'https://pandoc.org/installing.html#windows';
        break;
      default:
        url = 'https://pandoc.org/installing.html#linux';
    }
    await vscode.env.openExternal(vscode.Uri.parse(url));
  }
}

// Export format type
type ExportFormat = 'pdf' | 'docx';

// Build Pandoc arguments
function buildPandocArgs(
  inputPath: string,
  outputPath: string,
  format: ExportFormat,
  config: MdxExporterConfig
): string[] {
  const args: string[] = [inputPath, '-o', outputPath];

  // Add PDF engine if specified (only for PDF)
  if (format === 'pdf' && config.pdfEngine) {
    args.push('--pdf-engine', config.pdfEngine);
  }

  // Add reference DOCX if specified (only for DOCX)
  if (format === 'docx' && config.referenceDocx) {
    const refDocPath = config.referenceDocx;
    if (fs.existsSync(refDocPath)) {
      args.push('--reference-doc', refDocPath);
    } else {
      vscode.window.showWarningMessage(
        `Reference DOCX file not found: ${refDocPath}. Using default template.`
      );
    }
  }

  // Enable standalone mode
  args.push('-s');

  return args;
}

// Run Pandoc export
async function runPandocExport(
  inputPath: string,
  outputPath: string,
  format: ExportFormat,
  config: MdxExporterConfig
): Promise<void> {
  const args = buildPandocArgs(inputPath, outputPath, format, config);
  const cwd = path.dirname(inputPath); // Set working directory for relative images

  return new Promise((resolve, reject) => {
    const proc = spawn(config.pandocPath, args, {
      cwd,
      shell: true,
    });

    let stderr = '';

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to start Pandoc: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Pandoc exited with code ${code}: ${stderr}`));
      }
    });
  });
}

// Get default output path
function getDefaultOutputPath(inputPath: string, format: ExportFormat, config: MdxExporterConfig): string {
  const inputDir = path.dirname(inputPath);
  const baseName = path.basename(inputPath, path.extname(inputPath));
  const outputDir = config.outputDirectory || inputDir;
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
    `Successfully exported to: ${path.basename(outputPath)}`,
    ...buttons
  );

  if (choice === 'Open File') {
    await vscode.env.openExternal(vscode.Uri.file(outputPath));
  } else if (choice === 'Reveal in File Explorer') {
    const revealCmd = getRevealCommand();
    if (process.platform === 'linux') {
      // On Linux, open the containing directory
      await vscode.env.openExternal(vscode.Uri.file(path.dirname(outputPath)));
    } else {
      // On macOS and Windows, use native reveal commands
      const { exec } = await import('child_process');
      exec(`${revealCmd} "${outputPath}"`);
    }
  }
}

// Main export function
async function exportMarkdown(format: ExportFormat, resourceUri?: vscode.Uri): Promise<void> {
  const config = getConfig();

  // Check Pandoc availability
  const pandocAvailable = await checkPandocAvailable(config.pandocPath);
  if (!pandocAvailable) {
    await showPandocInstallInstructions();
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
    vscode.window.showErrorMessage('Please open a Markdown file to export.');
    return;
  }

  // Ensure the file is saved
  const document = await vscode.workspace.openTextDocument(inputUri);
  const saved = await ensureFileSaved(document);
  if (!saved) {
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

  // Run export with progress
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Exporting to ${format.toUpperCase()}...`,
      cancellable: false,
    },
    async () => {
      try {
        await runPandocExport(inputPath, outputPath, format, config);
        await showSuccessMessage(outputPath, config);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Export failed: ${errorMessage}`);
      }
    }
  );
}

// Command: Open Preview to Side
async function openPreviewToSide(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isMarkdownFile(editor.document.uri)) {
    vscode.window.showErrorMessage('Please open a Markdown file to preview.');
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

  // Add to subscriptions
  context.subscriptions.push(openPreviewCommand, exportPdfCommand, exportDocxCommand);

  // Log activation
  console.log('MDX Exporter Lite is now active!');
}

// Extension deactivation
export function deactivate(): void {
  console.log('MDX Exporter Lite is now deactivated.');
}
