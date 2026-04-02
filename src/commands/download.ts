import { searchAll, getProvider } from '../providers/registry.js';
import { SourceName, Song, success, fail } from '../providers/types.js';
import { downloadSong } from '../download/downloader.js';
import { join } from 'node:path';

interface DownloadOptions {
  json?: boolean;
  source?: string;
  output?: string;
}

export async function downloadCommand(
  keyword: string,
  opts: DownloadOptions,
): Promise<void> {
  try {
    const sources = opts.source ? [opts.source as SourceName] : undefined;
    const songs = await searchAll(keyword, sources, 5);
    if (songs.length === 0) throw new Error(`No songs found for: ${keyword}`);

    // Try songs in order until one successfully downloads (smart fallback)
    let lastError = '';
    for (const song of songs) {
      try {
        const outputDir = opts.output ?? join(process.env.HOME ?? '.', 'Music');

        if (!opts.json) {
          console.log(`Downloading: ${song.name} - ${song.artist} [${song.source}]`);
        }

        const filepath = await downloadSong(song, outputDir, (p) => {
          if (!opts.json) {
            process.stdout.write(`\r  ${p.percent}% (${(p.downloaded / 1024 / 1024).toFixed(1)}MB)`);
          }
        });

        if (!opts.json) {
          process.stdout.write('\n');
          console.log(`Saved to: ${filepath}`);
        } else {
          console.log(JSON.stringify(success({ song, filepath }), null, 2));
        }
        return; // success
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (!opts.json) {
          console.log(`  Failed from ${song.source}, trying next...`);
        }
        continue;
      }
    }

    throw new Error(`All sources failed. Last error: ${lastError}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      console.log(JSON.stringify(fail(msg)));
    } else {
      console.error('Error:', msg);
    }
    process.exit(1);
  }
}
