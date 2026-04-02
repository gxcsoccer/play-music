import { success, fail } from '../providers/types.js';
import { connectMpv, isMpvRunning } from '../player/mpv.js';
import { readState } from '../player/daemon.js';
import { formatDuration } from '../utils/format.js';

interface StatusData {
  song: { id: string; source: string; name: string; artist: string; album?: string } | null;
  position: number;
  duration: number;
  paused: boolean;
  volume: number;
  playlistLength: number;
  currentIndex: number;
}

export async function statusCommand(opts: { json?: boolean }): Promise<void> {
  if (!isMpvRunning()) {
    if (opts.json) {
      console.log(JSON.stringify(fail('mpv is not running')));
    } else {
      console.log('Not playing.');
    }
    return;
  }

  try {
    const mpv = await connectMpv();
    const state = readState();

    const [position, duration, paused, volume] = await Promise.all([
      mpv.getProperty('time-pos').catch(() => 0),
      mpv.getProperty('duration').catch(() => 0),
      mpv.getProperty('pause').catch(() => false),
      mpv.getProperty('volume').catch(() => 80),
    ]);

    mpv.disconnect();

    const data: StatusData = {
      song: state.song
        ? {
            id: state.song.id,
            source: state.song.source,
            name: state.song.name,
            artist: state.song.artist,
            album: state.song.album,
          }
        : null,
      position: Math.floor(position as number),
      duration: Math.floor(duration as number),
      paused: paused as boolean,
      volume: Math.floor(volume as number),
      playlistLength: state.playlist.length,
      currentIndex: state.currentIndex,
    };

    if (opts.json) {
      console.log(JSON.stringify(success(data), null, 2));
    } else {
      if (!data.song) {
        console.log('Not playing.');
        return;
      }
      const icon = data.paused ? '⏸' : '▶';
      const pos = formatDuration(data.position);
      const dur = formatDuration(data.duration);
      console.log(`${icon} ${data.song.name} - ${data.song.artist}`);
      console.log(`  ${pos} / ${dur}  Vol: ${data.volume}%`);
      if (data.playlistLength > 1) {
        console.log(`  Playlist: ${data.currentIndex + 1}/${data.playlistLength}`);
      }
    }
  } catch {
    if (opts.json) {
      console.log(JSON.stringify(fail('Failed to connect to mpv')));
    } else {
      console.log('Failed to get status.');
    }
  }
}
