import { MusicProvider, Song } from './types.js';
import { sourceGet } from '../utils/http.js';

const SEARCH_URL = 'http://www.kuwo.cn/search/searchMusicBykeyWord';
const DOWNLOAD_URL = 'https://mobi.kuwo.cn/mobi.s';
const LYRICS_URL = 'http://m.kuwo.cn/newh5/singles/songinfoandlrc';

function buildSearchParams(keyword: string, limit: number): string {
  const params = new URLSearchParams({
    vipver: '1',
    client: 'kt',
    ft: 'music',
    cluster: '0',
    strategy: '2012',
    encoding: 'utf8',
    rformat: 'json',
    mobi: '1',
    issubtitle: '1',
    show_copyright_off: '1',
    pn: '0',
    rn: String(limit),
    all: keyword,
  });
  return params.toString();
}

function parseId(musicrid: string): string {
  return musicrid.replace(/^MUSIC_/, '');
}

function randomUser(): string {
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 1000000);
  return `C_APK_guanwang_${ts}${rand}`;
}

interface KuwoSearchItem {
  MUSICRID: string;
  SONGNAME: string;
  ARTIST: string;
  ALBUM: string;
  DURATION: string;
  hts_MVPIC: string;
  MINFO: string;
  bitSwitch: number;
}

interface KuwoSearchResponse {
  abslist?: KuwoSearchItem[];
}

interface KuwoDownloadResponse {
  data?: {
    url?: string;
  };
}

interface KuwoLyricsResponse {
  data?: {
    lrclist?: Array<{
      time: string;
      lineLyric: string;
    }>;
  };
}

export const kuwoProvider: MusicProvider = {
  name: 'kuwo',

  async search(keyword: string, limit = 20): Promise<Song[]> {
    const url = `${SEARCH_URL}?${buildSearchParams(keyword, limit)}`;
    const res = await sourceGet('kuwo', url);
    const json = (await res.json()) as KuwoSearchResponse;

    if (!json.abslist) return [];

    return json.abslist.map(item => ({
        id: parseId(item.MUSICRID),
        source: 'kuwo' as const,
        name: item.SONGNAME,
        artist: item.ARTIST,
        album: item.ALBUM,
        duration: parseInt(item.DURATION, 10) || 0,
        cover: item.hts_MVPIC || undefined,
        extra: { minfo: item.MINFO },
      }));
  },

  async getSongUrl(song: Song): Promise<string> {
    const bitrates = ['320kmp3', '128kmp3', 'flac', '2000kflac'];

    for (const br of bitrates) {
      const params = new URLSearchParams({
        f: 'web',
        source: 'kwplayercar_ar_6.0.0.9_B_jiakong_vh.apk',
        from: 'PC',
        type: 'convert_url_with_sign',
        br,
        rid: song.id,
        user: randomUser(),
      });
      const url = `${DOWNLOAD_URL}?${params.toString()}`;
      try {
        const res = await sourceGet('kuwo', url);
        const json = (await res.json()) as KuwoDownloadResponse;
        if (json.data?.url) return json.data.url;
      } catch {
        continue;
      }
    }

    // fallback
    const fallbackUrl = `http://www.kuwo.cn/api/v1/www/music/playUrl?mid=${song.id}&type=music&httpsStatus=1`;
    const res = await sourceGet('kuwo', fallbackUrl, {
      Secret: 'kuwo_web_secret',
    });
    const json = (await res.json()) as KuwoDownloadResponse;
    if (json.data?.url) return json.data.url;

    throw new Error('download url not found (copyright restricted)');
  },

  async getLyrics(song: Song): Promise<string> {
    const url = `${LYRICS_URL}?musicId=${song.id}`;
    const res = await sourceGet('kuwo', url);
    const json = (await res.json()) as KuwoLyricsResponse;

    if (!json.data?.lrclist?.length) return '';

    return json.data.lrclist
      .map(item => {
        const totalSeconds = parseFloat(item.time);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const mm = String(minutes).padStart(2, '0');
        const ss = seconds.toFixed(2).padStart(5, '0');
        return `[${mm}:${ss}]${item.lineLyric}`;
      })
      .join('\n');
  },
};
