import { success, fail } from '../providers/types.js';
import { getProvider } from '../providers/registry.js';
import { readState } from '../player/daemon.js';
import { parseLRC } from '../player/lyrics.js';
import { isMpvRunning } from '../player/mpv.js';

export async function lyricCommand(opts: { json?: boolean }): Promise<void> {
  const state = readState();
  if (!state.song) {
    if (opts.json) {
      console.log(JSON.stringify(fail('No song is playing')));
    } else {
      console.log('No song is playing.');
    }
    return;
  }

  try {
    const provider = getProvider(state.song.source);
    if (!provider) throw new Error(`Provider ${state.song.source} not found`);

    const lrc = await provider.getLyrics(state.song);

    if (opts.json) {
      const lines = parseLRC(lrc);
      console.log(
        JSON.stringify(
          success({
            song: { name: state.song.name, artist: state.song.artist },
            lrc,
            lines,
          }),
          null,
          2,
        ),
      );
    } else {
      if (!lrc) {
        console.log('No lyrics available.');
        return;
      }
      console.log(`♪ ${state.song.name} - ${state.song.artist}\n`);
      console.log(lrc);
    }
  } catch (err) {
    if (opts.json) {
      console.log(JSON.stringify(fail(err instanceof Error ? err.message : String(err))));
    } else {
      console.error('Error:', err instanceof Error ? err.message : err);
    }
    process.exit(1);
  }
}
