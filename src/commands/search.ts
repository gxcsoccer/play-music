import { searchAll } from '../providers/registry.js';
import { SourceName, success, fail } from '../providers/types.js';
import { formatDuration, truncate } from '../utils/format.js';

interface SearchOptions {
  json?: boolean;
  source?: string;
  limit?: string;
}

export async function searchCommand(
  keyword: string,
  opts: SearchOptions,
): Promise<void> {
  const sources = opts.source
    ? (opts.source.split(',') as SourceName[])
    : undefined;
  const limit = opts.limit ? parseInt(opts.limit, 10) : 20;

  try {
    const songs = await searchAll(keyword, sources, limit);

    if (opts.json) {
      console.log(JSON.stringify(success({ songs }), null, 2));
      return;
    }

    if (songs.length === 0) {
      console.log('No results found.');
      return;
    }

    // table output for humans
    const header = `${'#'.padStart(3)}  ${'Song'.padEnd(30)}  ${'Artist'.padEnd(20)}  ${'Album'.padEnd(20)}  ${'Time'.padEnd(5)}  Source`;
    console.log(header);
    console.log('-'.repeat(header.length));

    songs.forEach((song, i) => {
      const idx = String(i + 1).padStart(3);
      const name = truncate(song.name, 30).padEnd(30);
      const artist = truncate(song.artist, 20).padEnd(20);
      const album = truncate(song.album ?? '', 20).padEnd(20);
      const dur = formatDuration(song.duration).padEnd(5);
      console.log(`${idx}  ${name}  ${artist}  ${album}  ${dur}  ${song.source}`);
    });

    console.log(`\nTotal: ${songs.length} songs`);
  } catch (err) {
    if (opts.json) {
      console.log(
        JSON.stringify(fail(err instanceof Error ? err.message : String(err))),
      );
    } else {
      console.error('Search failed:', err instanceof Error ? err.message : err);
    }
    process.exit(1);
  }
}
