import { searchAll, getProvider, getSourceNames } from '../providers/registry.js';
import { Song, SourceName, success, fail } from '../providers/types.js';
import { spawnMpv, connectMpv, isMpvRunning } from '../player/mpv.js';
import { readState, writeState, cleanupSocket, ensureStateDir, MPV_SOCKET } from '../player/daemon.js';
import { formatDuration } from '../utils/format.js';

async function stopCurrentMpv() {
  if (!isMpvRunning()) return;
  try {
    const mpv = await connectMpv();
    await mpv.command(['quit']);
    mpv.disconnect();
  } catch {
    // mpv may have already exited
  }
  cleanupSocket();
}

/**
 * Smart play: search all sources, try to get a playable URL.
 * Falls back across sources if one fails (e.g., VIP restriction).
 */
async function findPlayableSong(keyword: string, source?: string): Promise<{ song: Song; url: string }> {
  const sources = source ? [source as SourceName] : undefined;
  const songs = await searchAll(keyword, sources, 10);
  if (songs.length === 0) throw new Error(`No songs found for: ${keyword}`);

  // Group by unique song (name+artist), try each until we get a working URL
  const tried = new Set<string>();
  for (const song of songs) {
    const key = `${song.source}:${song.id}`;
    if (tried.has(key)) continue;
    tried.add(key);

    const provider = getProvider(song.source);
    if (!provider) continue;

    try {
      const url = await provider.getSongUrl(song);
      if (url) return { song, url };
    } catch {
      // This source failed (VIP, copyright, etc.), try next
      continue;
    }
  }

  throw new Error(`No playable source found for: ${keyword} (all sources failed or require VIP)`);
}

export async function playCommand(keyword: string, opts: { json?: boolean; source?: string }): Promise<void> {
  try {
    ensureStateDir();

    // check mpv exists
    const { execSync } = await import('node:child_process');
    try {
      execSync('which mpv', { stdio: 'ignore' });
    } catch {
      throw new Error('mpv not found. Install it with: brew install mpv');
    }

    const { song, url } = await findPlayableSong(keyword, opts.source);
    const prevState = readState();

    // stop any existing mpv
    await stopCurrentMpv();

    // spawn new mpv with preserved volume
    const vol = prevState.volume;
    spawnMpv(url, MPV_SOCKET, vol);

    // save state (preserve volume and repeat from previous session)
    writeState({
      song,
      playlist: [song],
      currentIndex: 0,
      volume: vol,
      repeat: prevState.repeat,
    });

    if (opts.json) {
      console.log(JSON.stringify(success({ action: 'playing', song }), null, 2));
    } else {
      console.log(`▶ Playing: ${song.name} - ${song.artist} [${song.source}]`);
    }
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

async function playSongAtIndex(state: ReturnType<typeof readState>, idx: number): Promise<void> {
  const song = state.playlist[idx];
  const provider = getProvider(song.source);
  if (!provider) throw new Error(`Provider ${song.source} not found`);

  const url = await provider.getSongUrl(song);
  await stopCurrentMpv();
  spawnMpv(url, MPV_SOCKET, state.volume);

  writeState({ ...state, song, currentIndex: idx });

  if (isTTY()) {
    console.log(`▶ Playing: ${song.name} - ${song.artist} [${song.source}]`);
  } else {
    console.log(JSON.stringify(success({ action: 'playing', song })));
  }
}

export async function nextCommand(): Promise<void> {
  try {
    const state = readState();
    const repeat = state.repeat ?? 'off';

    if (repeat === 'one') {
      // Replay current song
      await playSongAtIndex(state, state.currentIndex);
      return;
    }

    let nextIdx = state.currentIndex + 1;
    if (nextIdx >= state.playlist.length) {
      if (repeat === 'all') {
        nextIdx = 0; // Loop back to start
      } else {
        if (isTTY()) {
          console.log('No next song in playlist.');
        } else {
          console.log(JSON.stringify(fail('No next song in playlist')));
        }
        return;
      }
    }

    await playSongAtIndex(state, nextIdx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isTTY()) {
      console.error('Error:', msg);
    } else {
      console.log(JSON.stringify(fail(msg)));
    }
    process.exit(1);
  }
}

export async function prevCommand(): Promise<void> {
  try {
    const state = readState();
    const repeat = state.repeat ?? 'off';

    if (repeat === 'one') {
      await playSongAtIndex(state, state.currentIndex);
      return;
    }

    let prevIdx = state.currentIndex - 1;
    if (prevIdx < 0) {
      if (repeat === 'all') {
        prevIdx = state.playlist.length - 1; // Loop to end
      } else {
        if (isTTY()) {
          console.log('No previous song in playlist.');
        } else {
          console.log(JSON.stringify(fail('No previous song in playlist')));
        }
        return;
      }
    }

    await playSongAtIndex(state, prevIdx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isTTY()) {
      console.error('Error:', msg);
    } else {
      console.log(JSON.stringify(fail(msg)));
    }
    process.exit(1);
  }
}

function isTTY(): boolean {
  return process.stdout.isTTY === true;
}

export async function queueCommand(keyword: string, opts: { json?: boolean; source?: string }): Promise<void> {
  try {
    ensureStateDir();
    const { song, url } = await findPlayableSong(keyword, opts.source);

    const state = readState();
    const playlist = [...state.playlist, song];

    // If nothing is playing, start playing this song
    if (!state.song || !isMpvRunning()) {
      spawnMpv(url, MPV_SOCKET, state.volume);
      writeState({ ...state, song, playlist, currentIndex: playlist.length - 1 });
      if (opts.json) {
        console.log(JSON.stringify(success({ action: 'playing', song, queueLength: playlist.length })));
      } else {
        console.log(`▶ Playing: ${song.name} - ${song.artist} [${song.source}]`);
      }
    } else {
      writeState({ ...state, playlist });
      if (opts.json) {
        console.log(JSON.stringify(success({ action: 'queued', song, queueLength: playlist.length })));
      } else {
        console.log(`+ Queued: ${song.name} - ${song.artist} (#${playlist.length})`);
      }
    }
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

export async function listCommand(opts: { json?: boolean }): Promise<void> {
  const state = readState();

  if (opts.json) {
    console.log(JSON.stringify(success({
      playlist: state.playlist,
      currentIndex: state.currentIndex,
      repeat: state.repeat ?? 'off',
    })));
    return;
  }

  if (state.playlist.length === 0) {
    console.log('Playlist is empty.');
    return;
  }

  const repeatLabel = state.repeat === 'one' ? ' [🔂 single]' : state.repeat === 'all' ? ' [🔁 all]' : '';
  console.log(`Playlist (${state.playlist.length} songs)${repeatLabel}:\n`);

  for (let i = 0; i < state.playlist.length; i++) {
    const s = state.playlist[i];
    const marker = i === state.currentIndex ? '▶' : ' ';
    const dur = s.duration ? formatDuration(s.duration) : '--:--';
    console.log(`  ${marker} ${i + 1}. ${s.name} - ${s.artist}  ${dur}  [${s.source}]`);
  }
}

export async function clearCommand(): Promise<void> {
  const state = readState();
  const current = state.song;

  if (current) {
    // Keep current song, clear the rest
    writeState({ ...state, playlist: [current], currentIndex: 0 });
  } else {
    writeState({ ...state, playlist: [], currentIndex: -1 });
  }

  if (isTTY()) {
    console.log('Playlist cleared.');
  } else {
    console.log(JSON.stringify(success({ action: 'cleared' })));
  }
}
