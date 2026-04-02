import { describe, it, expect, vi, beforeEach } from 'vitest';
import { register } from '../src/providers/registry.js';
import { MusicProvider, Song } from '../src/providers/types.js';

let output: string[] = [];
const origLog = console.log;

function makeSong(id: string, source: string, name: string): Song {
  return { id, source: source as any, name, artist: 'Artist', duration: 200 };
}

describe('searchCommand', () => {
  beforeEach(() => {
    output = [];
    console.log = (...args: any[]) => output.push(args.map(String).join(' '));

    const provider: MusicProvider = {
      name: 'kuwo',
      search: async () => [makeSong('1', 'kuwo', '晴天')],
      getSongUrl: async () => 'https://example.com/1.mp3',
      getLyrics: async () => '',
    };
    register(provider);
  });

  afterEach(() => {
    console.log = origLog;
  });

  it('outputs JSON format', async () => {
    const { searchCommand } = await import('../src/commands/search.js');
    await searchCommand('晴天', { json: true, limit: '5' });

    const parsed = JSON.parse(output.join(''));
    expect(parsed.ok).toBe(true);
    expect(parsed.data.songs.length).toBeGreaterThan(0);
    expect(parsed.data.songs[0].name).toBe('晴天');
  });

  it('outputs human readable format', async () => {
    const { searchCommand } = await import('../src/commands/search.js');
    await searchCommand('晴天', { limit: '5' });

    const out = output.join('\n');
    expect(out).toContain('晴天');
    expect(out).toContain('kuwo');
  });

  it('shows no results message', async () => {
    const emptyProvider: MusicProvider = {
      name: 'kuwo',
      search: async () => [],
      getSongUrl: async () => '',
      getLyrics: async () => '',
    };
    register(emptyProvider);

    const { searchCommand } = await import('../src/commands/search.js');
    await searchCommand('xxxxxxxxx', { json: true, limit: '5' });

    const parsed = JSON.parse(output.join(''));
    expect(parsed.ok).toBe(true);
    expect(parsed.data.songs).toHaveLength(0);
  });
});
