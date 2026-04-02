import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { register } from '../src/providers/registry.js';
import { MusicProvider, Song } from '../src/providers/types.js';

const TEST_DIR = join(tmpdir(), `play-music-dl-test-${process.pid}`);

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('downloadSong', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mkdirSync(TEST_DIR, { recursive: true });

    // Register a mock provider that returns a URL
    const provider: MusicProvider = {
      name: 'kuwo',
      search: async () => [],
      getSongUrl: async () => 'https://example.com/song.mp3',
      getLyrics: async () => '',
    };
    register(provider);
  });

  afterEach(() => {
    try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
  });

  it('downloads file and returns path', async () => {
    const content = Buffer.from('fake mp3 content');
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(content);
        controller.close();
      },
    });

    mockFetch.mockResolvedValueOnce(new Response(stream, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(content.length),
      },
    }));

    const { downloadSong } = await import('../src/download/downloader.js');
    const song: Song = { id: '1', source: 'kuwo', name: '晴天', artist: '周杰伦', duration: 269 };

    const filepath = await downloadSong(song, TEST_DIR);
    expect(existsSync(filepath)).toBe(true);
    expect(filepath).toContain('周杰伦 - 晴天.mp3');
    expect(readFileSync(filepath).toString()).toBe('fake mp3 content');
  });

  it('reports progress', async () => {
    const chunk1 = Buffer.from('chunk1');
    const chunk2 = Buffer.from('chunk2');
    const total = chunk1.length + chunk2.length;

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(chunk1);
        controller.enqueue(chunk2);
        controller.close();
      },
    });

    mockFetch.mockResolvedValueOnce(new Response(stream, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(total),
      },
    }));

    const { downloadSong } = await import('../src/download/downloader.js');
    const song: Song = { id: '2', source: 'kuwo', name: 'Test', artist: 'Artist', duration: 100 };

    const progress: number[] = [];
    await downloadSong(song, TEST_DIR, (p) => progress.push(p.percent));
    expect(progress.length).toBeGreaterThan(0);
    expect(progress[progress.length - 1]).toBe(100);
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 403 }));

    const { downloadSong } = await import('../src/download/downloader.js');
    const song: Song = { id: '3', source: 'kuwo', name: 'Test', artist: 'Artist', duration: 100 };

    await expect(downloadSong(song, TEST_DIR)).rejects.toThrow('HTTP 403');
  });

  it('detects flac from content-type', async () => {
    const content = Buffer.from('fake flac');
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(content); controller.close(); },
    });

    mockFetch.mockResolvedValueOnce(new Response(stream, {
      headers: { 'Content-Type': 'audio/flac', 'Content-Length': String(content.length) },
    }));

    const { downloadSong } = await import('../src/download/downloader.js');
    const song: Song = { id: '4', source: 'kuwo', name: 'Test', artist: 'Artist', duration: 100 };

    const filepath = await downloadSong(song, TEST_DIR);
    expect(filepath).toContain('.flac');
  });
});
