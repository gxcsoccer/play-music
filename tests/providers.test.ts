import { describe, it, expect, vi, beforeEach } from 'vitest';
import { kuwoProvider } from '../src/providers/kuwo.js';
import { qqProvider } from '../src/providers/qq.js';
import { kugouProvider } from '../src/providers/kugou.js';
import { neteaseProvider } from '../src/providers/netease.js';
import { Song } from '../src/providers/types.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: any, headers?: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('kuwo provider', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('has correct name', () => {
    expect(kuwoProvider.name).toBe('kuwo');
  });

  it('search returns songs', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      abslist: [
        {
          MUSICRID: 'MUSIC_123',
          SONGNAME: '晴天',
          ARTIST: '周杰伦',
          ALBUM: '叶惠美',
          DURATION: '269',
          hts_MVPIC: 'https://img.kuwo.cn/cover.jpg',
          MINFO: 'bitrate:320',
        },
        {
          MUSICRID: 'MUSIC_456',
          SONGNAME: '稻香',
          ARTIST: '周杰伦',
          ALBUM: '魔杰座',
          DURATION: '223',
          hts_MVPIC: '',
          MINFO: '',
        },
      ],
    }));

    const songs = await kuwoProvider.search('周杰伦', 10);
    expect(songs).toHaveLength(2);
    expect(songs[0]).toMatchObject({
      id: '123',
      source: 'kuwo',
      name: '晴天',
      artist: '周杰伦',
      album: '叶惠美',
      duration: 269,
    });
    expect(songs[1].id).toBe('456');
  });

  it('search returns empty on no results', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}));
    const songs = await kuwoProvider.search('nonexistent');
    expect(songs).toEqual([]);
  });

  it('getSongUrl tries multiple bitrates', async () => {
    // First bitrate fails
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }));
    // Second bitrate succeeds
    mockFetch.mockResolvedValueOnce(jsonResponse({
      data: { url: 'https://mobi.kuwo.cn/song.mp3' },
    }));

    const song: Song = { id: '123', source: 'kuwo', name: 'Test', artist: 'Test', duration: 200 };
    const url = await kuwoProvider.getSongUrl(song);
    expect(url).toBe('https://mobi.kuwo.cn/song.mp3');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('getSongUrl falls back to web API', async () => {
    // All mobile bitrates fail
    mockFetch.mockResolvedValue(jsonResponse({ data: {} }));
    // Override last call (web fallback) to succeed
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }));
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }));
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }));
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }));
    mockFetch.mockResolvedValueOnce(jsonResponse({
      data: { url: 'https://web.kuwo.cn/fallback.mp3' },
    }));

    const song: Song = { id: '123', source: 'kuwo', name: 'Test', artist: 'Test', duration: 200 };
    const url = await kuwoProvider.getSongUrl(song);
    expect(url).toBe('https://web.kuwo.cn/fallback.mp3');
  });

  it('getLyrics parses timestamps', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      data: {
        lrclist: [
          { time: '1.5', lineLyric: 'Hello' },
          { time: '65.0', lineLyric: 'World' },
        ],
      },
    }));

    const song: Song = { id: '123', source: 'kuwo', name: 'Test', artist: 'Test', duration: 200 };
    const lrc = await kuwoProvider.getLyrics(song);
    expect(lrc).toContain('[00:01.50]Hello');
    expect(lrc).toContain('[01:05.00]World');
  });

  it('getLyrics returns empty when no lyrics', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }));
    const song: Song = { id: '123', source: 'kuwo', name: 'Test', artist: 'Test', duration: 200 };
    const lrc = await kuwoProvider.getLyrics(song);
    expect(lrc).toBe('');
  });
});

describe('qq provider', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('has correct name', () => {
    expect(qqProvider.name).toBe('qq');
  });

  it('search returns songs', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      data: {
        song: {
          list: [
            {
              songmid: 'mid123',
              songname: '晴天',
              singer: [{ name: '周杰伦' }],
              albumname: '叶惠美',
              interval: 269,
              albummid: 'alb123',
            },
          ],
        },
      },
    }));

    const songs = await qqProvider.search('周杰伦', 5);
    expect(songs).toHaveLength(1);
    expect(songs[0]).toMatchObject({
      id: 'mid123',
      source: 'qq',
      name: '晴天',
      artist: '周杰伦',
      duration: 269,
    });
  });

  it('search returns empty on no data', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { song: { list: [] } } }));
    const songs = await qqProvider.search('nonexistent');
    expect(songs).toEqual([]);
  });
});

describe('kugou provider', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('has correct name', () => {
    expect(kugouProvider.name).toBe('kugou');
  });

  it('search returns songs', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      data: {
        lists: [
          {
            Audioid: 12345,
            Scid: '',
            SongName: '晴天',
            SingerName: '周杰伦',
            AlbumName: '叶惠美',
            Duration: 269,
            AlbumID: '111',
            FileHash: 'abc123',
          },
        ],
      },
    }));

    const songs = await kugouProvider.search('周杰伦', 5);
    expect(songs).toHaveLength(1);
    expect(songs[0]).toMatchObject({
      id: '12345',
      source: 'kugou',
      name: '晴天',
      artist: '周杰伦',
    });
  });
});

describe('netease provider', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('has correct name', () => {
    expect(neteaseProvider.name).toBe('netease');
  });

  it('search returns songs', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      result: {
        songs: [
          {
            id: 123,
            name: '晴天',
            ar: [{ name: '周杰伦' }],
            al: { name: '叶惠美', picUrl: 'https://img.com/cover.jpg' },
            dt: 269000, // milliseconds
          },
        ],
      },
    }));

    const songs = await neteaseProvider.search('周杰伦', 5);
    expect(songs).toHaveLength(1);
    expect(songs[0]).toMatchObject({
      id: '123',
      source: 'netease',
      name: '晴天',
      artist: '周杰伦',
      duration: 269,
    });
  });
});
