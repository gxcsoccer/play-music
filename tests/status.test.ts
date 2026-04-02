import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer, Server, Socket } from 'node:net';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TEST_DIR = join(tmpdir(), `play-music-status-test-${process.pid}`);
const STATE_DIR = join(TEST_DIR, '.play-music');
const STATE_FILE = join(STATE_DIR, 'state.json');
const SOCKET_PATH = join(STATE_DIR, 'mpv.sock');

vi.stubEnv('HOME', TEST_DIR);

let output: string[] = [];
const origLog = console.log;

describe('statusCommand', () => {
  let server: Server;
  let serverSocket: Socket | null = null;

  beforeEach(async () => {
    output = [];
    console.log = (...args: any[]) => output.push(args.map(String).join(' '));

    mkdirSync(STATE_DIR, { recursive: true });

    writeFileSync(STATE_FILE, JSON.stringify({
      song: { id: '123', source: 'kuwo', name: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269 },
      playlist: [{ id: '123', source: 'kuwo', name: '晴天', artist: '周杰伦', duration: 269 }],
      currentIndex: 0,
      volume: 80,
    }));

    server = createServer((socket) => {
      serverSocket = socket;
      socket.setEncoding('utf-8');
      socket.on('data', (data: string) => {
        for (const line of data.toString().split('\n')) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            const vals: Record<string, any> = {
              'time-pos': 45.2,
              duration: 269,
              pause: false,
              volume: 80,
            };
            socket.write(JSON.stringify({
              data: vals[msg.command[1]] ?? null,
              request_id: msg.request_id,
              error: 'success',
            }) + '\n');
          } catch {}
        }
      });
    });

    await new Promise<void>(r => server.listen(SOCKET_PATH, r));
  });

  afterEach(async () => {
    console.log = origLog;
    serverSocket?.destroy();
    await new Promise<void>(r => server.close(() => r()));
    try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
  });

  it('returns status as JSON', async () => {
    const { statusCommand } = await import('../src/commands/status.js');
    await statusCommand({ json: true });

    const parsed = JSON.parse(output.join(''));
    expect(parsed.ok).toBe(true);
    expect(parsed.data.song.name).toBe('晴天');
    expect(parsed.data.position).toBe(45);
    expect(parsed.data.duration).toBe(269);
    expect(parsed.data.paused).toBe(false);
    expect(parsed.data.volume).toBe(80);
  });

  it('returns human-readable status', async () => {
    const { statusCommand } = await import('../src/commands/status.js');
    await statusCommand({});

    const out = output.join('\n');
    expect(out).toContain('晴天');
    expect(out).toContain('周杰伦');
    expect(out).toContain('00:45');
  });

  it('shows not playing when socket missing', async () => {
    serverSocket?.destroy();
    await new Promise<void>(r => server.close(() => r()));
    rmSync(SOCKET_PATH, { force: true });

    const { statusCommand } = await import('../src/commands/status.js');
    await statusCommand({ json: true });

    const parsed = JSON.parse(output.join(''));
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('not running');
  });
});
