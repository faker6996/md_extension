import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | undefined;

export function initOutputChannel(): vscode.OutputChannel {
  outputChannel = vscode.window.createOutputChannel('MDX Exporter Lite');
  return outputChannel;
}

export function logLine(message: string): void {
  outputChannel?.appendLine(message);
}

export function showLogs(preserveFocus = true): void {
  outputChannel?.show(preserveFocus);
}
