import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer, Server, Socket } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { register } from '../src/providers/registry.js';
import { MusicProvider, Song } from '../src/providers/types.js';

const TEST_DIR = join(tmpdir(), `play-music-play-test-${process.pid}`);
const STATE_DIR = join(TEST_DIR, '.play-music');
const STATE_FILE = join(STATE_DIR, 'state.json');
const SOCKET_PATH = join(STATE_DIR, 'mpv.sock');

vi.stubEnv('HOME', TEST_DIR);

// Mock console
let output: string[] = [];
const origLog = console.log;
const origErr = console.error;

// Mock spawnMpv to not actually spawn mpv
vi.mock('../src/player/mpv.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/player/mpv.js')>();
  return {
    ...mod,
    spawnMpv: vi.fn(() => ({ unref: () => {} })),
    isMpvRunning: vi.fn(() => false),
  };
});

// Mock execSync for mpv check
vi.mock('node:child_process', async (importOriginal) => {
  const mod = await importOriginal<typeof import('node:child_process')>();
  return {
    ...mod,
    execSync: vi.fn((cmd: string) => {
      if (cmd === 'which mpv') return Buffer.from('/usr/local/bin/mpv');
      return mod.execSync(cmd);
    }),
  };
});

function makeSong(id: string, name: string): Song {
  return { id, source: 'kuwo', name, artist: '周杰伦', duration: 200 };
}

describe('play commands', () => {
  beforeEach(() => {
    output = [];
    console.log = (...args: any[]) => output.push(args.map(String).join(' '));
    console.error = (...args: any[]) => output.push(args.map(String).join(' '));

    mkdirSync(STATE_DIR, { recursive: true });

    // Register mock provider
    const provider: MusicProvider = {
      name: 'kuwo',
      search: async (keyword) => [
        makeSong('1', `${keyword} Song A`),
        makeSong('2', `${keyword} Song B`),
      ],
      getSongUrl: async (song) => `https://example.com/${song.id}.mp3`,
      getLyrics: async () => '[00:01.00]Hello',
    };
    register(provider);
  });

  afterEach(() => {
    console.log = origLog;
    console.error = origErr;
    try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
  });

  it('playCommand plays first matching song', async () => {
    const { playCommand } = await import('../src/commands/play.js');
    await playCommand('晴天', { json: true });

    const out = output.join('\n');
    expect(out).toContain('"action": "playing"');
    expect(out).toContain('Song A');
  });

  it('playCommand preserves volume from previous state', async () => {
    writeFileSync(STATE_FILE, JSON.stringify({
      song: null, playlist: [], currentIndex: -1, volume: 42, repeat: 'one',
    }));

    const { playCommand } = await import('../src/commands/play.js');
    await playCommand('test', { json: true });

    const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    expect(state.volume).toBe(42);
    expect(state.repeat).toBe('one');
  });

  it('queueCommand adds song to playlist', async () => {
    // Set up initial state with a playing song
    writeFileSync(STATE_FILE, JSON.stringify({
      song: makeSong('0', 'Current'),
      playlist: [makeSong('0', 'Current')],
      currentIndex: 0,
      volume: 80,
    }));

    // Mock isMpvRunning to return true for this test
    const mpvMod = await import('../src/player/mpv.js');
    vi.mocked(mpvMod.isMpvRunning).mockReturnValue(true);

    const { queueCommand } = await import('../src/commands/play.js');
    await queueCommand('稻香', { json: true });

    const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    expect(state.playlist).toHaveLength(2);
    expect(output.join('')).toContain('queued');
  });

  it('listCommand shows playlist', async () => {
    writeFileSync(STATE_FILE, JSON.stringify({
      song: makeSong('1', '晴天'),
      playlist: [makeSong('1', '晴天'), makeSong('2', '稻香')],
      currentIndex: 0,
      volume: 80,
      repeat: 'all',
    }));

    const { listCommand } = await import('../src/commands/play.js');
    await listCommand({ json: true });

    const parsed = JSON.parse(output.join(''));
    expect(parsed.ok).toBe(true);
    expect(parsed.data.playlist).toHaveLength(2);
    expect(parsed.data.repeat).toBe('all');
  });

  it('listCommand shows empty message', async () => {
    writeFileSync(STATE_FILE, JSON.stringify({
      song: null, playlist: [], currentIndex: -1, volume: 80,
    }));

    const { listCommand } = await import('../src/commands/play.js');
    await listCommand({});

    expect(output.join('')).toContain('empty');
  });

  it('clearCommand keeps current song', async () => {
    writeFileSync(STATE_FILE, JSON.stringify({
      song: makeSong('1', '晴天'),
      playlist: [makeSong('1', '晴天'), makeSong('2', '稻香'), makeSong('3', '七里香')],
      currentIndex: 0,
      volume: 80,
    }));

    const { clearCommand } = await import('../src/commands/play.js');
    await clearCommand();

    const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    expect(state.playlist).toHaveLength(1);
    expect(state.playlist[0].name).toBe('晴天');
    expect(state.currentIndex).toBe(0);
  });

  it('nextCommand with repeat:all wraps around', async () => {
    writeFileSync(STATE_FILE, JSON.stringify({
      song: makeSong('2', '稻香'),
      playlist: [makeSong('1', '晴天'), makeSong('2', '稻香')],
      currentIndex: 1,
      volume: 80,
      repeat: 'all',
    }));

    const { nextCommand } = await import('../src/commands/play.js');
    await nextCommand();

    const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    expect(state.currentIndex).toBe(0);
    expect(state.song.name).toBe('晴天');
  });

  it('prevCommand with repeat:all wraps around', async () => {
    writeFileSync(STATE_FILE, JSON.stringify({
      song: makeSong('1', '晴天'),
      playlist: [makeSong('1', '晴天'), makeSong('2', '稻香')],
      currentIndex: 0,
      volume: 80,
      repeat: 'all',
    }));

    const { prevCommand } = await import('../src/commands/play.js');
    await prevCommand();

    const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    expect(state.currentIndex).toBe(1);
    expect(state.song.name).toBe('稻香');
  });
});
