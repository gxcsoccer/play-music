import { createWriteStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { Song } from '../providers/types.js';
import { getProvider } from '../providers/registry.js';
import { sanitizeFilename } from '../utils/format.js';

export interface DownloadProgress {
  downloaded: number;
  total: number;
  percent: number;
}

export async function downloadSong(
  song: Song,
  outputDir: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<string> {
  const provider = getProvider(song.source);
  if (!provider) throw new Error(`Provider ${song.source} not found`);

  const url = await provider.getSongUrl(song);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);

  const contentType = res.headers.get('content-type') ?? '';
  const ext = detectExt(contentType, url);
  const filename = sanitizeFilename(`${song.artist} - ${song.name}.${ext}`);

  mkdirSync(outputDir, { recursive: true });
  const filepath = join(outputDir, filename);

  const total = parseInt(res.headers.get('content-length') ?? '0', 10);
  let downloaded = 0;

  const fileStream = createWriteStream(filepath);
  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  await new Promise<void>((resolve, reject) => {
    fileStream.on('finish', resolve);
    fileStream.on('error', reject);

    (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fileStream.write(value);
        downloaded += value.length;
        if (onProgress && total > 0) {
          onProgress({
            downloaded,
            total,
            percent: Math.floor((downloaded / total) * 100),
          });
        }
      }
      fileStream.end();
    })().catch(reject);
  });

  return filepath;
}

function detectExt(contentType: string, url: string): string {
  if (contentType.includes('flac')) return 'flac';
  if (contentType.includes('ogg')) return 'ogg';
  if (contentType.includes('m4a') || contentType.includes('mp4')) return 'm4a';

  // try from URL
  const urlExt = url.split('?')[0].split('.').pop()?.toLowerCase();
  if (urlExt && ['mp3', 'flac', 'ogg', 'm4a', 'wav', 'aac'].includes(urlExt)) {
    return urlExt;
  }

  return 'mp3';
}
