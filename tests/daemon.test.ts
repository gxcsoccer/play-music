import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Use a temp dir for tests
const TEST_DIR = join(tmpdir(), `play-music-test-${process.pid}`);
const TEST_STATE_FILE = join(TEST_DIR, 'state.json');
const TEST_SOCKET = join(TEST_DIR, 'mpv.sock');

// Mock environment before importing
vi.stubEnv('HOME', TEST_DIR);

// Now import (they'll use the mocked HOME)
const daemon = await import('../src/player/daemon.js');

describe('daemon state management', () => {
  beforeEach(() => {
    mkdirSync(join(TEST_DIR, '.play-music'), { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {}
  });

  it('readState returns default when no file exists', () => {
    const state = daemon.readState();
    expect(state).toEqual({
      song: null,
      playlist: [],
      currentIndex: -1,
      volume: 80,
    });
  });

  it('writeState and readState roundtrip', () => {
    const state = {
      song: {
        id: '123',
        source: 'kuwo' as const,
        name: 'Test Song',
        artist: 'Test Artist',
        duration: 200,
      },
      playlist: [{
        id: '123',
        source: 'kuwo' as const,
        name: 'Test Song',
        artist: 'Test Artist',
        duration: 200,
      }],
      currentIndex: 0,
      volume: 60,
      repeat: 'one' as const,
    };

    daemon.writeState(state);
    const result = daemon.readState();
    expect(result.song?.name).toBe('Test Song');
    expect(result.volume).toBe(60);
    expect(result.repeat).toBe('one');
    expect(result.playlist).toHaveLength(1);
  });

  it('readState handles corrupted JSON', () => {
    const stateFile = join(TEST_DIR, '.play-music', 'state.json');
    writeFileSync(stateFile, 'not json!!!');
    const state = daemon.readState();
    expect(state.song).toBeNull();
    expect(state.volume).toBe(80);
  });

  it('ensureStateDir creates directory', () => {
    const dir = join(TEST_DIR, '.play-music');
    rmSync(dir, { recursive: true, force: true });
    daemon.ensureStateDir();
    expect(existsSync(dir)).toBe(true);
  });
});
