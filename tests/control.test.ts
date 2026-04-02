import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer, Server, Socket } from 'node:net';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TEST_DIR = join(tmpdir(), `play-music-ctrl-test-${process.pid}`);
const STATE_DIR = join(TEST_DIR, '.play-music');
const STATE_FILE = join(STATE_DIR, 'state.json');
const SOCKET_PATH = join(STATE_DIR, 'mpv.sock');

vi.stubEnv('HOME', TEST_DIR);

// Mock console.log to capture output
let output: string[] = [];
const originalLog = console.log;
const originalError = console.error;

describe('control commands', () => {
  let server: Server;
  let serverSocket: Socket | null = null;
  let mpvState: Record<string, any> = {};

  beforeEach(async () => {
    output = [];
    console.log = (...args: any[]) => output.push(args.map(String).join(' '));
    console.error = (...args: any[]) => output.push(args.map(String).join(' '));

    mkdirSync(STATE_DIR, { recursive: true });

    mpvState = { pause: false, volume: 80, 'loop-file': 'no' };

    // Write initial state
    writeFileSync(STATE_FILE, JSON.stringify({
      song: { id: '123', source: 'kuwo', name: 'Test', artist: 'Artist', duration: 200 },
      playlist: [{ id: '123', source: 'kuwo', name: 'Test', artist: 'Artist', duration: 200 }],
      currentIndex: 0,
      volume: 80,
    }));

    // Create mock mpv server
    server = createServer((socket) => {
      serverSocket = socket;
      socket.setEncoding('utf-8');
      socket.on('data', (data: string) => {
        for (const line of data.toString().split('\n')) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.command[0] === 'get_property') {
              socket.write(JSON.stringify({
                data: mpvState[msg.command[1]] ?? null,
                request_id: msg.request_id,
                error: 'success',
              }) + '\n');
            } else if (msg.command[0] === 'set_property') {
              mpvState[msg.command[1]] = msg.command[2];
              socket.write(JSON.stringify({
                data: null,
                request_id: msg.request_id,
                error: 'success',
              }) + '\n');
            } else {
              socket.write(JSON.stringify({
                data: null,
                request_id: msg.request_id,
                error: 'success',
              }) + '\n');
            }
          } catch {}
        }
      });
    });

    await new Promise<void>(r => server.listen(SOCKET_PATH, r));
  });

  afterEach(async () => {
    console.log = originalLog;
    console.error = originalError;
    serverSocket?.destroy();
    await new Promise<void>(r => server.close(() => r()));
    try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
  });

  it('pauseCommand sets pause to true', async () => {
    const { pauseCommand } = await import('../src/commands/control.js');
    await pauseCommand();
    expect(mpvState.pause).toBe(true);
    expect(output.some(o => o.includes('paused'))).toBe(true);
  });

  it('resumeCommand sets pause to false', async () => {
    mpvState.pause = true;
    const { resumeCommand } = await import('../src/commands/control.js');
    await resumeCommand();
    expect(mpvState.pause).toBe(false);
    expect(output.some(o => o.includes('resumed'))).toBe(true);
  });

  it('volumeCommand sets volume', async () => {
    const { volumeCommand } = await import('../src/commands/control.js');
    await volumeCommand('60');
    expect(mpvState.volume).toBe(60);
    expect(output.some(o => o.includes('60'))).toBe(true);
  });

  it('repeatCommand cycles modes', async () => {
    const { repeatCommand } = await import('../src/commands/control.js');

    await repeatCommand();
    expect(output.some(o => o.includes('one') || o.includes('Single'))).toBe(true);

    output = [];
    await repeatCommand();
    expect(output.some(o => o.includes('all') || o.includes('Playlist'))).toBe(true);

    output = [];
    await repeatCommand();
    expect(output.some(o => o.includes('off') || o.includes('Repeat off'))).toBe(true);
  });

  it('repeatCommand accepts explicit mode', async () => {
    const { repeatCommand } = await import('../src/commands/control.js');
    await repeatCommand('all');
    expect(output.some(o => o.includes('all') || o.includes('Playlist'))).toBe(true);
  });

  it('seekCommand sends seek command', async () => {
    const { seekCommand } = await import('../src/commands/control.js');
    await seekCommand('+10');
    expect(output.some(o => o.includes('10'))).toBe(true);
  });
});
