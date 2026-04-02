import { MusicProvider, Song } from './types.js';

const SEARCH_URL = 'http://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp';
const MUSICU_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
const LYRIC_URL = 'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg';

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 9_1 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Version/9.0 Mobile/13B143 Safari/601.1';

function randomGuid(): string {
  return String(Math.floor(1000000000 + Math.random() * 9000000000));
}

interface QQSearchSinger {
  name: string;
}

interface QQSearchSong {
  songid: number;
  songname: string;
  songmid: string;
  albummid: string;
  albumname: string;
  interval: number;
  size128: number;
  size320: number;
  sizeflac: number;
  singer: QQSearchSinger[];
}

interface QQSearchResponse {
  data?: {
    song?: {
      list?: QQSearchSong[];
    };
  };
}

interface QQMusicuResponse {
  req_1?: {
    data?: {
      midurlinfo?: Array<{
        filename: string;
        purl: string;
      }>;
    };
  };
}

interface QQLyricResponse {
  retcode: number;
  lyric?: string;
}

export const qqProvider: MusicProvider = {
  name: 'qq',

  async search(keyword: string, limit = 20): Promise<Song[]> {
    const params = new URLSearchParams({
      w: keyword,
      format: 'json',
      p: '1',
      n: String(limit),
    });
    const res = await fetch(`${SEARCH_URL}?${params}`, {
      headers: { 'User-Agent': MOBILE_UA, Referer: 'http://m.y.qq.com' },
    });
    const json = (await res.json()) as QQSearchResponse;
    const list = json.data?.song?.list ?? [];

    return list.map(item => ({
      id: item.songmid,
      source: 'qq' as const,
      name: item.songname,
      artist: item.singer.map(s => s.name).join('/'),
      album: item.albumname,
      duration: item.interval,
      extra: {
        songid: item.songid,
        albummid: item.albummid,
        size128: item.size128,
        size320: item.size320,
        sizeflac: item.sizeflac,
      },
    }));
  },

  async getSongUrl(song: Song): Promise<string> {
    const guid = randomGuid();
    // try quality levels: M800 (320k) then M500 (128k)
    const prefixes = [
      { prefix: 'M800', ext: 'mp3' },
      { prefix: 'M500', ext: 'mp3' },
    ];

    for (const { prefix, ext } of prefixes) {
      const filename = `${prefix}${song.id}${song.id}.${ext}`;
      const body = {
        comm: {
          cv: 4747474,
          ct: 24,
          format: 'json',
          inCharset: 'utf-8',
          outCharset: 'utf-8',
          notice: 0,
          platform: 'yqq.json',
          needNewCode: 1,
          uin: 0,
        },
        req_1: {
          module: 'music.vkey.GetVkey',
          method: 'UrlGetVkey',
          param: {
            guid,
            songmid: [song.id],
            songtype: [0],
            uin: '0',
            loginflag: 1,
            platform: '20',
            filename: [filename],
          },
        },
      };

      try {
        const res = await fetch(MUSICU_URL, {
          method: 'POST',
          headers: {
            'User-Agent': MOBILE_UA,
            Referer: 'http://y.qq.com',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as QQMusicuResponse;
        const purl = json.req_1?.data?.midurlinfo?.[0]?.purl;
        if (purl) {
          return `https://ws.stream.qqmusic.qq.com/${purl}`;
        }
      } catch {
        continue;
      }
    }

    throw new Error('QQ Music: failed to get download URL');
  },

  async getLyrics(song: Song): Promise<string> {
    const params = new URLSearchParams({
      songmid: song.id,
      loginUin: '0',
      hostUin: '0',
      format: 'json',
      inCharset: 'utf8',
      outCharset: 'utf-8',
      notice: '0',
      platform: 'yqq.json',
      needNewCode: '0',
    });
    const res = await fetch(`${LYRIC_URL}?${params}`, {
      headers: {
        'User-Agent': MOBILE_UA,
        Referer: 'https://y.qq.com/portal/player.html',
      },
    });
    const text = await res.text();

    // handle JSONP wrapping
    let json: QQLyricResponse;
    try {
      json = JSON.parse(text);
    } catch {
      const match = text.match(/\((.+)\)/s);
      if (!match) return '';
      json = JSON.parse(match[1]);
    }

    if (!json.lyric) return '';
    return Buffer.from(json.lyric, 'base64').toString('utf-8');
  },
};
