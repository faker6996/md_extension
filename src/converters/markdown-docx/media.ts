import * as fs from 'fs';
import * as path from 'path';

export function scaleToMaxWidth(
  width: number,
  height: number,
  maxWidth: number
): { width: number; height: number } {
  if (width <= maxWidth) {
    return { width, height };
  }
  const ratio = maxWidth / width;
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

export function scaleToFit(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  if (width <= maxWidth && height <= maxHeight) {
    return { width, height };
  }

  const ratio = Math.min(maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function decodeDataUrl(src: string): Buffer | null {
  const match = src.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/i);
  if (!match) {
    return null;
  }

  const [, , isBase64, data] = match;
  try {
    return isBase64 ? Buffer.from(data, 'base64') : Buffer.from(decodeURIComponent(data), 'utf-8');
  } catch {
    return null;
  }
}

export async function loadImageBuffer(src: string, baseDir: string): Promise<Buffer | null> {
  if (!src) {
    return null;
  }

  if (/^data:/i.test(src)) {
    return decodeDataUrl(src);
  }

  if (/^https?:\/\//i.test(src)) {
    try {
      const response = await fetch(src);
      if (!response.ok) {
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch {
      return null;
    }
  }

  if (/^file:\/\//i.test(src)) {
    try {
      const fileUrl = new URL(src);
      return fs.readFileSync(fileUrl);
    } catch {
      return null;
    }
  }

  const imagePath = path.isAbsolute(src) ? src : path.join(baseDir, src);
  if (!fs.existsSync(imagePath)) {
    return null;
  }

  try {
    return fs.readFileSync(imagePath);
  } catch {
    return null;
  }
}

export function getImageDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) {
    return null;
  }

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      const isSofMarker =
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc;

      if (isSofMarker && offset + 8 < buffer.length) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }

      if (length < 2) {
        break;
      }
      offset += 2 + length;
    }
  }

  return null;
}
