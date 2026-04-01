import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';

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
  const normalized = stripWrappingQuotes(value);
  if (!normalized) {
    return normalized;
  }
  if (normalized === '~') {
    return os.homedir();
  }
  if (normalized.startsWith('~/') || normalized.startsWith('~\\')) {
    return path.join(os.homedir(), normalized.slice(2));
  }
  return normalized;
}

function isExecutableFile(candidatePath: string): boolean {
  try {
    fs.accessSync(candidatePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function firstExistingPath(candidates: string[]): string | null {
  for (const candidate of candidates) {
    const normalized = expandUserPath(candidate);
    if (!normalized) {
      continue;
    }
    if (isExecutableFile(normalized)) {
      return normalized;
    }
  }
  return null;
}

function findExecutableOnPath(binaryNames: string[]): string | null {
  const command = process.platform === 'win32' ? 'where' : 'which';

  for (const binaryName of binaryNames) {
    const result = spawnSync(command, [binaryName], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    if (result.status !== 0) {
      continue;
    }

    const resolved = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);

    if (resolved && isExecutableFile(resolved)) {
      return resolved;
    }
  }

  return null;
}

export function resolveChromePathCandidates(preferredPath?: string | null): string[] {
  const possiblePaths: string[] = [];
  const envCandidates = [
    preferredPath ?? '',
    process.env.PUPPETEER_EXECUTABLE_PATH ?? '',
    process.env.CHROME_PATH ?? '',
    process.env.GOOGLE_CHROME_BIN ?? '',
    process.env.BROWSER ?? '',
  ];

  if (process.platform === 'win32') {
    possiblePaths.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    );
  } else if (process.platform === 'darwin') {
    possiblePaths.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    );
  } else {
    // Linux
    possiblePaths.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
      '/usr/bin/microsoft-edge'
    );
  }

  return [...envCandidates, ...possiblePaths];
}

// Find Chrome/Chromium executable path
export function findChromePath(preferredPath?: string | null): string | null {
  const directMatch = firstExistingPath(resolveChromePathCandidates(preferredPath));
  if (directMatch) {
    return directMatch;
  }

  const pathMatch = findExecutableOnPath([
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    'microsoft-edge',
    'msedge',
  ]);
  if (pathMatch) {
    return pathMatch;
  }

  return null;
}
