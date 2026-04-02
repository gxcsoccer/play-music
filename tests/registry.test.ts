import { describe, it, expect, beforeEach } from 'vitest';
import { register, getProvider, getAllProviders, getSourceNames, searchAll } from '../src/providers/registry.js';
import { MusicProvider, Song } from '../src/providers/types.js';

function makeMockProvider(name: string, songs: Song[]): MusicProvider {
  return {
    name: name as any,
    search: async (_keyword: string, _limit?: number) => songs,
    getSongUrl: async (song: Song) => `https://example.com/${song.id}.mp3`,
    getLyrics: async () => '',
  };
}

function makeSong(id: string, source: string, name: string): Song {
  return { id, source: source as any, name, artist: 'Artist', duration: 200 };
}

describe('provider registry', () => {
  it('registers and retrieves a provider', () => {
    const provider = makeMockProvider('kuwo', []);
    register(provider);
    expect(getProvider('kuwo')).toBe(provider);
  });

  it('returns undefined for unregistered provider', () => {
    expect(getProvider('nonexistent' as any)).toBeUndefined();
  });

  it('getAllProviders returns all registered', () => {
    const providers = getAllProviders();
    expect(providers.length).toBeGreaterThan(0);
  });

  it('getSourceNames returns registered names', () => {
    const names = getSourceNames();
    expect(names).toContain('kuwo');
  });
});

describe('searchAll', () => {
  it('aggregates results from multiple sources', async () => {
    const p1 = makeMockProvider('kuwo', [makeSong('1', 'kuwo', 'Song A')]);
    const p2 = makeMockProvider('qq', [makeSong('2', 'qq', 'Song B')]);
    register(p1);
    register(p2);

    const results = await searchAll('test');
    const names = results.map(s => s.name);
    expect(names).toContain('Song A');
    expect(names).toContain('Song B');
  });

  it('filters by specific sources', async () => {
    const results = await searchAll('test', ['kuwo']);
    expect(results.every(s => s.source === 'kuwo')).toBe(true);
  });

  it('handles provider errors gracefully', async () => {
    const failingProvider: MusicProvider = {
      name: 'kugou',
      search: async () => { throw new Error('API down'); },
      getSongUrl: async () => '',
      getLyrics: async () => '',
    };
    register(failingProvider);

    // Should not throw, just skip the failed provider
    const results = await searchAll('test');
    expect(Array.isArray(results)).toBe(true);
  });
});
