import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer, Server, Socket } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { unlinkSync, existsSync } from 'node:fs';
import { MpvIPC, isMpvRunning } from '../src/player/mpv.js';

const TEST_SOCKET = join(tmpdir(), `mpv-test-${process.pid}.sock`);

describe('MpvIPC', () => {
  let server: Server;
  let serverSocket: Socket | null = null;

  beforeEach(async () => {
    // Create a mock mpv IPC server
    server = createServer((socket) => {
      serverSocket = socket;
      socket.setEncoding('utf-8');
      socket.on('data', (data: string) => {
        for (const line of data.toString().split('\n')) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            const { command, request_id } = msg;

            if (command[0] === 'get_property') {
              const prop = command[1];
              const values: Record<string, any> = {
                'time-pos': 42.5,
                'duration': 269,
                'pause': false,
                'volume': 80,
              };
              socket.write(JSON.stringify({
                data: values[prop] ?? null,
                request_id,
                error: 'success',
              }) + '\n');
            } else if (command[0] === 'set_property') {
              socket.write(JSON.stringify({
                data: null,
                request_id,
                error: 'success',
              }) + '\n');
            } else {
              socket.write(JSON.stringify({
                data: null,
                request_id,
                error: 'success',
              }) + '\n');
            }
          } catch {}
        }
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(TEST_SOCKET, resolve);
    });
  });

  afterEach(async () => {
    serverSocket?.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try { unlinkSync(TEST_SOCKET); } catch {}
  });

  it('connects to mpv socket', async () => {
    const mpv = new MpvIPC();
    await mpv.connect(TEST_SOCKET);
    mpv.disconnect();
  });

  it('gets property values', async () => {
    const mpv = new MpvIPC();
    await mpv.connect(TEST_SOCKET);

    const pos = await mpv.getProperty('time-pos');
    expect(pos).toBe(42.5);

    const dur = await mpv.getProperty('duration');
    expect(dur).toBe(269);

    const paused = await mpv.getProperty('pause');
    expect(paused).toBe(false);

    const vol = await mpv.getProperty('volume');
    expect(vol).toBe(80);

    mpv.disconnect();
  });

  it('sets property values', async () => {
    const mpv = new MpvIPC();
    await mpv.connect(TEST_SOCKET);
    await expect(mpv.setProperty('pause', true)).resolves.toBeUndefined();
    mpv.disconnect();
  });

  it('sends commands', async () => {
    const mpv = new MpvIPC();
    await mpv.connect(TEST_SOCKET);
    await expect(mpv.command(['seek', 10, 'absolute'])).resolves.toBeDefined();
    mpv.disconnect();
  });

  it('handles multiple concurrent commands', async () => {
    const mpv = new MpvIPC();
    await mpv.connect(TEST_SOCKET);

    const [pos, dur, paused, vol] = await Promise.all([
      mpv.getProperty('time-pos'),
      mpv.getProperty('duration'),
      mpv.getProperty('pause'),
      mpv.getProperty('volume'),
    ]);

    expect(pos).toBe(42.5);
    expect(dur).toBe(269);
    expect(paused).toBe(false);
    expect(vol).toBe(80);

    mpv.disconnect();
  });

  it('throws when not connected', async () => {
    const mpv = new MpvIPC();
    await expect(mpv.command(['quit'])).rejects.toThrow('Not connected');
  });

  it('handles connection error', async () => {
    const mpv = new MpvIPC();
    await expect(mpv.connect('/nonexistent/socket')).rejects.toThrow();
  });

  it('handles server error response', async () => {
    // Create a server that returns errors
    const errSocket = TEST_SOCKET + '.err';
    const errServer = createServer((socket) => {
      socket.setEncoding('utf-8');
      socket.on('data', (data: string) => {
        for (const line of data.toString().split('\n')) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            socket.write(JSON.stringify({
              data: null,
              request_id: msg.request_id,
              error: 'property not found',
            }) + '\n');
          } catch {}
        }
      });
    });

    await new Promise<void>(r => errServer.listen(errSocket, r));

    const mpv = new MpvIPC();
    await mpv.connect(errSocket);
    await expect(mpv.getProperty('nonexistent')).rejects.toThrow('property not found');
    mpv.disconnect();

    await new Promise<void>(r => errServer.close(() => r()));
    try { unlinkSync(errSocket); } catch {}
  });
});

describe('isMpvRunning', () => {
  it('returns false for non-existent socket', () => {
    expect(isMpvRunning('/tmp/nonexistent.sock')).toBe(false);
  });

  it('returns true for actual socket', () => {
    // The TEST_SOCKET is created by the server in the MpvIPC tests above,
    // but those are cleaned up. Create a fresh one.
    const sockPath = TEST_SOCKET + '.check';
    const srv = createServer(() => {});
    srv.listen(sockPath);
    expect(isMpvRunning(sockPath)).toBe(true);
    srv.close();
    try { unlinkSync(sockPath); } catch {}
  });
});
