import { success, fail } from '../providers/types.js';
import { connectMpv } from '../player/mpv.js';
import { readState, writeState, cleanupSocket, RepeatMode } from '../player/daemon.js';

function isTTY(): boolean {
  return process.stdout.isTTY === true;
}

export async function pauseCommand(): Promise<void> {
  try {
    const mpv = await connectMpv();
    await mpv.setProperty('pause', true);
    mpv.disconnect();
    const state = readState();
    if (isTTY()) {
      console.log(`⏸ Paused: ${state.song?.name ?? 'unknown'} - ${state.song?.artist ?? ''}`);
    } else {
      console.log(JSON.stringify(success({ action: 'paused' })));
    }
  } catch {
    if (isTTY()) {
      console.error('Not playing.');
    } else {
      console.log(JSON.stringify(fail('mpv is not running')));
    }
    process.exit(1);
  }
}

export async function resumeCommand(): Promise<void> {
  try {
    const mpv = await connectMpv();
    await mpv.setProperty('pause', false);
    mpv.disconnect();
    const state = readState();
    if (isTTY()) {
      console.log(`▶ Resumed: ${state.song?.name ?? 'unknown'} - ${state.song?.artist ?? ''}`);
    } else {
      console.log(JSON.stringify(success({ action: 'resumed' })));
    }
  } catch {
    if (isTTY()) {
      console.error('Not playing.');
    } else {
      console.log(JSON.stringify(fail('mpv is not running')));
    }
    process.exit(1);
  }
}

export async function stopCommand(): Promise<void> {
  try {
    const mpv = await connectMpv();
    await mpv.command(['quit']);
    mpv.disconnect();
  } catch {
    // mpv may have already exited
  }
  cleanupSocket();
  writeState({ song: null, playlist: [], currentIndex: -1, volume: 80 });
  if (isTTY()) {
    console.log('⏹ Stopped.');
  } else {
    console.log(JSON.stringify(success({ action: 'stopped' })));
  }
}

export async function volumeCommand(level: string): Promise<void> {
  try {
    const vol = parseInt(level, 10);
    if (isNaN(vol) || vol < 0 || vol > 100) throw new Error('Volume must be 0-100');
    const mpv = await connectMpv();
    await mpv.setProperty('volume', vol);
    mpv.disconnect();
    const state = readState();
    writeState({ ...state, volume: vol });
    if (isTTY()) {
      console.log(`🔊 Volume: ${vol}%`);
    } else {
      console.log(JSON.stringify(success({ action: 'volume', volume: vol })));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isTTY()) {
      console.error(msg);
    } else {
      console.log(JSON.stringify(fail(msg)));
    }
    process.exit(1);
  }
}

const REPEAT_CYCLE: RepeatMode[] = ['off', 'one', 'all'];
const REPEAT_LABELS: Record<RepeatMode, string> = { off: 'Repeat off', one: '🔂 Single repeat', all: '🔁 Playlist repeat' };

export async function repeatCommand(mode?: string): Promise<void> {
  try {
    const state = readState();
    let newMode: RepeatMode;

    if (mode && REPEAT_CYCLE.includes(mode as RepeatMode)) {
      newMode = mode as RepeatMode;
    } else {
      // cycle: off → one → all → off
      const current = state.repeat ?? 'off';
      const idx = REPEAT_CYCLE.indexOf(current);
      newMode = REPEAT_CYCLE[(idx + 1) % REPEAT_CYCLE.length];
    }

    // Apply to mpv
    try {
      const mpv = await connectMpv();
      await mpv.setProperty('loop-file', newMode === 'one' ? 'inf' : 'no');
      mpv.disconnect();
    } catch {
      // mpv may not be running, just save state
    }

    writeState({ ...state, repeat: newMode });

    if (isTTY()) {
      console.log(REPEAT_LABELS[newMode]);
    } else {
      console.log(JSON.stringify(success({ action: 'repeat', mode: newMode })));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isTTY()) {
      console.error(msg);
    } else {
      console.log(JSON.stringify(fail(msg)));
    }
    process.exit(1);
  }
}

export async function seekCommand(target: string): Promise<void> {
  try {
    const mpv = await connectMpv();
    if (target.startsWith('+') || target.startsWith('-')) {
      await mpv.command(['seek', parseFloat(target), 'relative']);
    } else {
      await mpv.command(['seek', parseFloat(target), 'absolute']);
    }
    mpv.disconnect();
    if (isTTY()) {
      console.log(`⏩ Seek: ${target}s`);
    } else {
      console.log(JSON.stringify(success({ action: 'seeked', target })));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isTTY()) {
      console.error(msg);
    } else {
      console.log(JSON.stringify(fail(msg)));
    }
    process.exit(1);
  }
}
