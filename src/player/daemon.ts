import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { Song } from '../providers/types.js';

const STATE_DIR = `${process.env.HOME}/.play-music`;
const STATE_FILE = `${STATE_DIR}/state.json`;
export const MPV_SOCKET = `${STATE_DIR}/mpv.sock`;

export type RepeatMode = 'off' | 'one' | 'all';

export interface PlayState {
  song: Song | null;
  playlist: Song[];
  currentIndex: number;
  volume: number;
  repeat?: RepeatMode;
}

export function ensureStateDir() {
  mkdirSync(STATE_DIR, { recursive: true });
}

export function readState(): PlayState {
  try {
    const raw = readFileSync(STATE_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { song: null, playlist: [], currentIndex: -1, volume: 80 };
  }
}

export function writeState(state: PlayState) {
  ensureStateDir();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function cleanupSocket() {
  try {
    if (existsSync(MPV_SOCKET)) unlinkSync(MPV_SOCKET);
  } catch {
    // ignore
  }
}
